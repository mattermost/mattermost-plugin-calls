// Copyright (c) 2022-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"sync/atomic"
	"time"

	"github.com/mattermost/mattermost-plugin-calls/server/batching"
	"github.com/mattermost/mattermost-plugin-calls/server/public"

	"github.com/mattermost/mattermost-plugin-calls/server/db"

	rtcd "github.com/mattermost/rtcd/service"
	"github.com/mattermost/rtcd/service/rtc"

	"github.com/mattermost/mattermost/server/public/model"
)

const (
	wsEventSignal = "signal"

	// DEPRECATED in favour of user_joined (since v0.21.0)
	wsEventUserConnected = "user_connected"
	// DEPRECATED in favour of user_left (since v0.21.0)
	wsEventUserDisconnected = "user_disconnected"

	wsEventUserJoined                = "user_joined"
	wsEventUserLeft                  = "user_left"
	wsEventUserMuted                 = "user_muted"
	wsEventUserUnmuted               = "user_unmuted"
	wsEventUserVoiceOn               = "user_voice_on"
	wsEventUserVoiceOff              = "user_voice_off"
	wsEventUserScreenOn              = "user_screen_on"
	wsEventUserScreenOff             = "user_screen_off"
	wsEventCallStart                 = "call_start"
	wsEventCallState                 = "call_state"
	wsEventCallEnd                   = "call_end"
	wsEventUserRaiseHand             = "user_raise_hand"
	wsEventUserUnraiseHand           = "user_unraise_hand"
	wsEventUserReacted               = "user_reacted"
	wsEventJoin                      = "join"
	wsEventError                     = "error"
	wsEventCallHostChanged           = "call_host_changed"
	wsEventCallJobState              = "call_job_state"
	wsEventUserDismissedNotification = "user_dismissed_notification"
	wsEventJobStop                   = "job_stop"
	wsEventCaption                   = "caption"
	wsEventHostMute                  = "host_mute"
	wsEventHostScreenOff             = "host_screen_off"
	wsEventHostLowerHand             = "host_lower_hand"
	wsEventHostRemoved               = "host_removed"

	wsReconnectionTimeout = 10 * time.Second

	// MM-57224: deprecated, remove when not needed by mobile pre 2.14.0
	wsEventCallRecordingState = "call_recording_state"
)

var (
	minMembersCountForBatching = 100
	// This is a reasonable upper bound which should match our official
	// target for max supported participants in a single call.
	// It's meant to handle the worst case scenario of everyone joining or leaving at the same exact time.
	maxJoinLeaveOpsBatchSize = 1000

	// TODO: consider making this dynamic. Higher interval values will make the batching more efficient
	// at the cost of added latency when joining. Maybe we could make it a function of the members count.
	// One step further could be an adaptive algorithm but it may be a little overcomplicating.
	joinLeaveBatchingInterval = time.Second
)

var (
	sessionAuthCheckInterval = 10 * time.Second
)

type CallsClientJoinData struct {
	ChannelID string
	Title     string
	ThreadID  string

	// JobID is the id of the job tight to the bot connection to
	// a call (e.g. recording, transcription). It's a parameter reserved to the
	// Calls bot only.
	JobID string
}

type callsJoinData struct {
	CallsClientJoinData
	remoteAddr string
	xff        string
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
	if (ev == wsEventUserConnected || ev == wsEventUserDisconnected) && data["userID"] == botID {
		return
	}
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

	// If userIDs is set we broadcast the event only to the specified users (e.g.
	// call participants).
	if broadcast != nil && len(broadcast.UserIDs) > 0 {
		for _, userID := range broadcast.UserIDs {
			if userID == botID {
				// Bot user is a special case handled above. We don't want to send events twice
				// as setting broadcast.UserID will override any broadcast.OmitUsers entry.
				continue
			}
			broadcast.UserID = userID
			p.API.PublishWebSocketEvent(ev, data, broadcast.ToModel())
		}
		return
	}

	p.API.PublishWebSocketEvent(ev, data, broadcast.ToModel())
}

func (p *Plugin) handleClientMessageTypeScreen(us *session, msg clientMessage, handlerID string) error {
	if cfg := p.getConfiguration(); cfg == nil || cfg.AllowScreenSharing == nil || !*cfg.AllowScreenSharing {
		return fmt.Errorf("screen sharing is not allowed")
	}

	data := map[string]string{}
	if msg.Type == clientMessageTypeScreenOn {
		if err := json.Unmarshal(msg.Data, &data); err != nil {
			return err
		}
	}

	state, err := p.lockCallReturnState(us.channelID)
	if err != nil {
		return fmt.Errorf("failed to lock call: %w", err)
	}
	defer p.unlockCall(us.channelID)
	if state == nil {
		return fmt.Errorf("no call ongoing")
	}

	if msg.Type == clientMessageTypeScreenOn {
		if state.Call.Props.ScreenSharingSessionID != "" {
			return fmt.Errorf("cannot start screen sharing, someone else is sharing already: connID=%s", state.Call.Props.ScreenSharingSessionID)
		}
		state.Call.Props.ScreenSharingSessionID = us.originalConnID
		state.Call.Props.ScreenStartAt = time.Now().Unix()
	} else {
		if state.Call.Props.ScreenSharingSessionID != us.originalConnID {
			return fmt.Errorf("cannot stop screen sharing, someone else is sharing already: connID=%s", state.Call.Props.ScreenSharingSessionID)
		}
		state.Call.Props.ScreenSharingSessionID = ""
		if state.Call.Props.ScreenStartAt > 0 {
			state.Call.Stats.ScreenDuration = secondsSinceTimestamp(state.Call.Props.ScreenStartAt)
			state.Call.Props.ScreenStartAt = 0
		}
	}

	if err := p.store.UpdateCall(&state.Call); err != nil {
		return fmt.Errorf("failed to update call: %w", err)
	}

	msgType := rtc.ScreenOnMessage
	wsMsgType := wsEventUserScreenOn
	if msg.Type == clientMessageTypeScreenOff {
		msgType = rtc.ScreenOffMessage
		wsMsgType = wsEventUserScreenOff
	}

	if handlerID != p.nodeID {
		if err := p.sendClusterMessage(clusterMessage{
			ConnID:        us.originalConnID,
			UserID:        us.userID,
			ChannelID:     us.channelID,
			CallID:        us.callID,
			SenderID:      p.nodeID,
			ClientMessage: msg,
		}, clusterMessageTypeUserState, handlerID); err != nil {
			return err
		}
	} else {
		rtcMsg := rtc.Message{
			SessionID: us.originalConnID,
			Type:      msgType,
			Data:      msg.Data,
		}

		if err := p.sendRTCMessage(rtcMsg, us.callID); err != nil {
			p.LogError("failed to send RTC message", "error", err)
		}
	}

	p.publishWebSocketEvent(wsMsgType, map[string]interface{}{
		"userID":     us.userID,
		"session_id": us.originalConnID,
	}, &WebSocketBroadcast{ChannelID: us.channelID, ReliableClusterSend: true, UserIDs: getUserIDsFromSessions(state.sessions)})

	return nil
}

type EmojiData struct {
	Name    string `json:"name"`
	Skin    string `json:"skin,omitempty"`
	Unified string `json:"unified"`
	Literal string `json:"literal,omitempty"`
}

func (ed EmojiData) toMap() map[string]interface{} {
	return map[string]interface{}{
		"name":    ed.Name,
		"skin":    ed.Skin,
		"unified": ed.Unified,
		"literal": ed.Literal,
	}
}

func (p *Plugin) handleClientMsg(us *session, msg clientMessage, handlerID string) error {
	p.metrics.IncWebSocketEvent("in", msg.Type)
	switch msg.Type {
	case clientMessageTypeSDP:
		p.LogDebug("received sdp", "connID", us.connID, "originalConnID", us.originalConnID, "userID", us.userID)
		// if I am not the handler for this we relay the signaling message.
		if handlerID != p.nodeID {
			// need to relay signaling.
			if err := p.sendClusterMessage(clusterMessage{
				ConnID:        us.originalConnID,
				UserID:        us.userID,
				ChannelID:     us.channelID,
				CallID:        us.callID,
				SenderID:      p.nodeID,
				ClientMessage: msg,
			}, clusterMessageTypeSignaling, handlerID); err != nil {
				return err
			}
		} else {
			rtcMsg := rtc.Message{
				SessionID: us.originalConnID,
				Type:      rtc.SDPMessage,
				Data:      msg.Data,
			}

			if err := p.sendRTCMessage(rtcMsg, us.callID); err != nil {
				return fmt.Errorf("failed to send RTC message: %w", err)
			}
		}
	case clientMessageTypeICE:
		p.LogDebug("received ice candidate", "connID", us.connID, "originalConnID", us.originalConnID, "userID", us.userID)
		if handlerID == p.nodeID {
			rtcMsg := rtc.Message{
				SessionID: us.originalConnID,
				Type:      rtc.ICEMessage,
				Data:      msg.Data,
			}

			if err := p.sendRTCMessage(rtcMsg, us.callID); err != nil {
				return fmt.Errorf("failed to send RTC message: %w", err)
			}
		} else {
			// need to relay signaling.
			if err := p.sendClusterMessage(clusterMessage{
				ConnID:        us.originalConnID,
				UserID:        us.userID,
				ChannelID:     us.channelID,
				CallID:        us.callID,
				SenderID:      p.nodeID,
				ClientMessage: msg,
			}, clusterMessageTypeSignaling, handlerID); err != nil {
				return err
			}
		}
	case clientMessageTypeMute, clientMessageTypeUnmute:
		if handlerID != p.nodeID {
			// need to relay track event.
			if err := p.sendClusterMessage(clusterMessage{
				ConnID:        us.originalConnID,
				UserID:        us.userID,
				ChannelID:     us.channelID,
				CallID:        us.callID,
				SenderID:      p.nodeID,
				ClientMessage: msg,
			}, clusterMessageTypeUserState, handlerID); err != nil {
				return err
			}
		} else {
			msgType := rtc.UnmuteMessage
			if msg.Type == clientMessageTypeMute {
				msgType = rtc.MuteMessage
			}

			rtcMsg := rtc.Message{
				SessionID: us.originalConnID,
				Type:      msgType,
				Data:      msg.Data,
			}

			if err := p.sendRTCMessage(rtcMsg, us.callID); err != nil {
				return fmt.Errorf("failed to send RTC message: %w", err)
			}
		}

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
	case clientMessageTypeScreenOn, clientMessageTypeScreenOff:
		if err := p.handleClientMessageTypeScreen(us, msg, handlerID); err != nil {
			return err
		}
	case clientMessageTypeRaiseHand, clientMessageTypeUnraiseHand:
		evType := wsEventUserUnraiseHand
		if msg.Type == clientMessageTypeRaiseHand {
			evType = wsEventUserRaiseHand
		}

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
			return fmt.Errorf("user session is missing from call state")
		}

		if msg.Type == clientMessageTypeRaiseHand {
			session.RaisedHand = time.Now().UnixMilli()
		} else {
			session.RaisedHand = 0
		}

		if err := p.store.UpdateCallSession(session); err != nil {
			return fmt.Errorf("failed to update call session: %w", err)
		}

		p.publishWebSocketEvent(evType, map[string]interface{}{
			"userID":      us.userID,
			"session_id":  us.originalConnID,
			"raised_hand": session.RaisedHand,
		}, &WebSocketBroadcast{
			ChannelID:           us.channelID,
			ReliableClusterSend: true,
			UserIDs:             getUserIDsFromSessions(state.sessions),
		})
	case clientMessageTypeReact:
		evType := wsEventUserReacted

		var emoji EmojiData
		if err := json.Unmarshal(msg.Data, &emoji); err != nil {
			return fmt.Errorf("failed to unmarshal emoji data: %w", err)
		}

		sessions, err := p.store.GetCallSessions(us.callID, db.GetCallSessionOpts{})
		if err != nil {
			return fmt.Errorf("failed to get call sessions: %w", err)
		}

		p.publishWebSocketEvent(evType, map[string]interface{}{
			"user_id":    us.userID,
			"session_id": us.originalConnID,
			"emoji":      emoji.toMap(),
			"timestamp":  time.Now().UnixMilli(),
		}, &WebSocketBroadcast{
			ChannelID: us.channelID,
			UserIDs:   getUserIDsFromSessions(sessions),
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
		} else {
			p.LogError("ws channel already closed", "userID", userID, "connID", connID, "channelID", us.channelID)
		}
	} else {
		// If we don't find the session it's usually an expected case as this hook tracks all MM connections, not just Calls ones.
		// However, there's a small chance the session has yet to be created (a race with handleJoin).
		// To work around this edge case, we check again after a few seconds to unblock any potentially stuck wsReader goroutines.
		go func() {
			time.Sleep(wsReconnectionTimeout)
			p.mut.RLock()
			us := p.sessions[connID]
			p.mut.RUnlock()
			if us != nil && atomic.CompareAndSwapInt32(&us.wsClosed, 0, 1) {
				p.LogDebug("race: closing ws channel for session", "userID", userID, "connID", connID, "channelID", us.channelID)
				close(us.wsCloseCh)
			}
		}()
	}
}

func (p *Plugin) wsReader(us *session, authSessionID, handlerID string) {
	sessionAuthTicker := time.NewTicker(sessionAuthCheckInterval)
	defer sessionAuthTicker.Stop()

	for {
		select {
		case msg, ok := <-us.wsMsgCh:
			if !ok {
				return
			}
			if err := p.handleClientMsg(us, msg, handlerID); err != nil {
				p.LogError("handleClientMsg failed", "err", err.Error(), "connID", us.connID)
			}
		case <-us.wsReconnectCh:
			return
		case <-us.leaveCh:
			return
		case <-us.wsCloseCh:
			return
		case <-us.rtcCloseCh:
			return
		case <-sessionAuthTicker.C:
			// Server versions prior to MM v9.5 won't have the session ID set so we
			// cannot go ahead with this check.
			// Should be removed as soon as we bump the minimum supported version.
			if authSessionID == "" {
				continue
			}

			if s, appErr := p.API.GetSession(authSessionID); appErr != nil || (s.ExpiresAt != 0 && time.Now().UnixMilli() >= s.ExpiresAt) {
				fields := []any{
					"channelID",
					us.channelID,
					"userID",
					us.userID,
					"connID",
					us.connID,
				}

				if appErr != nil {
					fields = append(fields, "err", appErr.Error())
				} else {
					fields = append(fields, "sessionID", s.Id, "expiresAt", fmt.Sprintf("%d", s.ExpiresAt))
				}

				p.LogInfo("invalid or expired session, closing RTC session", fields...)

				// We forcefully disconnect any session that has been revoked or expired.
				if err := p.closeRTCSession(us.userID, us.connID, us.channelID, handlerID, us.callID); err != nil {
					p.LogError("failed to close RTC session", append(fields[:5], "err", err.Error()))
				}

				return
			}
		}
	}
}

func (p *Plugin) sendRTCMessage(msg rtc.Message, callID string) error {
	if p.rtcdManager != nil {
		cm := rtcd.ClientMessage{
			Type: rtcd.ClientMessageRTC,
			Data: msg,
		}
		host, err := p.store.GetRTCDHostForCall(callID, db.GetCallOpts{})
		if err != nil {
			return fmt.Errorf("failed to get RTCD host for call: %w", err)
		}
		return p.rtcdManager.Send(cm, host)
	}

	return p.rtcServer.Send(msg)
}

func (p *Plugin) wsWriter() {
	for {
		select {
		case msg, ok := <-p.rtcServer.ReceiveCh():
			if !ok {
				return
			}
			p.mut.RLock()
			us := p.sessions[msg.SessionID]
			p.mut.RUnlock()
			if us == nil {
				p.LogError("session should not be nil")
				continue
			}

			if msg.Type == rtc.VoiceOnMessage || msg.Type == rtc.VoiceOffMessage {
				evType := wsEventUserVoiceOff
				if msg.Type == rtc.VoiceOnMessage {
					evType = wsEventUserVoiceOn
				}

				sessions, err := p.store.GetCallSessions(us.callID, db.GetCallSessionOpts{})
				if err != nil {
					p.LogError("failed to get call sessions", "err", err.Error())
					continue
				}

				p.publishWebSocketEvent(evType, map[string]interface{}{
					"userID":     us.userID,
					"session_id": us.originalConnID,
				}, &WebSocketBroadcast{ChannelID: us.channelID, UserIDs: getUserIDsFromSessions(sessions)})

				continue
			}

			p.publishWebSocketEvent(wsEventSignal, map[string]interface{}{
				"data":   string(msg.Data),
				"connID": msg.SessionID,
			}, &WebSocketBroadcast{UserID: us.userID, ReliableClusterSend: true})
		case <-p.stopCh:
			return
		}
	}
}

func (p *Plugin) handleLeave(us *session, userID, connID, channelID, handlerID string) error {
	p.LogDebug("handleLeave", "userID", userID, "connID", connID, "channelID", channelID)

	select {
	case <-us.wsReconnectCh:
		p.LogDebug("reconnected, returning", "userID", userID, "connID", connID, "channelID", channelID)

		// Clearing the previous session since it gets copied over after
		// successful reconnect.
		p.mut.Lock()
		if p.sessions[connID] == us {
			p.LogDebug("clearing session after reconnect", "userID", userID, "connID", connID, "channelID", channelID)
			delete(p.sessions, connID)
		}
		p.mut.Unlock()
		return nil
	case <-us.leaveCh:
		p.LogDebug("user left call", "userID", userID, "connID", connID, "channelID", us.channelID)
	case <-us.rtcCloseCh:
		p.LogDebug("rtc connection was closed", "userID", userID, "connID", connID, "channelID", us.channelID)
		return nil
	case <-time.After(wsReconnectionTimeout):
		p.LogDebug("timeout waiting for reconnection", "userID", userID, "connID", connID, "channelID", channelID)
	}

	if err := p.closeRTCSession(userID, us.originalConnID, channelID, handlerID, us.callID); err != nil {
		p.LogError(err.Error())
	}

	if err := p.removeSession(us); err != nil {
		p.LogError(err.Error())
	}

	p.track(evCallUserLeft, map[string]interface{}{
		"ParticipantID": userID,
		"ChannelID":     channelID,
		"CallID":        us.callID,
	})

	return nil
}

func (p *Plugin) handleJoin(userID, connID, authSessionID string, joinData callsJoinData) (retErr error) {
	channelID := joinData.ChannelID
	p.LogDebug("handleJoin", "userID", userID, "connID", connID, "channelID", channelID)

	// We should go through only if the user has permissions to the requested channel
	// or if the user is the Calls bot.
	if !(p.isBot(userID) || p.API.HasPermissionToChannel(userID, channelID, model.PermissionCreatePost)) {
		return fmt.Errorf("forbidden")
	}

	if userID == p.getBotID() && joinData.JobID == "" {
		return fmt.Errorf("JobID should not be empty for bot connections")
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
		callsEnabled = model.NewBool(callsChannel.Enabled)
	}

	addSessionToCall := func(state *callState) *callState {
		var err error

		state, err = p.addUserSession(state, callsEnabled, userID, connID, channelID, joinData.JobID)
		if err != nil {
			p.LogError("failed to add user session", "err", err.Error())
			return state
		} else if len(state.sessions) == 1 {
			// new call has started

			// If this is TestMode (DefaultEnabled=false) and sysadmin, send an ephemeral message
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

			// TODO: send all the info attached to a call.
			p.publishWebSocketEvent(wsEventCallStart, map[string]interface{}{
				"id":        state.Call.ID,
				"channelID": channelID,
				"start_at":  state.Call.StartAt,
				"thread_id": threadID,
				"post_id":   postID,
				"owner_id":  state.Call.OwnerID,
				"host_id":   state.Call.GetHostID(),
			}, &WebSocketBroadcast{ChannelID: channelID, ReliableClusterSend: true})

			p.track(evCallStarted, map[string]interface{}{
				"ParticipantID": userID,
				"CallID":        state.Call.ID,
				"ChannelID":     channelID,
				"ChannelType":   channel.Type,
			})
		}

		p.LogDebug("session has joined call",
			"userID", userID, "sessionID", connID, "channelID", channelID, "callID", state.Call.ID,
			"remoteAddr", joinData.remoteAddr, "xForwardedFor", joinData.xff,
		)

		handlerID := state.Call.Props.NodeID
		p.LogDebug("got handlerID", "handlerID", handlerID)

		us := newUserSession(userID, channelID, connID, state.Call.ID, p.rtcdManager == nil && handlerID == p.nodeID)
		p.mut.Lock()
		p.sessions[connID] = us
		p.mut.Unlock()

		if p.rtcdManager != nil {
			msg := rtcd.ClientMessage{
				Type: rtcd.ClientMessageJoin,
				Data: map[string]string{
					"callID":    us.callID,
					"userID":    userID,
					"sessionID": connID,
					"channelID": channelID,
				},
			}
			if err := p.rtcdManager.Send(msg, state.Call.Props.RTCDHost); err != nil {
				p.LogError("failed to send client join message", "err", err.Error())
				go func() {
					if err := p.handleLeave(us, userID, connID, channelID, handlerID); err != nil {
						p.LogError(err.Error())
					}
				}()
				return state
			}
		} else {
			if ok, err := p.shouldSendConcurrentSessionsWarning(getConcurrentSessionsThreshold(),
				getConcurrentSessionsWarningBackoffTime()); err != nil {
				p.LogError("shouldSendConcurrentSessionsWarning failed", "err", err.Error())
			} else if ok {
				if err := p.sendConcurrentSessionsWarning(); err != nil {
					p.LogError("sendConcurrentSessionsWarning failed", "err", err.Error())
				}
			}

			if handlerID == p.nodeID {
				cfg := rtc.SessionConfig{
					GroupID:   "default",
					CallID:    us.callID,
					UserID:    userID,
					SessionID: connID,
					Props: map[string]any{
						"channelID": us.channelID,
					},
				}
				p.LogDebug("initializing RTC session", "userID", userID, "connID", connID, "channelID", channelID, "callID", us.callID)
				if err = p.rtcServer.InitSession(cfg, func() error {
					if atomic.CompareAndSwapInt32(&us.rtcClosed, 0, 1) {
						close(us.rtcCloseCh)
						return p.removeSession(us)
					}
					return nil
				}); err != nil {
					p.LogError("failed to init session", "err", err.Error())
					go func() {
						if err := p.handleLeave(us, userID, connID, channelID, handlerID); err != nil {
							p.LogError(err.Error())
						}
					}()
					return state
				}
			} else {
				if err := p.sendClusterMessage(clusterMessage{
					ConnID:    connID,
					UserID:    userID,
					ChannelID: channelID,
					CallID:    us.callID,
					SenderID:  p.nodeID,
				}, clusterMessageTypeConnect, handlerID); err != nil {
					p.LogError("failed to send connect message", "err", err.Error())
					go func() {
						if err := p.handleLeave(us, userID, connID, channelID, handlerID); err != nil {
							p.LogError(err.Error())
						}
					}()
					return state
				}
			}
		}

		// send successful join response
		p.publishWebSocketEvent(wsEventJoin, map[string]interface{}{
			"connID": connID,
		}, &WebSocketBroadcast{UserID: userID, ReliableClusterSend: true})

		if len(state.sessionsForUser(userID)) == 1 {
			// Only send event on first session join.
			// This is to keep backwards compatibility with clients not supporting
			// multi-sessions.
			p.publishWebSocketEvent(wsEventUserConnected, map[string]interface{}{
				"userID": userID,
			}, &WebSocketBroadcast{ChannelID: channelID, ReliableClusterSend: true})
		}

		p.publishWebSocketEvent(wsEventUserJoined, map[string]interface{}{
			"user_id":    userID,
			"session_id": connID,
		}, &WebSocketBroadcast{ChannelID: channelID, ReliableClusterSend: true})

		if userID == p.getBotID() && state.Recording != nil {
			p.publishWebSocketEvent(wsEventCallJobState, map[string]interface{}{
				"callID":   channelID,
				"jobState": getClientStateFromCallJob(state.Recording).toMap(),
			}, &WebSocketBroadcast{
				ChannelID:           channelID,
				ReliableClusterSend: true,
				UserIDs:             getUserIDsFromSessions(state.sessions),
			})

			// MM-57224: deprecated, remove when not needed by mobile pre 2.14.0
			p.publishWebSocketEvent(wsEventCallRecordingState, map[string]interface{}{
				"callID":   channelID,
				"recState": getClientStateFromCallJob(state.Recording).toMap(),
			}, &WebSocketBroadcast{
				ChannelID:           channelID,
				ReliableClusterSend: true,
				UserIDs:             getUserIDsFromSessions(state.sessions),
			})
		}

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
		p.track(evCallUserJoined, map[string]interface{}{
			"ParticipantID": userID,
			"ChannelID":     channelID,
			"CallID":        state.Call.ID,
		})

		go func() {
			defer p.metrics.DecWebSocketConn()
			p.wsReader(us, authSessionID, handlerID)
			if err := p.handleLeave(us, userID, connID, channelID, handlerID); err != nil {
				p.LogError(err.Error())
			}
		}()

		return state
	}

	p.mut.Lock()
	batcher := p.addSessionsBatchers[channelID]

	// It's not worth the overhead of batching join operations in small calls.
	// Of course we need to make an assumption that the members count of a channel
	// reasonably maps to the expected participants count.
	// In the future we could think of more accurate estimates such as looking at statistics from previous calls.
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
			p.LogDebug("creating new addSessionsBatcher for call", "channelID", channelID, "batchMaxSize", batchMaxSize)
			batcher, err = batching.NewBatcher(batching.Config{
				Interval: joinLeaveBatchingInterval,
				Size:     batchMaxSize,
				PreRunCb: func(ctx batching.Context) error {
					p.LogDebug("performing addSessionToCall batch", "channelID", channelID, "batchSize", ctx[batching.ContextBatchSizeKey])

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

	p.LogDebug("no need to batch sessions joining operations",
		"channelID", channelID,
		"membersCount", channelStats.MemberCount,
		"threshold", minMembersCountForBatching,
	)

	state, err := p.lockCallReturnState(channelID)
	if err != nil {
		return fmt.Errorf("failed to lock call: %w", err)
	}
	addSessionToCall(state)

	p.unlockCall(channelID)

	return nil
}

func (p *Plugin) handleReconnect(userID, connID, channelID, originalConnID, prevConnID, authSessionID string) error {
	p.LogDebug("handleReconnect", "userID", userID, "connID", connID, "channelID", channelID,
		"originalConnID", originalConnID, "prevConnID", prevConnID)

	if !p.isBot(userID) && !p.API.HasPermissionToChannel(userID, channelID, model.PermissionCreatePost) {
		return fmt.Errorf("forbidden")
	}

	state, err := p.getCallState(channelID, false)
	if err != nil {
		return err
	} else if state == nil {
		return fmt.Errorf("no call ongoing")
	} else if state, ok := state.sessions[originalConnID]; !ok || state.UserID != userID {
		return fmt.Errorf("session not found in call state")
	}

	var rtc bool
	p.mut.Lock()
	us := p.sessions[connID]

	// Covering the edge case of a client getting a new connection ID even if reconnecting
	// to the same instance/node. In such case we need to use the previous connection ID
	// to find the existing session.
	if us == nil {
		us = p.sessions[prevConnID]
	}

	if us != nil {
		rtc = us.rtc
		if atomic.CompareAndSwapInt32(&us.wsReconnected, 0, 1) {
			p.LogDebug("closing reconnectCh", "userID", userID, "connID", connID, "channelID", channelID,
				"originalConnID", originalConnID)
			close(us.wsReconnectCh)
		} else {
			p.mut.Unlock()
			return fmt.Errorf("session already reconnected")
		}
	} else {
		if p.isHA() {
			// If we are running in HA this case can be expected as it's likely the
			// reconnect happened on a different node which is not storing the
			// original session.
			p.LogDebug("session not found", "userID", userID, "connID", connID, "channelID", channelID,
				"originalConnID", originalConnID)
		} else {
			// If not running in HA, this should not happen.
			p.LogError("session not found", "userID", userID, "connID", connID, "channelID", channelID,
				"originalConnID", originalConnID)
		}
	}

	// Handle bot reconnection. This is needed to update the bot connection
	// IDs for any potentially running jobs.
	if p.isBot(userID) {
		if err := p.handleBotWSReconnect(connID, prevConnID, originalConnID, channelID); err != nil {
			p.mut.Unlock()
			return fmt.Errorf("handleBotWSReconnect failed: %w", err)
		}
	}

	us = newUserSession(userID, channelID, connID, state.Call.ID, rtc)
	us.originalConnID = originalConnID
	p.sessions[connID] = us
	p.mut.Unlock()

	if err := p.sendClusterMessage(clusterMessage{
		ConnID:   prevConnID,
		UserID:   userID,
		CallID:   state.Call.ID,
		SenderID: p.nodeID,
	}, clusterMessageTypeReconnect, ""); err != nil {
		p.LogError(err.Error())
	}

	if p.rtcdManager != nil {
		msg := rtcd.ClientMessage{
			Type: rtcd.ClientMessageReconnect,
			Data: map[string]string{
				"sessionID": originalConnID,
			},
		}
		if err := p.rtcdManager.Send(msg, state.Call.Props.RTCDHost); err != nil {
			return fmt.Errorf("failed to send client reconnect message: %w", err)
		}
	}

	p.wsReader(us, authSessionID, state.Call.Props.NodeID)

	if err := p.handleLeave(us, userID, connID, channelID, state.Call.Props.NodeID); err != nil {
		p.LogError(err.Error())
	}

	return nil
}

func (p *Plugin) handleCallStateRequest(channelID, userID, connID string) error {
	// We should go through only if the user has permissions to the requested channel
	// or if the user is the Calls bot.
	if !(p.isBot(userID) || p.API.HasPermissionToChannel(userID, channelID, model.PermissionReadChannel)) {
		return fmt.Errorf("forbidden")
	}

	// Locking is not ideal but it's the only way to guarantee a race free
	// sequence and a consistent state.
	// On the client we should make sure to make this request only when strictly
	// necessary (i.e first load, joining call, reconnecting).
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
	var msg clientMessage
	msg.Type = strings.TrimPrefix(req.Action, wsActionPrefix)

	p.mut.RLock()
	us := p.sessions[connID]
	p.mut.RUnlock()

	if us == nil {
		// Only a few events don't require a user session to exist. For anything else
		// we should return.
		switch msg.Type {
		case clientMessageTypeJoin, clientMessageTypeLeave, clientMessageTypeReconnect, clientMessageTypeCallState:
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

		// Title is optional, so if it's not present,
		// it will be an empty string.
		title, _ := req.Data["title"].(string)

		// ThreadID is optional, so if it's not present,
		// it will be an empty string.
		threadID, _ := req.Data["threadID"].(string)

		// JobID is optional, so if it's not present,
		// it will be an empty string.
		jobID, _ := req.Data["jobID"].(string)

		remoteAddr, _ := req.Data[model.WebSocketRemoteAddr].(string)
		xff, _ := req.Data[model.WebSocketXForwardedFor].(string)

		joinData := callsJoinData{
			CallsClientJoinData{
				channelID,
				title,
				threadID,
				jobID,
			},
			remoteAddr,
			xff,
		}

		go func() {
			if err := p.handleJoin(userID, connID, req.Session.Id, joinData); err != nil {
				p.LogWarn(err.Error(), "userID", userID, "connID", connID, "channelID", channelID)
				p.publishWebSocketEvent(wsEventError, map[string]interface{}{
					"data":   err.Error(),
					"connID": connID,
				}, &WebSocketBroadcast{UserID: userID, ReliableClusterSend: true})
				return
			}
		}()
		return
	case clientMessageTypeReconnect:
		channelID, _ := req.Data["channelID"].(string)
		if channelID == "" {
			p.LogError("missing channelID")
			return
		}
		originalConnID, _ := req.Data["originalConnID"].(string)
		if originalConnID == "" {
			p.LogError("missing originalConnID")
			return
		}
		prevConnID, _ := req.Data["prevConnID"].(string)
		if prevConnID == "" {
			p.LogError("missing prevConnID")
			return
		}

		go func() {
			if err := p.handleReconnect(userID, connID, channelID, originalConnID, prevConnID, req.Session.Id); err != nil {
				p.LogWarn(err.Error(), "userID", userID, "connID", connID,
					"originalConnID", originalConnID, "prevConnID", prevConnID, "channelID", channelID)
			}
		}()
		return
	case clientMessageTypeLeave:
		p.metrics.IncWebSocketEvent("in", "leave")
		p.LogDebug("leave message", "userID", userID, "connID", connID)

		if us != nil && atomic.CompareAndSwapInt32(&us.left, 0, 1) {
			close(us.leaveCh)
		}

		if err := p.sendClusterMessage(clusterMessage{
			ConnID:   connID,
			UserID:   userID,
			SenderID: p.nodeID,
		}, clusterMessageTypeLeave, ""); err != nil {
			p.LogError(err.Error())
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
	case clientMessageTypeSDP:
		msgData, ok := req.Data["data"].([]byte)
		if !ok {
			p.LogError("invalid or missing sdp data")
			return
		}
		data, err := unpackSDPData(msgData)
		if err != nil {
			p.LogError(err.Error())
			return
		}
		msg.Data = data
	case clientMessageTypeICE, clientMessageTypeScreenOn:
		msgData, ok := req.Data["data"].(string)
		if !ok {
			p.LogError("invalid or missing data")
			return
		}
		msg.Data = []byte(msgData)
	case clientMessageTypeReact:
		msgData, ok := req.Data["data"].(string)
		if !ok {
			p.LogError("invalid or missing reaction data")
			return
		}
		msg.Data = []byte(msgData)
	case clientMessageTypeCaption:
		// Sent from the transcriber.
		p.metrics.IncWebSocketEvent("in", msg.Type)
		if us.userID != p.getBotID() {
			p.LogWarn("unexpected caption message not coming from bot")
			return
		}
		sessionID, ok := req.Data["session_id"].(string)
		if !ok {
			p.LogError("invalid or missing session_id in caption ws message")
			return
		}
		text, ok := req.Data["text"].(string)
		if !ok {
			p.LogError("invalid or missing text in caption ws message")
			return
		}
		newAudioLenMs, ok := req.Data["new_audio_len_ms"].(float64)
		if !ok {
			p.LogError("invalid or missing new_audio_len_ms in caption ws message")
			return
		}
		if err := p.handleCaptionMessage(us.callID, us.channelID, sessionID, text, newAudioLenMs); err != nil {
			p.LogError("handleCaptionMessage failed", "err", err.Error(), "userID", userID, "connID", connID)
			return
		}
		return
	case clientMessageTypeMetric:
		// Sent from the transcriber.
		p.metrics.IncWebSocketEvent("in", msg.Type)
		metricName, ok := req.Data["metric_name"].(string)
		if !ok {
			p.LogError("invalid or missing metric_name in metric ws message")
			return
		}
		p.handleMetricMessage(public.MetricName(metricName))
		return
	}

	select {
	case us.wsMsgCh <- msg:
	default:
		p.LogError("chan is full, dropping ws msg", "type", msg.Type)
		return
	}
}

func (p *Plugin) closeRTCSession(userID, connID, channelID, handlerID, callID string) error {
	p.LogDebug("closeRTCSession", "userID", userID, "connID", connID, "channelID", channelID)
	if p.rtcServer != nil {
		if handlerID == p.nodeID {
			if err := p.rtcServer.CloseSession(connID); err != nil {
				return err
			}
		} else {
			if err := p.sendClusterMessage(clusterMessage{
				ConnID:    connID,
				UserID:    userID,
				ChannelID: channelID,
				CallID:    callID,
				SenderID:  p.nodeID,
			}, clusterMessageTypeDisconnect, handlerID); err != nil {
				return err
			}
		}
	} else if p.rtcdManager != nil {
		msg := rtcd.ClientMessage{
			Type: rtcd.ClientMessageLeave,
			Data: map[string]string{
				"sessionID": connID,
			},
		}

		host, err := p.store.GetRTCDHostForCall(callID, db.GetCallOpts{})
		if err != nil {
			return fmt.Errorf("failed to get RTCD host for call: %w", err)
		}

		if err := p.rtcdManager.Send(msg, host); err != nil {
			return fmt.Errorf("failed to send client message: %w", err)
		}
	}

	return nil
}

func (p *Plugin) handleBotWSReconnect(connID, prevConnID, originalConnID, channelID string) error {
	p.LogDebug("bot ws reconnection", "connID", connID, "prevConnID", prevConnID, "originalConnID", originalConnID, "channelID", channelID)

	state, err := p.lockCallReturnState(channelID)
	if err != nil {
		return fmt.Errorf("failed to lock call: %w", err)
	}
	defer p.unlockCall(channelID)

	if state != nil && state.Recording != nil && state.Recording.Props.BotConnID == prevConnID {
		p.LogDebug("updating bot conn ID for recording job",
			"recID", state.Recording.ID,
			"recJobID", state.Recording.Props.JobID,
			"botOriginalConnID", originalConnID,
			"botConnID", connID,
		)
		state.Recording.Props.BotConnID = connID

		if err := p.store.UpdateCallJob(state.Recording); err != nil {
			return fmt.Errorf("failed to update call job: %w", err)
		}
	} else if state != nil && state.Transcription != nil && state.Transcription.Props.BotConnID == prevConnID {
		p.LogDebug("updating bot conn ID for transcribing job",
			"trID", state.Transcription.ID,
			"trJobID", state.Transcription.Props.JobID,
			"botOriginalConnID", originalConnID,
			"botConnID", connID,
		)
		state.Transcription.Props.BotConnID = connID
		if err := p.store.UpdateCallJob(state.Transcription); err != nil {
			return fmt.Errorf("failed to update call job: %w", err)
		}
		if state.LiveCaptions != nil && state.LiveCaptions.Props.BotConnID == prevConnID {
			state.LiveCaptions.Props.BotConnID = connID
			if err := p.store.UpdateCallJob(state.LiveCaptions); err != nil {
				return fmt.Errorf("failed to update call job: %w", err)
			}
		}
	}

	return nil
}

func (p *Plugin) handleCaptionMessage(callID, channelID, captionFromSessionID, text string, newAudioLenMs float64) error {
	sessions, err := p.store.GetCallSessions(callID, db.GetCallSessionOpts{})
	if err != nil {
		return fmt.Errorf("failed to get call sessions: %w", err)
	}

	captionSession, ok := sessions[captionFromSessionID]
	if !ok {
		return fmt.Errorf("user session for caption missing from call")
	}

	p.publishWebSocketEvent(wsEventCaption, map[string]interface{}{
		"channel_id": channelID,
		"user_id":    captionSession.UserID,
		"session_id": captionSession.ID,
		"text":       text,
	}, &WebSocketBroadcast{
		ChannelID:           channelID,
		ReliableClusterSend: true,
		UserIDs:             getUserIDsFromSessions(sessions),
	})

	p.metrics.ObserveLiveCaptionsAudioLen(newAudioLenMs)

	return nil
}

func (p *Plugin) handleMetricMessage(metricName public.MetricName) {
	switch metricName {
	case public.MetricLiveCaptionsWindowDropped:
		p.metrics.IncLiveCaptionsWindowDropped()
	case public.MetricLiveCaptionsTranscriberBufFull:
		p.metrics.IncLiveCaptionsTranscriberBufFull()
	case public.MetricLiveCaptionsPktPayloadChBufFull:
		p.metrics.IncLiveCaptionsPktPayloadChBufFull()
	}
}
