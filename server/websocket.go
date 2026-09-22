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
	"github.com/mattermost/mattermost-plugin-calls/server/public"

	"github.com/mattermost/mattermost-plugin-calls/server/db"

	"github.com/mattermost/mattermost/server/public/model"
)

const (
	wsEventUserJoined                = "user_joined"
	wsEventUserLeft                  = "user_left"
	wsEventUserMuted                 = "user_muted"
	wsEventUserUnmuted               = "user_unmuted"
	wsEventUserScreenOn              = "user_screen_on"
	wsEventUserScreenOff             = "user_screen_off"
	wsEventUserVideoOn               = "user_video_on"
	wsEventUserVideoOff              = "user_video_off"
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
	wsEventHostScreenOff             = "host_screen_off"
	wsEventHostLowerHand             = "host_lower_hand"
	wsEventHostRemoved               = "host_removed"

	wsReconnectionTimeout = 10 * time.Second
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

	// This indirection is needed as it makes it possible to mock in tests
	newBatcher = batching.NewBatcher
)

var sessionAuthCheckInterval = 10 * time.Second

type CallsClientJoinData struct {
	ChannelID string
	Title     string
	ThreadID  string

	AV1Support  bool
	DCSignaling bool

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

func (p *Plugin) wsReader(us *session, authSessionID string) {
	sessionAuthTicker := time.NewTicker(sessionAuthCheckInterval)
	defer sessionAuthTicker.Stop()

	for {
		select {
		case <-us.leaveCh:
			return
		case <-us.wsCloseCh:
			return
		case <-sessionAuthTicker.C:
			// Server versions prior to MM v9.5 won't have the session ID set so we
			// cannot go ahead with this check.
			// Should be removed as soon as we bump the minimum supported version.
			if authSessionID == "" {
				continue
			}

			s, appErr := p.API.GetSession(authSessionID)
			if appErr != nil || s == nil || (s.ExpiresAt != 0 && time.Now().UnixMilli() >= s.ExpiresAt) {
				fields := []any{
					"channelID",
					us.channelID,
					"userID",
					us.userID,
					"connID",
					us.connID,
				}

				if appErr == nil && s == nil {
					p.LogWarn("no appErr and no session found", fields...)
				} else if appErr != nil {
					fields = append(fields, "err", appErr.Error())
				} else {
					fields = append(fields, "sessionID", s.Id, "expiresAt", fmt.Sprintf("%d", s.ExpiresAt))
				}

				p.LogInfo("invalid or expired session, removing LiveKit participant", fields...)

				// Force the participant off the LiveKit room. Their client will see
				// RoomEvent.Disconnected and tear down its own UI.
				if err := p.livekitRemoveParticipant(us.channelID, composeLivekitIdentity(us.userID, us.connID)); err != nil && !errors.Is(err, errLiveKitNotConfigured) {
					p.LogError("failed to remove LiveKit participant for revoked session",
						append(fields, "err", err.Error())...)
				}

				return
			}
		}
	}
}

func (p *Plugin) handleLeave(us *session, userID, connID, channelID string) error {
	p.LogDebug("handleLeave", "userID", userID, "connID", connID, "channelID", channelID)

	select {
	case <-us.leaveCh:
		p.LogDebug("user left call", "userID", userID, "connID", connID, "channelID", us.channelID)
	case <-time.After(wsReconnectionTimeout):
		p.LogDebug("timeout waiting for leave", "userID", userID, "connID", connID, "channelID", channelID)
	}

	if err := p.removeSession(us); err != nil {
		p.LogError(err.Error())
	}

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
		callsEnabled = model.NewPointer(callsChannel.Enabled)
	}

	addSessionToCall := func(state *callState) *callState {
		var err error

		state, err = p.addUserSession(state, callsEnabled, userID, connID, channelID, joinData.JobID, authSessionID, channel.Type)
		if err != nil {
			p.LogError("failed to add user session", "err", err.Error())
			p.publishWebSocketEvent(wsEventError, map[string]interface{}{
				"data":   err.Error(),
				"connID": connID,
			}, &WebSocketBroadcast{ConnectionID: connID, ReliableClusterSend: true})
			return state
		} else if len(state.sessions) == 1 {
			// new call has started
			p.announceCallStarted(state, userID, channelID, joinData.Title, joinData.ThreadID, channel.Type)
		}

		p.cancelDMNoAnswerTimerIfAnswered(state, userID, channelID, channel.Type)

		p.LogDebug("session has joined call",
			"userID", userID, "sessionID", connID, "channelID", channelID, "callID", state.Call.ID,
			"remoteAddr", joinData.remoteAddr, "xForwardedFor", joinData.xff,
		)

		us := newUserSession(userID, channelID, connID, state.Call.ID)
		p.mut.Lock()
		p.sessions[connID] = us
		p.mut.Unlock()

		p.maybeSendConcurrentSessionsWarning()

		// send successful join response
		p.publishWebSocketEvent(wsEventJoin, map[string]interface{}{
			"connID": connID,
		}, &WebSocketBroadcast{ConnectionID: connID, ReliableClusterSend: true})

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

		go func() {
			defer p.metrics.DecWebSocketConn()
			p.wsReader(us, authSessionID)
			if err := p.handleLeave(us, userID, connID, channelID); err != nil {
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
			batcher, err = newBatcher(batching.Config{
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

	// Validate message type against known valid types
	if !isValidClientMessageType(msg.Type) {
		p.LogError("invalid message type", "type", msg.Type)
		return
	}

	// This is the standard ping message handled by Mattermost server. Nothing to do here.
	if msg.Type == "ping" {
		return
	}

	p.mut.RLock()
	us := p.sessions[connID]
	p.mut.RUnlock()

	if us == nil {
		// Only join doesn't require a prior session to exist.
		if msg.Type != clientMessageTypeJoin {
			return
		}
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
		jobID, _ := req.Data["jobID"].(string)
		av1Support, _ := req.Data["av1Support"].(bool)
		dcSignaling, _ := req.Data["dcSignaling"].(bool)
		remoteAddr, _ := req.Data[model.WebSocketRemoteAddr].(string)
		xff, _ := req.Data[model.WebSocketXForwardedFor].(string)

		joinData := callsJoinData{
			CallsClientJoinData{
				ChannelID:   channelID,
				Title:       title,
				ThreadID:    threadID,
				AV1Support:  av1Support,
				DCSignaling: dcSignaling,
				JobID:       jobID,
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
		if err := p.handleMetricMessage(public.MetricName(metricName), userID, req.Data["data"]); err != nil {
			p.LogError("handleMetricMessage failed", "err", err.Error())
			return
		}
		return
	}
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

func (p *Plugin) handleMetricMessage(metricName public.MetricName, userID string, _ any) error {
	// Bot only metrics
	if userID == p.getBotID() {
		switch metricName {
		case public.MetricLiveCaptionsWindowDropped:
			p.metrics.IncLiveCaptionsWindowDropped()
		case public.MetricLiveCaptionsTranscriberBufFull:
			p.metrics.IncLiveCaptionsTranscriberBufFull()
		case public.MetricLiveCaptionsPktPayloadChBufFull:
			p.metrics.IncLiveCaptionsPktPayloadChBufFull()
		}
	}

	return nil
}
