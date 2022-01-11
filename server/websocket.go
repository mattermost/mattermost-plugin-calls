package main

import (
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/mattermost/mattermost-server/v6/model"

	"github.com/prometheus/client_golang/prometheus"
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
)

func (p *Plugin) handleClientMessageTypeScreen(msg clientMessage, channelID, userID string) error {
	if err := p.kvSetAtomicChannelState(channelID, func(state *channelState) (*channelState, error) {
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
			state.Call.ScreenSharingID = userID
		} else {
			if state.Call.ScreenSharingID != userID {
				return nil, fmt.Errorf("cannot stop screen sharing, someone else is sharing already: %q", state.Call.ScreenSharingID)
			}
			state.Call.ScreenSharingID = ""
			if call := p.getCall(channelID); call != nil {
				call.setScreenSession(nil)
			}
		}

		return state, nil
	}); err != nil {
		return err
	}

	if msg.Type == clientMessageTypeScreenOn {
		p.API.PublishWebSocketEvent(wsEventUserScreenOn, map[string]interface{}{
			"userID": userID,
		}, &model.WebsocketBroadcast{ChannelId: channelID})
	} else {
		p.API.PublishWebSocketEvent(wsEventUserScreenOff, map[string]interface{}{}, &model.WebsocketBroadcast{ChannelId: channelID})
	}

	return nil
}

func (p *Plugin) handleClientMsg(us *session, msg clientMessage, handlerID string) {
	p.metrics.WebSocketEventCounters.With(prometheus.Labels{"direction": "in", "type": msg.Type}).Inc()
	switch msg.Type {
	case clientMessageTypeSDP:
		// if I am not the handler for this we relay the signaling message.
		if handlerID != p.nodeID {
			// need to relay signaling.
			if err := p.sendClusterMessage(clusterMessage{
				UserID:        us.userID,
				ChannelID:     us.channelID,
				SenderID:      p.nodeID,
				ClientMessage: msg,
			}, clusterMessageTypeSignaling, handlerID); err != nil {
				p.LogError(err.Error())
			}
		} else {
			select {
			case us.signalInCh <- []byte(msg.Data):
			default:
				p.LogError("signalInCh is full, dropping SDP msg")
			}
		}
	case clientMessageTypeICE:
		p.LogDebug("candidate!")
		if handlerID == p.nodeID {
			select {
			case us.iceCh <- msg.Data:
			default:
				p.LogError("iceCh channel is full, dropping ICE msg")
			}
		} else {
			// need to relay signaling.
			if err := p.sendClusterMessage(clusterMessage{
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
				UserID:        us.userID,
				ChannelID:     us.channelID,
				SenderID:      p.nodeID,
				ClientMessage: msg,
			}, clusterMessageTypeUserState, handlerID); err != nil {
				p.LogError(err.Error())
			}
		} else {
			select {
			case us.trackEnableCh <- (msg.Type == clientMessageTypeMute):
			default:
				p.LogError("trackEnableCh channel is full, dropping msg")
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
		if err := p.handleClientMessageTypeScreen(msg, us.channelID, us.userID); err != nil {
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

func (p *Plugin) OnWebSocketConnect(webConnID, userID string) {
	p.LogDebug("ws connect", "connID", webConnID, "userID", userID)
}

func (p *Plugin) OnWebSocketDisconnect(webConnID, userID string) {
	p.LogDebug("ws disconnect", "connID", webConnID, "userID", userID)
	p.mut.RLock()
	defer p.mut.RUnlock()
	us := p.sessions[userID]
	if us != nil && us.connID == webConnID {
		close(us.wsCloseCh)
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

func (p *Plugin) wsWriter(us *session) {
	for {
		select {
		case msg, ok := <-us.signalOutCh:
			if !ok {
				return
			}
			p.metrics.WebSocketEventCounters.With(prometheus.Labels{"direction": "out", "type": "signal"}).Inc()
			p.API.PublishWebSocketEvent(wsEventSignal, map[string]interface{}{
				"data": string(msg),
			}, &model.WebsocketBroadcast{UserId: us.userID})
		case <-us.wsCloseCh:
			return
		}
	}
}

func (p *Plugin) handleJoin(userID, connID, channelID string) error {
	p.LogDebug("handleJoin")
	nodeID := p.nodeID

	if !p.API.HasPermissionToChannel(userID, channelID, model.PermissionCreatePost) {
		return fmt.Errorf("forbidden")
	}

	us := newUserSession(userID, channelID, connID)

	p.mut.Lock()
	_, exists := p.sessions[userID]
	if exists {
		p.mut.Unlock()
		return fmt.Errorf("session exists")
	}
	p.LogDebug("adding session", "UserID", userID, "ChannelID", channelID)
	p.sessions[userID] = us
	defer func() {
		p.mut.Lock()
		p.LogDebug("removing session", "UserID", userID, "ChannelID", channelID)
		delete(p.sessions, userID)
		p.mut.Unlock()
	}()
	p.mut.Unlock()

	p.metrics.WebSocketConnections.With(prometheus.Labels{"channelID": channelID}).Inc()
	defer p.metrics.WebSocketConnections.With(prometheus.Labels{"channelID": channelID}).Dec()

	state, err := p.addUserSession(userID, channelID, us)
	if err != nil {
		return fmt.Errorf("failed to add user session: %w", err)
	} else if state.Call == nil {
		return fmt.Errorf("state.Call should not be nil")
	} else if len(state.Call.Users) == 1 {
		p.mut.Lock()
		p.calls[channelID] = &call{
			channelID: channelID,
			sessions:  map[string]*session{},
		}
		p.mut.Unlock()

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

	data, appErr := p.API.KVGet("handler")
	if appErr != nil {
		p.LogError(appErr.Error())
	}
	handlerID := string(data)
	if handlerID == "" {
		handlerID = state.NodeID
	}

	var wg sync.WaitGroup
	if handlerID == nodeID {
		wg.Add(1)
		go func() {
			defer wg.Done()
			p.metrics.RTCSessions.With(prometheus.Labels{"channelID": channelID}).Inc()
			defer p.metrics.RTCSessions.With(prometheus.Labels{"channelID": channelID}).Dec()
			p.initRTCConn(userID)
			p.LogDebug("initRTCConn DONE")
			p.handleTracks(us)
			p.LogDebug("handleTracks DONE")
		}()
	} else {
		if err := p.sendClusterMessage(clusterMessage{
			UserID:    userID,
			ChannelID: channelID,
			SenderID:  p.nodeID,
		}, clusterMessageTypeConnect, handlerID); err != nil {
			p.LogError(err.Error())
		}
	}

	p.API.PublishWebSocketEvent(wsEventUserConnected, map[string]interface{}{
		"userID": userID,
	}, &model.WebsocketBroadcast{ChannelId: channelID})

	wg.Add(1)
	go func() {
		defer wg.Done()
		p.wsReader(us, handlerID)
	}()

	wg.Add(1)
	go func() {
		defer wg.Done()
		p.wsWriter(us)
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

	if handlerID != nodeID {
		if err := p.sendClusterMessage(clusterMessage{
			UserID:    userID,
			ChannelID: channelID,
			SenderID:  p.nodeID,
		}, clusterMessageTypeDisconnect, handlerID); err != nil {
			p.LogError(err.Error())
		}
	}

	if us.rtcConn != nil {
		us.rtcConn.Close()
	}

	close(us.closeCh)
	close(us.signalInCh)
	wg.Wait()
	close(us.signalOutCh)

	p.API.PublishWebSocketEvent(wsEventUserDisconnected, map[string]interface{}{
		"userID": userID,
	}, &model.WebsocketBroadcast{ChannelId: channelID})

	if currState, prevState, err := p.removeUserSession(userID, channelID); err != nil {
		p.LogError(err.Error())
	} else if currState.Call == nil && prevState.Call != nil {
		// call has ended
		if err := p.updateCallThreadEnded(prevState.Call.ThreadID); err != nil {
			p.LogError(err.Error())
		}
	}

	return nil
}

func (p *Plugin) WebSocketMessageHasBeenPosted(webConnID, userID string, req *model.WebSocketRequest) {
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
			if err := p.handleJoin(userID, webConnID, channelID); err != nil {
				p.LogError(err.Error())
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
	case clientMessageTypeICE:
		msgData, ok := req.Data["data"].(string)
		if !ok {
			p.LogError("invalid or missing ice data")
			return
		}
		msg.Data = []byte(msgData)
	}

	p.mut.RLock()
	us := p.sessions[userID]
	p.mut.RUnlock()
	if us == nil || us.connID != webConnID {
		return
	}
	select {
	case us.wsMsgCh <- msg:
	default:
		p.LogError("chan is full, dropping ws msg", "type", msg.Type)
		return
	}
}
