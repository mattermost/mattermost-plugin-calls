package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"time"

	"github.com/mattermost/mattermost-server/v6/model"

	"github.com/gorilla/websocket"
	"github.com/prometheus/client_golang/prometheus"
)

var upgrader = websocket.Upgrader{} // use default options

const (
	wsEventUserConnected    = "user_connected"
	wsEventUserDisconnected = "user_disconnected"
	wsEventUserMuted        = "user_muted"
	wsEventUserUnmuted      = "user_unmuted"
	wsEventUserVoiceOn      = "user_voice_on"
	wsEventUserVoiceOff     = "user_voice_off"
	wsEventUserScreenOn     = "user_screen_on"
	wsEventUserScreenOff    = "user_screen_off"
	wsEventCallStart        = "call_start"

	wsPingDuration = 10 * time.Second
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

func (p *Plugin) wsWriter(us *session, doneCh chan struct{}) {
	pingTicker := time.NewTicker(wsPingDuration)
	defer pingTicker.Stop()
	for {
		select {
		case msg, ok := <-us.wsOutCh:
			if !ok {
				return
			}
			p.metrics.WebSocketEventCounters.With(prometheus.Labels{"direction": "out", "type": "signal"}).Inc()
			err := us.wsConn.WriteMessage(websocket.TextMessage, msg)
			if err != nil {
				p.LogError(err.Error())
			}
		case <-pingTicker.C:
			err := us.wsConn.WriteMessage(websocket.TextMessage, json.RawMessage(`{"type":"ping"}`))
			if err != nil {
				p.LogError(err.Error())
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
			p.LogError(err.Error())
			close(doneCh)
			return
		}

		var msg clientMessage
		if err := msg.FromJSON(data); err != nil {
			p.LogError(err.Error())
			continue
		}

		p.metrics.WebSocketEventCounters.With(prometheus.Labels{"direction": "in", "type": msg.Type}).Inc()

		switch msg.Type {
		case clientMessageTypeSignal:
			// if I am not the handler for this we relay the signaling message.
			p.LogDebug(string(msg.Data))
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
				case us.wsInCh <- []byte(msg.Data):
				default:
					p.LogError("wsInCh is full, dropping msg")
				}
			}
		case clientMessageTypeICE:
			// TODO: handle ICE properly.
			p.LogDebug("candidate!")
		case clientMessageTypeMute, clientMessageTypeUnmute:
			us.mut.Lock()
			us.isMuted = (msg.Type == clientMessageTypeMute)
			us.mut.Unlock()

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
		case clientMessageTypeScreenOn, clientMessageTypeScreenOff:
			if err := p.handleClientMessageTypeScreen(msg, us.channelID, us.userID); err != nil {
				p.LogError(err.Error())
			}
		}
	}
}

func (p *Plugin) handleWebSocket(w http.ResponseWriter, r *http.Request, channelID string) {
	userID := r.Header.Get("Mattermost-User-Id")
	nodeID := p.nodeID

	if !p.API.HasPermissionToChannel(userID, channelID, model.PermissionCreatePost) {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}

	us := newUserSession(userID, channelID)

	p.mut.Lock()
	_, exists := p.sessions[userID]
	if exists {
		p.mut.Unlock()
		http.Error(w, "Session exists", http.StatusBadRequest)
		return
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

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		p.LogError(err.Error())
		return
	}
	us.mut.Lock()
	us.wsConn = conn
	us.mut.Unlock()

	p.LogDebug("ws connected")
	p.metrics.WebSocketConnections.With(prometheus.Labels{"channelID": channelID}).Inc()
	defer p.metrics.WebSocketConnections.With(prometheus.Labels{"channelID": channelID}).Dec()

	state, err := p.addUserSession(userID, channelID, us)
	if err != nil {
		p.LogError(err.Error())
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	} else if state.Call == nil {
		p.LogError("state.Call should not be nil")
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
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

	handlerID := state.NodeID

	var wg sync.WaitGroup
	doneCh := make(chan struct{})

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

	close(us.closeCh)
	close(us.wsInCh)
	wg.Wait()
	close(us.wsOutCh)

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

	if us.rtcConn != nil {
		us.rtcConn.Close()
	}
}
