// Copyright (c) 2022-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"encoding/json"
	"fmt"
	"strings"
	"sync"
	"time"

	rtcd "github.com/mattermost/rtcd/service"
	"github.com/mattermost/rtcd/service/rtc"

	"github.com/mattermost/mattermost-server/v6/model"
)

const (
	wsEventSignal           = "signal"
	wsEventUserConnected    = "user_connected"
	wsEventUserDisconnected = "user_disconnected"
	wsEventUserMuted        = "user_muted"
	wsEventUserUnmuted      = "user_unmuted"
	wsEventUserVoiceOn      = "user_voice_on"
	wsEventUserVoiceOff     = "user_voice_off"
	wsEventUserScreenOn     = "user_screen_on"
	wsEventUserScreenOff    = "user_screen_off"
	wsEventCallStart        = "call_start"
	wsEventCallEnd          = "call_end"
	wsEventUserRaiseHand    = "user_raise_hand"
	wsEventUserUnraiseHand  = "user_unraise_hand"
	wsEventJoin             = "join"
	wsEventError            = "error"
	wsEventRecordingStart   = "recording_start"
	wsEventRecordingStop    = "recording_stop"
)

func (p *Plugin) handleClientMessageTypeScreen(us *session, msg clientMessage, handlerID string) error {
	data := map[string]string{}
	if msg.Type == clientMessageTypeScreenOn {
		if err := json.Unmarshal(msg.Data, &data); err != nil {
			return err
		}
	}

	if err := p.kvSetAtomicChannelState(us.channelID, func(state *channelState) (*channelState, error) {
		if state == nil {
			return nil, fmt.Errorf("channel state is missing from store")
		}
		if state.Call == nil {
			return nil, fmt.Errorf("call state is missing from channel state")
		}

		if msg.Type == clientMessageTypeScreenOn {
			if state.Call.ScreenSharingID != "" {
				return nil, fmt.Errorf("cannot start screen sharing, someone else is sharing already: %q", state.Call.ScreenSharingID)
			}
			state.Call.ScreenSharingID = us.userID
			state.Call.ScreenStreamID = data["screenStreamID"]
		} else {
			if state.Call.ScreenSharingID != us.userID {
				return nil, fmt.Errorf("cannot stop screen sharing, someone else is sharing already: %q", state.Call.ScreenSharingID)
			}
			state.Call.ScreenSharingID = ""
			state.Call.ScreenStreamID = ""
		}

		return state, nil
	}); err != nil {
		return err
	}

	msgType := rtc.ScreenOnMessage
	wsMsgType := wsEventUserScreenOn
	if msg.Type == clientMessageTypeScreenOff {
		msgType = rtc.ScreenOffMessage
		wsMsgType = wsEventUserScreenOff
	}

	if handlerID != p.nodeID {
		if err := p.sendClusterMessage(clusterMessage{
			ConnID:        us.connID,
			UserID:        us.userID,
			ChannelID:     us.channelID,
			SenderID:      p.nodeID,
			ClientMessage: msg,
		}, clusterMessageTypeUserState, handlerID); err != nil {
			return err
		}
	} else {
		rtcMsg := rtc.Message{
			SessionID: us.connID,
			Type:      msgType,
			Data:      msg.Data,
		}

		if err := p.sendRTCMessage(rtcMsg, us.channelID); err != nil {
			return fmt.Errorf("failed to send RTC message: %w", err)
		}
	}

	p.API.PublishWebSocketEvent(wsMsgType, map[string]interface{}{
		"userID": us.userID,
	}, &model.WebsocketBroadcast{ChannelId: us.channelID, ReliableClusterSend: true})

	return nil
}

func (p *Plugin) handleClientMsg(us *session, msg clientMessage, handlerID string) {
	p.metrics.IncWebSocketEvent("in", msg.Type)
	switch msg.Type {
	case clientMessageTypeSDP:
		// if I am not the handler for this we relay the signaling message.
		if handlerID != p.nodeID {
			// need to relay signaling.
			if err := p.sendClusterMessage(clusterMessage{
				ConnID:        us.connID,
				UserID:        us.userID,
				ChannelID:     us.channelID,
				SenderID:      p.nodeID,
				ClientMessage: msg,
			}, clusterMessageTypeSignaling, handlerID); err != nil {
				p.LogError(err.Error())
			}
		} else {
			rtcMsg := rtc.Message{
				SessionID: us.connID,
				Type:      rtc.SDPMessage,
				Data:      msg.Data,
			}

			if err := p.sendRTCMessage(rtcMsg, us.channelID); err != nil {
				p.LogError(fmt.Errorf("failed to send RTC message: %w", err).Error())
			}
		}
	case clientMessageTypeICE:
		p.LogDebug("candidate!")
		if handlerID == p.nodeID {
			rtcMsg := rtc.Message{
				SessionID: us.connID,
				Type:      rtc.ICEMessage,
				Data:      msg.Data,
			}

			if err := p.sendRTCMessage(rtcMsg, us.channelID); err != nil {
				p.LogError(fmt.Errorf("failed to send RTC message: %w", err).Error())
			}
		} else {
			// need to relay signaling.
			if err := p.sendClusterMessage(clusterMessage{
				ConnID:        us.connID,
				UserID:        us.userID,
				ChannelID:     us.channelID,
				SenderID:      p.nodeID,
				ClientMessage: msg,
			}, clusterMessageTypeSignaling, handlerID); err != nil {
				p.LogError(err.Error())
			}
		}
	case clientMessageTypeMute, clientMessageTypeUnmute:
		if handlerID != p.nodeID {
			// need to relay track event.
			if err := p.sendClusterMessage(clusterMessage{
				ConnID:        us.connID,
				UserID:        us.userID,
				ChannelID:     us.channelID,
				SenderID:      p.nodeID,
				ClientMessage: msg,
			}, clusterMessageTypeUserState, handlerID); err != nil {
				p.LogError(err.Error())
			}
		} else {
			msgType := rtc.UnmuteMessage
			if msg.Type == clientMessageTypeMute {
				msgType = rtc.MuteMessage
			}

			rtcMsg := rtc.Message{
				SessionID: us.connID,
				Type:      msgType,
				Data:      msg.Data,
			}

			if err := p.sendRTCMessage(rtcMsg, us.channelID); err != nil {
				p.LogError(fmt.Errorf("failed to send RTC message: %w", err).Error())
			}
		}

		if err := p.kvSetAtomicChannelState(us.channelID, func(state *channelState) (*channelState, error) {
			if state == nil {
				return nil, fmt.Errorf("channel state is missing from store")
			}
			if state.Call == nil {
				return nil, fmt.Errorf("call state is missing from channel state")
			}
			if uState := state.Call.Users[us.userID]; uState != nil {
				uState.Unmuted = msg.Type == clientMessageTypeUnmute
			}

			return state, nil
		}); err != nil {
			p.LogError(err.Error())
		}

		evType := wsEventUserUnmuted
		if msg.Type == clientMessageTypeMute {
			evType = wsEventUserMuted
		}
		p.API.PublishWebSocketEvent(evType, map[string]interface{}{
			"userID": us.userID,
		}, &model.WebsocketBroadcast{ChannelId: us.channelID, ReliableClusterSend: true})
	case clientMessageTypeVoiceOn, clientMessageTypeVoiceOff:
		evType := wsEventUserVoiceOff
		if msg.Type == clientMessageTypeVoiceOn {
			evType = wsEventUserVoiceOn
		}
		p.API.PublishWebSocketEvent(evType, map[string]interface{}{
			"userID": us.userID,
		}, &model.WebsocketBroadcast{ChannelId: us.channelID, ReliableClusterSend: true})
	case clientMessageTypeScreenOn, clientMessageTypeScreenOff:
		if err := p.handleClientMessageTypeScreen(us, msg, handlerID); err != nil {
			p.LogError(err.Error())
		}
	case clientMessageTypeRaiseHand, clientMessageTypeUnraiseHand:
		evType := wsEventUserUnraiseHand
		if msg.Type == clientMessageTypeRaiseHand {
			evType = wsEventUserRaiseHand
		}

		var ts int64
		if msg.Type == clientMessageTypeRaiseHand {
			ts = time.Now().UnixMilli()
		}

		if err := p.kvSetAtomicChannelState(us.channelID, func(state *channelState) (*channelState, error) {
			if state == nil {
				return nil, fmt.Errorf("channel state is missing from store")
			}
			if state.Call == nil {
				return nil, fmt.Errorf("call state is missing from channel state")
			}
			if uState := state.Call.Users[us.userID]; uState != nil {
				uState.RaisedHand = ts
			}

			return state, nil
		}); err != nil {
			p.LogError(err.Error())
		}

		p.API.PublishWebSocketEvent(evType, map[string]interface{}{
			"userID":      us.userID,
			"raised_hand": ts,
		}, &model.WebsocketBroadcast{ChannelId: us.channelID, ReliableClusterSend: true})
	default:
		p.LogError("invalid client message", "type", msg.Type)
		return
	}
}

func (p *Plugin) OnWebSocketDisconnect(connID, userID string) {
	if userID == "" {
		return
	}

	p.mut.RLock()
	us := p.sessions[connID]
	p.mut.RUnlock()

	if us != nil {
		go func() {
			p.LogDebug("closing channel for session", "userID", userID, "connID", connID, "channelID", us.channelID)
			close(us.wsCloseCh)
			<-us.doneCh
			p.LogDebug("done, removing session", "userID", userID, "connID", connID, "channelID", us.channelID)
			p.mut.Lock()
			delete(p.sessions, connID)
			p.mut.Unlock()
		}()
	}
}

func (p *Plugin) wsReader(us *session, handlerID string) {
	for {
		select {
		case msg, ok := <-us.wsMsgCh:
			if !ok {
				return
			}
			p.handleClientMsg(us, msg, handlerID)
		case <-us.wsCloseCh:
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
			p.metrics.IncWebSocketEvent("out", "signal")
			p.API.PublishWebSocketEvent(wsEventSignal, map[string]interface{}{
				"data":   string(msg.Data),
				"connID": msg.SessionID,
			}, &model.WebsocketBroadcast{UserId: us.userID, ReliableClusterSend: true})
		case <-p.stopCh:
			return
		}
	}
}

func (p *Plugin) handleJoin(userID, connID, channelID, title string) error {
	p.LogDebug("handleJoin", "userID", userID, "connID", connID, "channelID", channelID)

	if !p.API.HasPermissionToChannel(userID, channelID, model.PermissionCreatePost) {
		return fmt.Errorf("forbidden")
	}
	channel, appErr := p.API.GetChannel(channelID)
	if appErr != nil {
		return appErr
	}

	p.mut.Lock()
	if _, exists := p.sessions[connID]; exists {
		p.mut.Unlock()
		p.LogDebug("session already exists", "userID", userID, "connID", connID, "channelID", channelID)
		return fmt.Errorf("session already exists")
	}
	us := newUserSession(userID, channelID, connID)
	p.sessions[connID] = us
	p.mut.Unlock()
	defer func() {
		close(us.doneCh)
	}()

	state, err := p.addUserSession(userID, connID, channel)
	if err != nil {
		return fmt.Errorf("failed to add user session: %w", err)
	} else if state.Call == nil {
		return fmt.Errorf("state.Call should not be nil")
	} else if len(state.Call.Users) == 1 {
		p.track(evCallStarted, map[string]interface{}{
			"ParticipantID": userID,
			"CallID":        state.Call.ID,
			"ChannelID":     channelID,
			"ChannelType":   channel.Type,
		})

		// new call has started
		threadID, err := p.startNewCallThread(userID, channelID, state.Call.StartAt, title)
		if err != nil {
			p.LogError(err.Error())
		}

		// TODO: send all the info attached to a call.
		p.API.PublishWebSocketEvent(wsEventCallStart, map[string]interface{}{
			"channelID": channelID,
			"start_at":  state.Call.StartAt,
			"thread_id": threadID,
			"owner_id":  state.Call.OwnerID,
		}, &model.WebsocketBroadcast{ChannelId: channelID, ReliableClusterSend: true})
	}

	// send successful join response
	p.metrics.IncWebSocketEvent("out", "join")
	p.API.PublishWebSocketEvent(wsEventJoin, map[string]interface{}{
		"connID": connID,
	}, &model.WebsocketBroadcast{UserId: userID, ReliableClusterSend: true})
	p.metrics.IncWebSocketEvent("out", "user_connected")
	p.API.PublishWebSocketEvent(wsEventUserConnected, map[string]interface{}{
		"userID": userID,
	}, &model.WebsocketBroadcast{ChannelId: channelID, ReliableClusterSend: true})
	p.metrics.IncWebSocketConn(channelID)
	defer p.metrics.DecWebSocketConn(channelID)
	p.track(evCallUserJoined, map[string]interface{}{
		"ParticipantID": userID,
		"ChannelID":     channelID,
		"CallID":        state.Call.ID,
	})

	handlerID, err := p.getHandlerID()
	p.LogDebug("got handlerID", "handlerID", handlerID)
	if err != nil {
		p.LogError(err.Error())
	}
	if handlerID == "" {
		handlerID = state.NodeID
	}

	var wg sync.WaitGroup
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
			p.LogError(fmt.Errorf("failed to send client message: %w", err).Error())
		}
	} else {
		if handlerID == p.nodeID {
			wg.Add(1)
			go func() {
				defer wg.Done()
				cfg := rtc.SessionConfig{
					GroupID:   "default",
					CallID:    channelID,
					UserID:    userID,
					SessionID: connID,
				}
				p.LogDebug("initializing RTC session", "userID", userID, "connID", connID, "channelID", channelID)
				if err = p.rtcServer.InitSession(cfg, nil); err != nil {
					p.LogError(err.Error(), "connID", connID)
				}
			}()
		} else {
			if err := p.sendClusterMessage(clusterMessage{
				ConnID:    connID,
				UserID:    userID,
				ChannelID: channelID,
				SenderID:  p.nodeID,
			}, clusterMessageTypeConnect, handlerID); err != nil {
				p.LogError(err.Error())
			}
		}
	}

	wg.Add(1)
	go func() {
		defer wg.Done()
		p.wsReader(us, handlerID)
	}()

	select {
	case <-p.stopCh:
		p.LogDebug("stop received, exiting")
	case <-us.wsCloseCh:
		p.LogDebug("done", "userID", userID, "connID", connID, "channelID", channelID)
	}

	if state, err := p.kvGetChannelState(channelID); err != nil {
		p.LogError(err.Error())
	} else if state != nil && state.Call != nil && state.Call.ScreenSharingID == userID {
		p.API.PublishWebSocketEvent(wsEventUserScreenOff, map[string]interface{}{}, &model.WebsocketBroadcast{ChannelId: channelID, ReliableClusterSend: true})
	}

	if err := p.closeRTCSession(userID, connID, channelID, handlerID); err != nil {
		p.LogError(err.Error())
	}

	wg.Wait()

	p.API.PublishWebSocketEvent(wsEventUserDisconnected, map[string]interface{}{
		"userID": userID,
	}, &model.WebsocketBroadcast{ChannelId: channelID, ReliableClusterSend: true})
	p.track(evCallUserLeft, map[string]interface{}{
		"ParticipantID": userID,
		"ChannelID":     channelID,
		"CallID":        state.Call.ID,
	})

	p.LogDebug("removing session from state", "userID", userID)
	if currState, prevState, err := p.removeUserSession(userID, connID, channelID); err != nil {
		p.LogError(err.Error())
	} else if currState.Call == nil && prevState.Call != nil {
		// call has ended
		if dur, err := p.updateCallThreadEnded(prevState.Call.ThreadID); err != nil {
			p.LogError(err.Error())
		} else {
			p.track(evCallEnded, map[string]interface{}{
				"ChannelID":    channelID,
				"CallID":       prevState.Call.ID,
				"Duration":     dur,
				"Participants": prevState.Call.Stats.Participants,
			})
		}
	}

	return nil
}

func (p *Plugin) WebSocketMessageHasBeenPosted(connID, userID string, req *model.WebSocketRequest) {
	var msg clientMessage
	msg.Type = strings.TrimPrefix(req.Action, wsActionPrefix)

	p.mut.RLock()
	us := p.sessions[connID]
	p.mut.RUnlock()

	if msg.Type != clientMessageTypeJoin && us == nil {
		return
	}

	if us != nil && !us.limiter.Allow() {
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
		go func() {
			if err := p.handleJoin(userID, connID, channelID, title); err != nil {
				p.LogError(err.Error())
				p.metrics.IncWebSocketEvent("out", "error")
				p.API.PublishWebSocketEvent(wsEventError, map[string]interface{}{
					"data":   err.Error(),
					"connID": connID,
				}, &model.WebsocketBroadcast{UserId: userID, ReliableClusterSend: true})
				return
			}
		}()
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
	}

	select {
	case us.wsMsgCh <- msg:
	default:
		p.LogError("chan is full, dropping ws msg", "type", msg.Type)
		return
	}
}

func (p *Plugin) closeRTCSession(userID, connID, channelID, handlerID string) error {
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
