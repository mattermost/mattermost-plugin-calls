// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"sync/atomic"
	"time"
	"unicode/utf8"

	"github.com/mattermost/mattermost-plugin-calls/server/batching"

	"github.com/mattermost/mattermost-plugin-calls/server/db"

	"github.com/mattermost/mattermost/server/public/model"
)

const (
	wsEventUserJoined                = "user_joined"
	wsEventUserLeft                  = "user_left"
	wsEventUserMuted                 = "user_muted"
	wsEventUserUnmuted               = "user_unmuted"
	wsEventCallStart                 = "call_start"
	wsEventCallState                 = "call_state"
	wsEventCallEnd                   = "call_end"
	wsEventJoin                      = "join"
	wsEventError                     = "error"
	wsEventCallHostChanged           = "call_host_changed"
	wsEventUserDismissedNotification = "user_dismissed_notification"

	wsReconnectionTimeout = 10 * time.Second
)

var (
	minMembersCountForBatching = 100
	maxJoinLeaveOpsBatchSize   = 1000

	joinLeaveBatchingInterval = time.Second

	newBatcher = batching.NewBatcher
)

type CallsClientJoinData struct {
	ChannelID string
	Title     string
	ThreadID  string
}

type callsJoinData struct {
	CallsClientJoinData
}

type WebSocketBroadcast struct {
	ChannelID           string
	UserID              string
	ConnectionID        string
	ReliableClusterSend bool
	OmitUsers           map[string]bool
	UserIDs             []string
}

func (wsb *WebSocketBroadcast) ToModel() *model.WebsocketBroadcast {
	if wsb == nil {
		return nil
	}

	return &model.WebsocketBroadcast{
		ChannelId:           wsb.ChannelID,
		UserId:              wsb.UserID,
		ConnectionId:        wsb.ConnectionID,
		ReliableClusterSend: wsb.ReliableClusterSend,
		OmitUsers:           wsb.OmitUsers,
	}
}

func (p *Plugin) publishWebSocketEvent(ev string, data map[string]interface{}, broadcast *WebSocketBroadcast) {
	botID := p.getBotID()
	// We don't want to expose to clients that the bot is in a call.
	if (ev == wsEventUserJoined || ev == wsEventUserLeft) && data["user_id"] == botID {
		return
	}

	// If broadcasting to a channel we need to also send to the bot since they
	// won't be in the channel.
	if botID != "" && broadcast != nil && broadcast.ChannelID != "" {
		if data == nil {
			data = map[string]interface{}{}
		}
		data["channelID"] = broadcast.ChannelID
		p.metrics.IncWebSocketEvent("out", ev)
		p.API.PublishWebSocketEvent(ev, data, &model.WebsocketBroadcast{
			UserId: botID,
		})

		// Prevent sending this event to the bot twice.
		if broadcast.OmitUsers == nil {
			broadcast.OmitUsers = map[string]bool{}
		}
		broadcast.OmitUsers[botID] = true
	}

	p.metrics.IncWebSocketEvent("out", ev)

	if broadcast != nil && len(broadcast.UserIDs) > 0 {
		for _, userID := range broadcast.UserIDs {
			if userID == botID {
				continue
			}
			broadcast.UserID = userID
			p.API.PublishWebSocketEvent(ev, data, broadcast.ToModel())
		}
		return
	}

	p.API.PublishWebSocketEvent(ev, data, broadcast.ToModel())
}

func (p *Plugin) handleClientMsg(us *session, msg clientMessage) error {
	p.metrics.IncWebSocketEvent("in", msg.Type)
	switch msg.Type {
	case clientMessageTypeMute, clientMessageTypeUnmute:
		state, err := p.lockCallReturnState(us.channelID)
		if err != nil {
			return fmt.Errorf("failed to lock call: %w", err)
		}
		defer p.unlockCall(us.channelID)
		if state == nil {
			return fmt.Errorf("no call ongoing")
		}
		session := state.sessions[us.originalConnID]
		if session == nil {
			return fmt.Errorf("user state is missing from call state")
		}
		session.Unmuted = msg.Type == clientMessageTypeUnmute

		if err := p.store.UpdateCallSession(session); err != nil {
			return fmt.Errorf("failed to update call session: %w", err)
		}

		evType := wsEventUserUnmuted
		if msg.Type == clientMessageTypeMute {
			evType = wsEventUserMuted
		}
		p.publishWebSocketEvent(evType, map[string]interface{}{
			"userID":     us.userID,
			"session_id": us.originalConnID,
		}, &WebSocketBroadcast{
			ChannelID:           us.channelID,
			ReliableClusterSend: true,
			UserIDs:             getUserIDsFromSessions(state.sessions),
		})
	default:
		return fmt.Errorf("invalid client message type %q", msg.Type)
	}

	return nil
}

func (p *Plugin) OnWebSocketDisconnect(connID, userID string) {
	if userID == "" {
		return
	}

	p.mut.RLock()
	us := p.sessions[connID]
	p.mut.RUnlock()
	if us != nil {
		if atomic.CompareAndSwapInt32(&us.wsClosed, 0, 1) {
			p.LogDebug("closing ws channel for session", "userID", userID, "connID", connID, "channelID", us.channelID)
			close(us.wsCloseCh)
		}
	}
}

func (p *Plugin) wsReader(us *session) {
	for {
		select {
		case msg, ok := <-us.wsMsgCh:
			if !ok {
				return
			}
			if err := p.handleClientMsg(us, msg); err != nil {
				p.LogError("handleClientMsg failed", "err", err.Error(), "connID", us.connID)
			}
		case <-us.leaveCh:
			return
		case <-us.wsCloseCh:
			return
		}
	}
}

func (p *Plugin) handleLeave(us *session, userID, connID, channelID string) error {
	p.LogDebug("handleLeave", "userID", userID, "connID", connID, "channelID", channelID)

	select {
	case <-us.leaveCh:
		p.LogDebug("user left call", "userID", userID, "connID", connID, "channelID", us.channelID)
	case <-us.wsCloseCh:
		// Wait for potential reconnection
		select {
		case <-us.wsReconnectCh:
			p.LogDebug("reconnected, returning", "userID", userID, "connID", connID, "channelID", channelID)
			p.mut.Lock()
			delete(p.sessions, connID)
			p.mut.Unlock()
			return nil
		case <-time.After(wsReconnectionTimeout):
			p.LogDebug("timeout waiting for reconnection", "userID", userID, "connID", connID, "channelID", channelID)
		}
	}

	if err := p.removeSession(us); err != nil {
		p.LogError(err.Error())
	}

	return nil
}

func (p *Plugin) handleJoin(userID, connID string, joinData callsJoinData) (retErr error) {
	channelID := joinData.ChannelID
	p.LogDebug("handleJoin", "userID", userID, "connID", connID, "channelID", channelID)

	// Verify channel permission
	if !(p.isBot(userID) || p.API.HasPermissionToChannel(userID, channelID, model.PermissionCreatePost)) {
		return fmt.Errorf("forbidden")
	}

	channel, appErr := p.API.GetChannel(channelID)
	if appErr != nil {
		return appErr
	}
	if channel.DeleteAt > 0 {
		return fmt.Errorf("cannot join call in archived channel")
	}
	channelStats, appErr := p.API.GetChannelStats(channelID)
	if appErr != nil {
		return appErr
	}

	if joinData.ThreadID != "" {
		post, appErr := p.API.GetPost(joinData.ThreadID)
		if appErr != nil {
			return appErr
		}

		if post.ChannelId != channelID {
			return fmt.Errorf("forbidden")
		}

		if post.DeleteAt > 0 {
			return fmt.Errorf("cannot attach call to deleted thread")
		}

		if post.RootId != "" {
			return fmt.Errorf("thread is not a root post")
		}
	}

	callsChannel, err := p.store.GetCallsChannel(channelID, db.GetCallsChannelOpts{})
	if err != nil && !errors.Is(err, db.ErrNotFound) {
		return fmt.Errorf("failed to get call channel: %w", err)
	}
	var callsEnabled *bool
	if callsChannel != nil {
		callsEnabled = model.NewPointer(callsChannel.Enabled)
	}

	addSessionToCall := func(state *callState) *callState {
		var err error

		state, err = p.addUserSession(state, callsEnabled, userID, connID, channelID, channel.Type)
		if err != nil {
			p.LogError("failed to add user session", "err", err.Error())
			p.publishWebSocketEvent(wsEventError, map[string]interface{}{
				"data":   err.Error(),
				"connID": connID,
			}, &WebSocketBroadcast{ConnectionID: connID, ReliableClusterSend: true})
			return state
		} else if len(state.sessions) == 1 {
			// new call has started
			if cfg := p.getConfiguration(); cfg.DefaultEnabled != nil && !*cfg.DefaultEnabled &&
				p.API.HasPermissionTo(userID, model.PermissionManageSystem) {
				p.API.SendEphemeralPost(
					userID,
					&model.Post{
						UserId:    p.botSession.UserId,
						ChannelId: channelID,
						Message:   "Currently calls are not enabled for non-admin users. You can change the setting through the system console",
					},
				)
			}

			postID, threadID, err := p.createCallStartedPost(state, userID, channelID, joinData.Title, joinData.ThreadID)
			if err != nil {
				p.LogError(err.Error())
			}

			state.Call.PostID = postID
			state.Call.ThreadID = threadID
			if err := p.store.UpdateCall(&state.Call); err != nil {
				p.LogError(err.Error())
			}

			p.publishWebSocketEvent(wsEventCallStart, map[string]interface{}{
				"id":        state.Call.ID,
				"channelID": channelID,
				"start_at":  state.Call.StartAt,
				"thread_id": threadID,
				"post_id":   postID,
				"owner_id":  state.Call.OwnerID,
				"host_id":   state.Call.GetHostID(),
			}, &WebSocketBroadcast{ChannelID: channelID, ReliableClusterSend: true})

			go p.createSIPDispatchRule(channelID)
		}

		p.LogDebug("session has joined call",
			"userID", userID, "sessionID", connID, "channelID", channelID, "callID", state.Call.ID,
		)

		us := newUserSession(userID, channelID, connID, state.Call.ID)
		p.mut.Lock()
		p.sessions[connID] = us
		p.mut.Unlock()

		// send successful join response
		p.publishWebSocketEvent(wsEventJoin, map[string]interface{}{
			"connID": connID,
		}, &WebSocketBroadcast{ConnectionID: connID, ReliableClusterSend: true})

		p.publishWebSocketEvent(wsEventUserJoined, map[string]interface{}{
			"user_id":    userID,
			"session_id": connID,
		}, &WebSocketBroadcast{ChannelID: channelID, ReliableClusterSend: true})

		clientStateData, err := json.Marshal(state.getClientState(p.getBotID(), userID))
		if err != nil {
			p.LogError("failed to marshal client state", "err", err.Error())
		} else {
			p.publishWebSocketEvent(wsEventCallState, map[string]interface{}{
				"channel_id": channelID,
				"call":       string(clientStateData),
			}, &WebSocketBroadcast{UserID: userID, ReliableClusterSend: true})
		}

		p.metrics.IncWebSocketConn()

		go func() {
			defer p.metrics.DecWebSocketConn()
			p.wsReader(us)
			if err := p.handleLeave(us, userID, connID, channelID); err != nil {
				p.LogError(err.Error())
			}
		}()

		return state
	}

	p.mut.Lock()
	batcher := p.addSessionsBatchers[channelID]

	shouldBatch := batcher != nil || int(channelStats.MemberCount) >= minMembersCountForBatching

	if shouldBatch {
		defer p.mut.Unlock()
		p.LogDebug("will batch sessions joining operations",
			"channelID", channelID,
			"membersCount", channelStats.MemberCount,
			"threshold", minMembersCountForBatching,
		)

		if batcher == nil {
			batchMaxSize := min(int(channelStats.MemberCount), maxJoinLeaveOpsBatchSize)
			batcher, err = newBatcher(batching.Config{
				Interval: joinLeaveBatchingInterval,
				Size:     batchMaxSize,
				PreRunCb: func(ctx batching.Context) error {
					state, err := p.lockCallReturnState(channelID)
					if err != nil {
						return fmt.Errorf("failed to lock call: %w", err)
					}
					ctx["callState"] = state
					return nil
				},
				PostRunCb: func(_ batching.Context) error {
					p.unlockCall(channelID)
					return nil
				},
			})
			if err != nil {
				return fmt.Errorf("failed to create batcher: %w", err)
			}
			p.addSessionsBatchers[channelID] = batcher
			batcher.Start()
		}

		err = batcher.Push(func(ctx batching.Context) {
			ctx["callState"] = addSessionToCall(ctx["callState"].(*callState))
		})
		if err != nil {
			return fmt.Errorf("failed to push to batcher: %w", err)
		}

		return nil
	}

	// Non-batching case
	p.mut.Unlock()

	state, err := p.lockCallReturnState(channelID)
	if err != nil {
		return fmt.Errorf("failed to lock call: %w", err)
	}
	addSessionToCall(state)
	p.unlockCall(channelID)

	return nil
}

func (p *Plugin) handleCallStateRequest(channelID, userID, connID string) error {
	if !(p.isBot(userID) || p.API.HasPermissionToChannel(userID, channelID, model.PermissionReadChannel)) {
		return fmt.Errorf("forbidden")
	}

	state, err := p.lockCallReturnState(channelID)
	if err != nil {
		return fmt.Errorf("failed to lock call: %w", err)
	}
	defer p.unlockCall(channelID)

	if state == nil {
		return fmt.Errorf("no call ongoing")
	}

	clientStateData, err := json.Marshal(state.getClientState(p.getBotID(), userID))
	if err != nil {
		return fmt.Errorf("failed to marshal client state: %w", err)
	}

	p.publishWebSocketEvent(wsEventCallState, map[string]interface{}{
		"channel_id": channelID,
		"call":       string(clientStateData),
	}, &WebSocketBroadcast{ConnectionID: connID, ReliableClusterSend: true})

	return nil
}

func (p *Plugin) WebSocketMessageHasBeenPosted(connID, userID string, req *model.WebSocketRequest) {
	if !utf8.ValidString(req.Action) {
		p.LogError("invalid UTF-8 in action")
		return
	}
	if !strings.HasPrefix(req.Action, wsActionPrefix) {
		return
	}
	var msg clientMessage
	msg.Type = strings.TrimPrefix(req.Action, wsActionPrefix)

	if !isValidClientMessageType(msg.Type) {
		p.LogError("invalid message type", "type", msg.Type)
		return
	}

	if msg.Type == "ping" {
		return
	}

	p.mut.RLock()
	us := p.sessions[connID]
	p.mut.RUnlock()

	if us == nil {
		switch msg.Type {
		case clientMessageTypeJoin, clientMessageTypeLeave, clientMessageTypeCallState:
		default:
			return
		}
	}

	if us != nil && !us.wsMsgLimiter.Allow() {
		p.LogError("message was dropped by rate limiter", "msgType", msg.Type, "userID", us.userID, "connID", us.connID)
		return
	}

	switch msg.Type {
	case clientMessageTypeJoin:
		channelID, ok := req.Data["channelID"].(string)
		if !ok {
			p.LogError("missing channelID")
			return
		}

		title, _ := req.Data["title"].(string)
		threadID, _ := req.Data["threadID"].(string)

		joinData := callsJoinData{
			CallsClientJoinData{
				ChannelID: channelID,
				Title:     title,
				ThreadID:  threadID,
			},
		}

		go func() {
			if err := p.handleJoin(userID, connID, joinData); err != nil {
				p.LogWarn(err.Error(), "userID", userID, "connID", connID, "channelID", channelID)
				p.publishWebSocketEvent(wsEventError, map[string]interface{}{
					"data":   err.Error(),
					"connID": connID,
				}, &WebSocketBroadcast{ConnectionID: connID, ReliableClusterSend: true})
				return
			}
		}()
		return
	case clientMessageTypeLeave:
		p.metrics.IncWebSocketEvent("in", "leave")
		p.LogDebug("leave message", "userID", userID, "connID", connID)

		if us != nil && atomic.CompareAndSwapInt32(&us.left, 0, 1) {
			close(us.leaveCh)
		}

		return
	case clientMessageTypeCallState:
		p.metrics.IncWebSocketEvent("in", "call_state")

		channelID, _ := req.Data["channelID"].(string)
		if channelID == "" {
			p.LogError("missing channelID")
			return
		}

		if err := p.handleCallStateRequest(channelID, userID, connID); err != nil {
			p.LogError("handleCallStateRequest failed", "err", err.Error(), "userID", userID, "connID", connID)
		}
		return
	}

	select {
	case us.wsMsgCh <- msg:
	default:
		p.LogError("chan is full, dropping ws msg", "type", msg.Type)
		return
	}
}
