package main

import (
	"encoding/json"
	"fmt"
	"strings"
	"sync"
	"time"

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
	wsEventDeactivate       = "deactivate"
	wsEventUserRaiseHand    = "user_raise_hand"
	wsEventUserUnraiseHand  = "user_unraise_hand"
	wsEventJoin             = "join"
	wsEventError            = "error"
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
			Session: us.cfg,
			Type:    msgType,
			Data:    msg.Data,
		}

		select {
		case p.rtcServer.SendCh() <- rtcMsg:
		default:
			return fmt.Errorf("channel is full, dropping screen msg")
		}
	}

	p.API.PublishWebSocketEvent(wsMsgType, map[string]interface{}{
		"userID": us.userID,
	}, &model.WebsocketBroadcast{ChannelId: us.channelID})

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
				Session: us.cfg,
				Type:    rtc.SDPMessage,
				Data:    []byte(msg.Data),
			}

			select {
			case p.rtcServer.SendCh() <- rtcMsg:
			default:
				p.LogError("sendCh is full, dropping SDP msg")
			}
		}
	case clientMessageTypeICE:
		p.LogDebug("candidate!")
		if handlerID == p.nodeID {
			rtcMsg := rtc.Message{
				Session: us.cfg,
				Type:    rtc.ICEMessage,
				Data:    msg.Data,
			}

			select {
			case p.rtcServer.SendCh() <- rtcMsg:
			default:
				p.LogError("sendCh is full, dropping ICE msg")
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
				Session: us.cfg,
				Type:    msgType,
				Data:    msg.Data,
			}

			select {
			case p.rtcServer.SendCh() <- rtcMsg:
			default:
				p.LogError("sendCh is full, dropping State msg")
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
		}, &model.WebsocketBroadcast{ChannelId: us.channelID})
	case clientMessageTypeVoiceOn, clientMessageTypeVoiceOff:
		evType := wsEventUserVoiceOff
		if msg.Type == clientMessageTypeVoiceOn {
			evType = wsEventUserVoiceOn
		}
		p.API.PublishWebSocketEvent(evType, map[string]interface{}{
			"userID": us.userID,
		}, &model.WebsocketBroadcast{ChannelId: us.channelID})
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
		}, &model.WebsocketBroadcast{ChannelId: us.channelID})
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
	us := p.sessions[userID]
	p.mut.RUnlock()

	if us != nil && us.connID == connID {
		go func() {
			p.LogDebug("closing channel for session", "userID", userID, "connID", connID)
			close(us.wsCloseCh)
			<-us.doneCh
			p.LogDebug("done, removing session")
			p.mut.Lock()
			delete(p.sessions, userID)
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

func (p *Plugin) wsWriter() {
	for {
		select {
		case msg, ok := <-p.rtcServer.ReceiveCh():
			if !ok {
				return
			}
			p.metrics.IncWebSocketEvent("out", "signal")
			p.API.PublishWebSocketEvent(wsEventSignal, map[string]interface{}{
				"data":   string(msg.Data),
				"connID": msg.Session.SessionID,
			}, &model.WebsocketBroadcast{UserId: msg.Session.UserID})
		case <-p.stopCh:
			return
		}
	}
}

func (p *Plugin) handleJoin(userID, connID, channelID string) error {
	p.LogDebug("handleJoin", "userID", userID, "connID", connID)

	if !p.API.HasPermissionToChannel(userID, channelID, model.PermissionCreatePost) {
		return fmt.Errorf("forbidden")
	}
	channel, appErr := p.API.GetChannel(channelID)
	if appErr != nil {
		return appErr
	}

	p.mut.Lock()
	if _, exists := p.sessions[userID]; exists {
		p.mut.Unlock()
		p.LogDebug("session already exists", "userID", userID, "connID", connID)
		return fmt.Errorf("session already exists")
	}
	us := newUserSession(userID, channelID, connID)
	p.sessions[userID] = us
	p.mut.Unlock()
	defer func() {
		close(us.doneCh)
	}()

	state, err := p.addUserSession(userID, channelID)
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
		threadID, err := p.startNewCallThread(userID, channelID, state.Call.StartAt)
		if err != nil {
			p.LogError(err.Error())
		}

		// TODO: send all the info attached to a call.
		p.API.PublishWebSocketEvent(wsEventCallStart, map[string]interface{}{
			"channelID": channelID,
			"start_at":  state.Call.StartAt,
			"thread_id": threadID,
		}, &model.WebsocketBroadcast{ChannelId: channelID})
	}

	// send successful join response
	p.metrics.IncWebSocketEvent("out", "join")
	p.API.PublishWebSocketEvent(wsEventJoin, map[string]interface{}{
		"connID": connID,
	}, &model.WebsocketBroadcast{UserId: userID})
	p.metrics.IncWebSocketEvent("out", "user_connected")
	p.API.PublishWebSocketEvent(wsEventUserConnected, map[string]interface{}{
		"userID": userID,
	}, &model.WebsocketBroadcast{ChannelId: channelID})
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
	if handlerID == p.nodeID {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if err = p.rtcServer.InitSession(us.cfg); err != nil {
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

	wg.Add(1)
	go func() {
		defer wg.Done()
		p.wsReader(us, handlerID)
	}()

	select {
	case <-p.stopCh:
		p.LogDebug("stop received, exiting")
	case <-us.wsCloseCh:
		p.LogDebug("done")
	}

	if state, err := p.kvGetChannelState(channelID); err != nil {
		p.LogError(err.Error())
	} else if state.Call != nil && state.Call.ScreenSharingID == userID {
		p.API.PublishWebSocketEvent(wsEventUserScreenOff, map[string]interface{}{}, &model.WebsocketBroadcast{ChannelId: channelID})
	}

	if handlerID == p.nodeID {
		if err := p.rtcServer.CloseSession(us.cfg); err != nil {
			p.LogError(err.Error())
		}
	} else {
		if err := p.sendClusterMessage(clusterMessage{
			ConnID:    connID,
			UserID:    userID,
			ChannelID: channelID,
			SenderID:  p.nodeID,
		}, clusterMessageTypeDisconnect, handlerID); err != nil {
			p.LogError(err.Error())
		}
	}

	wg.Wait()

	p.API.PublishWebSocketEvent(wsEventUserDisconnected, map[string]interface{}{
		"userID": userID,
	}, &model.WebsocketBroadcast{ChannelId: channelID})
	p.track(evCallUserLeft, map[string]interface{}{
		"ParticipantID": userID,
		"ChannelID":     channelID,
		"CallID":        state.Call.ID,
	})

	p.LogDebug("removing session from state", "userID", userID)
	if currState, prevState, err := p.removeUserSession(userID, channelID); err != nil {
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

			if handlerID != p.nodeID {
				if err := p.sendClusterMessage(clusterMessage{
					ChannelID: channelID,
					SenderID:  p.nodeID,
				}, clusterMessageTypeCallEnded, handlerID); err != nil {
					p.LogError(err.Error())
				}
			}
		}
	}

	return nil
}

func (p *Plugin) WebSocketMessageHasBeenPosted(connID, userID string, req *model.WebSocketRequest) {
	var msg clientMessage
	msg.Type = strings.TrimPrefix(req.Action, wsActionPrefix)

	switch msg.Type {
	case clientMessageTypeJoin:
		channelID, ok := req.Data["channelID"].(string)
		if !ok {
			p.LogError("missing channelID")
			return
		}
		go func() {
			if err := p.handleJoin(userID, connID, channelID); err != nil {
				p.LogError(err.Error())
				p.metrics.IncWebSocketEvent("out", "error")
				p.API.PublishWebSocketEvent(wsEventError, map[string]interface{}{
					"data":   err.Error(),
					"connID": connID,
				}, &model.WebsocketBroadcast{UserId: userID})
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

	p.mut.RLock()
	us := p.sessions[userID]
	p.mut.RUnlock()
	if us == nil || us.connID != connID {
		return
	}
	select {
	case us.wsMsgCh <- msg:
	default:
		p.LogError("chan is full, dropping ws msg", "type", msg.Type)
		return
	}
}
