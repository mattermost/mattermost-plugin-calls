package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"time"

	"github.com/mattermost/mattermost-server/v5/model"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{} // use default options

const (
	wsEventUserConnected    = "user_connected"
	wsEventUserDisconnected = "user_disconnected"
	wsEventUserMuted        = "user_muted"
	wsEventUserUnmuted      = "user_unmuted"
	wsEventUserVoiceOn      = "user_voice_on"
	wsEventUserVoiceOff     = "user_voice_off"

	wsPingDuration = 10 * time.Second
)

func (p *Plugin) wsWriter(us *session, doneCh chan struct{}) {
	pingTicker := time.NewTicker(wsPingDuration)
	defer pingTicker.Stop()
	for {
		select {
		case msg := <-us.wsOutCh:
			err := us.wsConn.WriteMessage(websocket.TextMessage, msg)
			if err != nil {
				p.API.LogError(err.Error())
			}
		case <-pingTicker.C:
			err := us.wsConn.WriteMessage(websocket.TextMessage, json.RawMessage(`{"type":"ping"}`))
			if err != nil {
				p.API.LogError(err.Error())
			}
			pingTicker.Reset(wsPingDuration)
		case <-doneCh:
			return
		}
	}
}

func (p *Plugin) wsReader(us *session, handlerID string, doneCh chan struct{}) {
	for {
		_, data, err := us.wsConn.ReadMessage()
		if err != nil {
			p.API.LogError(err.Error())
			close(doneCh)
			return
		}

		var msg clientMessage
		if err := msg.FromJSON(data); err != nil {
			p.API.LogError(err.Error())
			continue
		}

		switch msg.Type {
		case clientMessageTypeSignal:
			// if I am not the handler for this we relay the signaling message.
			if handlerID != p.nodeID {
				// need to relay signaling.
				if err := p.sendClusterMessage(clusterMessage{
					UserID:        us.userID,
					ChannelID:     us.channelID,
					SenderID:      p.nodeID,
					ClientMessage: msg,
				}, clusterMessageTypeSignaling, handlerID); err != nil {
					p.API.LogError(err.Error())
				}
			} else {
				select {
				case us.wsInCh <- []byte(msg.Data):
				default:
					p.API.LogError("channel is full, dropping msg")
				}
			}
		case clientMessageTypeICE:
			// TODO: handle ICE properly.
			p.LogDebug("candidate!")
		case clientMessageTypeMute, clientMessageTypeUnmute:
			us.mut.Lock()
			us.isMuted = (msg.Type == clientMessageTypeMute)
			us.mut.Unlock()
			evType := wsEventUserUnmuted
			if msg.Type == clientMessageTypeMute {
				evType = wsEventUserMuted
			}
			p.API.PublishWebSocketEvent(evType, map[string]interface{}{
				"userID": us.userID,
			}, &model.WebsocketBroadcast{ChannelId: us.channelID})
		case clientMessageTypeVoiceOn, clientMessageTypeVoiceOff:
			us.mut.Lock()
			us.isSpeaking = (msg.Type == clientMessageTypeVoiceOn)
			us.mut.Unlock()
			evType := wsEventUserVoiceOff
			if msg.Type == clientMessageTypeVoiceOn {
				evType = wsEventUserVoiceOn
			}
			p.API.PublishWebSocketEvent(evType, map[string]interface{}{
				"userID": us.userID,
			}, &model.WebsocketBroadcast{ChannelId: us.channelID})
		}
	}
}

func (p *Plugin) handleWebSocket(w http.ResponseWriter, r *http.Request, channelID string) {
	userID := r.Header.Get("Mattermost-User-Id")
	nodeID := p.nodeID

	if !p.API.HasPermissionToChannel(userID, channelID, model.PERMISSION_CREATE_POST) {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}

	p.mut.RLock()
	_, exists := p.sessions[userID]
	if exists {
		http.Error(w, "Session exists", http.StatusBadRequest)
		p.mut.RUnlock()
		return
	}
	p.mut.RUnlock()

	var handlerID string
	if err := p.kvSetAtomicChannelState(channelID, func(state *channelState) (*channelState, error) {
		if state == nil {
			return nil, fmt.Errorf("channel state is missing from store")
		}
		if state.NodeID == "" {
			state.NodeID = nodeID
			handlerID = nodeID
			return state, nil
		}
		handlerID = state.NodeID
		return nil, nil
	}); err != nil {
		p.API.LogError(err.Error())
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		p.API.LogError(err.Error())
		return
	}

	p.LogDebug("ws connected")

	us := newUserSession(userID, channelID)
	us.wsConn = conn
	if err := p.addUserSession(userID, channelID, us); err != nil {
		p.API.LogError(err.Error())
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	var wg sync.WaitGroup
	doneCh := make(chan struct{})

	if handlerID == nodeID {
		wg.Add(1)
		go func() {
			defer wg.Done()
			p.handleTracks(userID)
			p.LogDebug("handleTracks DONE")
		}()
	} else {
		if err := p.sendClusterMessage(clusterMessage{
			UserID:    userID,
			ChannelID: channelID,
			SenderID:  p.nodeID,
		}, clusterMessageTypeConnect, handlerID); err != nil {
			p.API.LogError(err.Error())
		}
	}

	p.API.PublishWebSocketEvent(wsEventUserConnected, map[string]interface{}{
		"userID": userID,
	}, &model.WebsocketBroadcast{ChannelId: channelID})

	wg.Add(1)
	go func() {
		defer wg.Done()
		p.wsReader(us, handlerID, doneCh)
	}()

	wg.Add(1)
	go func() {
		defer wg.Done()
		p.wsWriter(us, doneCh)
	}()

	select {
	case <-p.stopCh:
		p.LogDebug("stop received, closing connection")
		conn.Close()
	case <-doneCh:
		p.LogDebug("done")
	}

	if err := p.removeUserSession(userID, channelID); err != nil {
		p.API.LogError(err.Error())
	}

	if handlerID != nodeID {
		if err := p.sendClusterMessage(clusterMessage{
			UserID:    userID,
			ChannelID: channelID,
			SenderID:  p.nodeID,
		}, clusterMessageTypeDisconnect, handlerID); err != nil {
			p.API.LogError(err.Error())
		}
	}

	p.API.PublishWebSocketEvent(wsEventUserDisconnected, map[string]interface{}{
		"userID": userID,
	}, &model.WebsocketBroadcast{ChannelId: channelID})

	close(us.wsInCh)
	wg.Wait()
	close(us.wsOutCh)
}
