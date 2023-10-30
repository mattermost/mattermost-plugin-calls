// Copyright (c) 2022-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"encoding/json"
	"fmt"
	"strings"
	"sync/atomic"
	"time"

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
	wsEventCallRecordingState        = "call_recording_state"
	wsEventUserDismissedNotification = "user_dismissed_notification"
	wsReconnectionTimeout            = 10 * time.Second
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

func (p *Plugin) publishWebSocketEvent(ev string, data map[string]interface{}, broadcast *model.WebsocketBroadcast) {
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
	if botID != "" && broadcast != nil && broadcast.ChannelId != "" {
		if data == nil {
			data = map[string]interface{}{}
		}
		data["channelID"] = broadcast.ChannelId
		p.metrics.IncWebSocketEvent("out", ev)
		p.API.PublishWebSocketEvent(ev, data, &model.WebsocketBroadcast{
			UserId: botID,
		})
		if broadcast.OmitUsers == nil {
			broadcast.OmitUsers = map[string]bool{
				botID: true,
			}
		} else {
			broadcast.OmitUsers[botID] = true
		}
	}

	p.metrics.IncWebSocketEvent("out", ev)
	p.API.PublishWebSocketEvent(ev, data, broadcast)
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

	state, err := p.lockCall(us.channelID)
	if err != nil {
		return fmt.Errorf("failed to lock call: %w", err)
	}
	defer p.unlockCall(us.channelID)
	if state == nil {
		return fmt.Errorf("channel state is missing from store")
	}
	if state.Call == nil {
		return fmt.Errorf("call state is missing from channel state")
	}

	if msg.Type == clientMessageTypeScreenOn {
		if state.Call.ScreenSharingID != "" {
			return fmt.Errorf("cannot start screen sharing, someone else is sharing already: connID=%s", state.Call.ScreenSharingID)
		}
		state.Call.ScreenSharingID = us.originalConnID
		state.Call.ScreenStreamID = data["screenStreamID"]
		state.Call.ScreenStartAt = time.Now().Unix()
	} else {
		if state.Call.ScreenSharingID != us.originalConnID {
			return fmt.Errorf("cannot stop screen sharing, someone else is sharing already: connID=%s", state.Call.ScreenSharingID)
		}
		state.Call.ScreenSharingID = ""
		state.Call.ScreenStreamID = ""
		if state.Call.ScreenStartAt > 0 {
			state.Call.Stats.ScreenDuration += secondsSinceTimestamp(state.Call.ScreenStartAt)
			state.Call.ScreenStartAt = 0
		}
	}
	if err := p.kvSetChannelState(us.channelID, state); err != nil {
		return fmt.Errorf("failed to set channel state: %w", err)
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

		if err := p.sendRTCMessage(rtcMsg, us.channelID); err != nil {
			p.LogError("failed to send RTC message", "error", err)
		}
	}

	p.publishWebSocketEvent(wsMsgType, map[string]interface{}{
		"userID":     us.userID,
		"session_id": us.originalConnID,
	}, &model.WebsocketBroadcast{ChannelId: us.channelID, ReliableClusterSend: true})

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

			if err := p.sendRTCMessage(rtcMsg, us.channelID); err != nil {
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

			if err := p.sendRTCMessage(rtcMsg, us.channelID); err != nil {
				return fmt.Errorf("failed to send RTC message: %w", err)
			}
		} else {
			// need to relay signaling.
			if err := p.sendClusterMessage(clusterMessage{
				ConnID:        us.originalConnID,
				UserID:        us.userID,
				ChannelID:     us.channelID,
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

			if err := p.sendRTCMessage(rtcMsg, us.channelID); err != nil {
				return fmt.Errorf("failed to send RTC message: %w", err)
			}
		}

		state, err := p.lockCall(us.channelID)
		if err != nil {
			return fmt.Errorf("failed to lock call: %w", err)
		}
		defer p.unlockCall(us.channelID)
		if state == nil {
			return fmt.Errorf("channel state is missing from store")
		}
		if state.Call == nil {
			return fmt.Errorf("call state is missing from channel state")
		}
		uState := state.Call.Sessions[us.originalConnID]
		if uState == nil {
			return fmt.Errorf("user state is missing from call state")
		}
		uState.Unmuted = msg.Type == clientMessageTypeUnmute
		if err := p.kvSetChannelState(us.channelID, state); err != nil {
			return fmt.Errorf("failed to set channel state: %w", err)
		}

		evType := wsEventUserUnmuted
		if msg.Type == clientMessageTypeMute {
			evType = wsEventUserMuted
		}
		p.publishWebSocketEvent(evType, map[string]interface{}{
			"userID":     us.userID,
			"session_id": us.originalConnID,
		}, &model.WebsocketBroadcast{ChannelId: us.channelID, ReliableClusterSend: true})
	case clientMessageTypeScreenOn, clientMessageTypeScreenOff:
		if err := p.handleClientMessageTypeScreen(us, msg, handlerID); err != nil {
			return err
		}
	case clientMessageTypeRaiseHand, clientMessageTypeUnraiseHand:
		evType := wsEventUserUnraiseHand
		if msg.Type == clientMessageTypeRaiseHand {
			evType = wsEventUserRaiseHand
		}

		state, err := p.lockCall(us.channelID)
		if err != nil {
			return fmt.Errorf("failed to lock call: %w", err)
		}
		defer p.unlockCall(us.channelID)
		if state == nil {
			return fmt.Errorf("channel state is missing from store")
		}
		if state.Call == nil {
			return fmt.Errorf("call state is missing from channel state")
		}
		uState := state.Call.Sessions[us.originalConnID]
		if uState == nil {
			return fmt.Errorf("user state is missing from call state")
		}
		if msg.Type == clientMessageTypeRaiseHand {
			uState.RaisedHand = time.Now().UnixMilli()
		} else {
			uState.RaisedHand = 0
		}
		if err := p.kvSetChannelState(us.channelID, state); err != nil {
			return fmt.Errorf("failed to set channel state: %w", err)
		}

		p.publishWebSocketEvent(evType, map[string]interface{}{
			"userID":      us.userID,
			"session_id":  us.originalConnID,
			"raised_hand": uState.RaisedHand,
		}, &model.WebsocketBroadcast{ChannelId: us.channelID, ReliableClusterSend: true})
	case clientMessageTypeReact:
		evType := wsEventUserReacted

		var emoji EmojiData
		if err := json.Unmarshal(msg.Data, &emoji); err != nil {
			return fmt.Errorf("failed to unmarshal emoji data: %w", err)
		}

		p.publishWebSocketEvent(evType, map[string]interface{}{
			"user_id":    us.userID,
			"session_id": us.originalConnID,
			"emoji":      emoji.toMap(),
			"timestamp":  time.Now().UnixMilli(),
		}, &model.WebsocketBroadcast{ChannelId: us.channelID})
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
	}
}

func (p *Plugin) wsReader(us *session, handlerID string) {
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
		}
	}
}

func (p *Plugin) sendRTCMessage(msg rtc.Message, channelID string) error {
	if p.rtcdManager != nil {
		cm := rtcd.ClientMessage{
			Type: rtcd.ClientMessageRTC,
			Data: msg,
		}
		return p.rtcdManager.Send(cm, channelID)
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
				p.publishWebSocketEvent(evType, map[string]interface{}{
					"userID":     us.userID,
					"session_id": us.originalConnID,
				}, &model.WebsocketBroadcast{ChannelId: us.channelID})
				continue
			}

			p.publishWebSocketEvent(wsEventSignal, map[string]interface{}{
				"data":   string(msg.Data),
				"connID": msg.SessionID,
			}, &model.WebsocketBroadcast{UserId: us.userID, ReliableClusterSend: true})
		case <-p.stopCh:
			return
		}
	}
}

func (p *Plugin) handleLeave(us *session, userID, connID, channelID string) error {
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

	state, err := p.kvGetChannelState(channelID, false)
	if err != nil {
		return err
	}

	handlerID, err := p.getHandlerID()
	if err != nil {
		p.LogError(err.Error())
	}
	if handlerID == "" && state != nil {
		handlerID = state.NodeID
	}

	if err := p.closeRTCSession(userID, us.originalConnID, channelID, handlerID); err != nil {
		p.LogError(err.Error())
	}

	if err := p.removeSession(us); err != nil {
		p.LogError(err.Error())
	}

	if state != nil && state.Call != nil {
		p.track(evCallUserLeft, map[string]interface{}{
			"ParticipantID": userID,
			"ChannelID":     channelID,
			"CallID":        state.Call.ID,
		})
	}

	return nil
}

func (p *Plugin) handleJoin(userID, connID string, joinData CallsClientJoinData) (retErr error) {
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

	prevState, err := p.lockCall(channelID)
	if err != nil {
		return fmt.Errorf("failed to lock call: %w", err)
	}

	state, err := p.addUserSession(prevState, userID, connID, channelID, joinData.JobID)
	if err != nil {
		p.unlockCall(channelID)
		return fmt.Errorf("failed to add user session: %w", err)
	} else if state.Call == nil {
		p.unlockCall(channelID)
		return fmt.Errorf("state.Call should not be nil")
	} else if len(state.Call.Sessions) == 1 {
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
		if err := p.kvSetChannelState(channelID, state); err != nil {
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
			"host_id":   state.Call.HostID,
		}, &model.WebsocketBroadcast{ChannelId: channelID, ReliableClusterSend: true})

		p.track(evCallStarted, map[string]interface{}{
			"ParticipantID": userID,
			"CallID":        state.Call.ID,
			"ChannelID":     channelID,
			"ChannelType":   channel.Type,
		})
	}

	handlerID, err := p.getHandlerID()
	if err != nil {
		p.LogError(err.Error())
	}
	if handlerID == "" {
		handlerID = state.NodeID
	}
	p.LogDebug("got handlerID", "handlerID", handlerID)

	us := newUserSession(userID, channelID, connID, p.rtcdManager == nil && handlerID == p.nodeID)
	p.mut.Lock()
	p.sessions[connID] = us
	p.mut.Unlock()
	defer func() {
		if retErr != nil {
			p.unlockCall(channelID)
		}
		if err := p.handleLeave(us, userID, connID, channelID); err != nil {
			p.LogError(err.Error())
		}
	}()

	if p.rtcdManager != nil {
		msg := rtcd.ClientMessage{
			Type: rtcd.ClientMessageJoin,
			Data: map[string]string{
				"callID":    channelID,
				"userID":    userID,
				"sessionID": connID,
			},
		}
		if err := p.rtcdManager.Send(msg, channelID); err != nil {
			return fmt.Errorf("failed to send client join message: %w", err)
		}
	} else {
		if handlerID == p.nodeID {
			cfg := rtc.SessionConfig{
				GroupID:   "default",
				CallID:    channelID,
				UserID:    userID,
				SessionID: connID,
			}
			p.LogDebug("initializing RTC session", "userID", userID, "connID", connID, "channelID", channelID)
			if err = p.rtcServer.InitSession(cfg, func() error {
				if atomic.CompareAndSwapInt32(&us.rtcClosed, 0, 1) {
					close(us.rtcCloseCh)
					return p.removeSession(us)
				}
				return nil
			}); err != nil {
				return fmt.Errorf("failed to init session: %w", err)
			}
		} else {
			if err := p.sendClusterMessage(clusterMessage{
				ConnID:    connID,
				UserID:    userID,
				ChannelID: channelID,
				SenderID:  p.nodeID,
			}, clusterMessageTypeConnect, handlerID); err != nil {
				return fmt.Errorf("failed to send connect message: %w", err)
			}
		}
	}

	// send successful join response
	p.publishWebSocketEvent(wsEventJoin, map[string]interface{}{
		"connID": connID,
	}, &model.WebsocketBroadcast{UserId: userID, ReliableClusterSend: true})

	if len(state.Call.sessionsForUser(userID)) == 1 {
		// Only send event on first session join.
		// This is to keep backwards compatibility with clients not supporting
		// multi-sessions.
		p.publishWebSocketEvent(wsEventUserConnected, map[string]interface{}{
			"userID": userID,
		}, &model.WebsocketBroadcast{ChannelId: channelID, ReliableClusterSend: true})
	}

	p.publishWebSocketEvent(wsEventUserJoined, map[string]interface{}{
		"user_id":    userID,
		"session_id": connID,
	}, &model.WebsocketBroadcast{ChannelId: channelID, ReliableClusterSend: true})

	if userID == p.getBotID() && state.Call.Recording != nil {
		p.publishWebSocketEvent(wsEventCallRecordingState, map[string]interface{}{
			"callID":   channelID,
			"recState": state.Call.Recording.getClientState().toMap(),
		}, &model.WebsocketBroadcast{ChannelId: channelID, ReliableClusterSend: true})
	}

	clientStateData, err := json.Marshal(state.Call.getClientState(p.getBotID(), userID))
	if err != nil {
		p.LogError("failed to marshal client state", "err", err.Error())
	} else {
		p.publishWebSocketEvent(wsEventCallState, map[string]interface{}{
			"channel_id": channelID,
			"call":       string(clientStateData),
		}, &model.WebsocketBroadcast{UserId: userID, ReliableClusterSend: true})
	}

	p.unlockCall(channelID)

	p.metrics.IncWebSocketConn()
	defer p.metrics.DecWebSocketConn()
	p.track(evCallUserJoined, map[string]interface{}{
		"ParticipantID": userID,
		"ChannelID":     channelID,
		"CallID":        state.Call.ID,
	})

	p.wsReader(us, handlerID)

	return nil
}

func (p *Plugin) handleReconnect(userID, connID, channelID, originalConnID, prevConnID string) error {
	p.LogDebug("handleReconnect", "userID", userID, "connID", connID, "channelID", channelID,
		"originalConnID", originalConnID, "prevConnID", prevConnID)

	if !p.isBot(userID) && !p.API.HasPermissionToChannel(userID, channelID, model.PermissionCreatePost) {
		return fmt.Errorf("forbidden")
	}

	state, err := p.kvGetChannelState(channelID, false)
	if err != nil {
		return err
	} else if state == nil || state.Call == nil {
		return fmt.Errorf("call state not found")
	} else if state, ok := state.Call.Sessions[originalConnID]; !ok || state.UserID != userID {
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

	us = newUserSession(userID, channelID, connID, rtc)
	us.originalConnID = originalConnID
	p.sessions[connID] = us
	p.mut.Unlock()

	if err := p.sendClusterMessage(clusterMessage{
		ConnID:   prevConnID,
		UserID:   userID,
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
		if err := p.rtcdManager.Send(msg, channelID); err != nil {
			return fmt.Errorf("failed to send client reconnect message: %w", err)
		}
	}

	handlerID, err := p.getHandlerID()
	if err != nil {
		p.LogError(err.Error())
	}
	if handlerID == "" && state != nil {
		handlerID = state.NodeID
	}

	p.wsReader(us, handlerID)

	if err := p.handleLeave(us, userID, connID, channelID); err != nil {
		p.LogError(err.Error())
	}

	return nil
}

func (p *Plugin) WebSocketMessageHasBeenPosted(connID, userID string, req *model.WebSocketRequest) {
	var msg clientMessage
	msg.Type = strings.TrimPrefix(req.Action, wsActionPrefix)

	p.mut.RLock()
	us := p.sessions[connID]
	p.mut.RUnlock()

	if msg.Type != clientMessageTypeJoin &&
		msg.Type != clientMessageTypeLeave &&
		msg.Type != clientMessageTypeReconnect && us == nil {
		return
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

		joinData := CallsClientJoinData{
			channelID,
			title,
			threadID,
			jobID,
		}

		go func() {
			if err := p.handleJoin(userID, connID, joinData); err != nil {
				p.LogWarn(err.Error(), "userID", userID, "connID", connID, "channelID", channelID)
				p.publishWebSocketEvent(wsEventError, map[string]interface{}{
					"data":   err.Error(),
					"connID": connID,
				}, &model.WebsocketBroadcast{UserId: userID, ReliableClusterSend: true})
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
			if err := p.handleReconnect(userID, connID, channelID, originalConnID, prevConnID); err != nil {
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

	}

	select {
	case us.wsMsgCh <- msg:
	default:
		p.LogError("chan is full, dropping ws msg", "type", msg.Type)
		return
	}
}

func (p *Plugin) closeRTCSession(userID, connID, channelID, handlerID string) error {
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
		if err := p.rtcdManager.Send(msg, channelID); err != nil {
			return fmt.Errorf("failed to send client message: %w", err)
		}
	}

	return nil
}
