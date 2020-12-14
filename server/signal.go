package main

import (
	"net/http"
	"sync"

	"github.com/mattermost/mattermost-server/v5/model"

	"github.com/gorilla/websocket"

	"github.com/pion/webrtc/v3"
)

var upgrader = websocket.Upgrader{} // use default options

const (
	wsEventUserConnected    = "user_connected"
	wsEventUserDisconnected = "user_disconnected"
	wsEventUserMuted        = "user_muted"
	wsEventUserUnmuted      = "user_unmuted"
)

type session struct {
	wsInCh    <-chan []byte
	wsOutCh   chan<- []byte
	outTrack  *webrtc.TrackLocalStaticRTP
	outConn   *webrtc.PeerConnection
	channelID string
	isMuted   bool
	mut       sync.RWMutex
}

func (p *Plugin) handleWebSocket(w http.ResponseWriter, r *http.Request, channelID string) {
	userID := r.Header.Get("Mattermost-User-Id")

	if !p.API.HasPermissionToChannel(userID, channelID, model.PERMISSION_CREATE_POST) {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}

	p.mut.RLock()
	_, exists := p.sessions[userID]
	p.mut.RUnlock()

	if exists {
		http.Error(w, "Session exists", http.StatusBadRequest)
		return
	}

	inCh := make(chan []byte, 5)
	outCh := make(chan []byte)

	userSession := &session{
		wsInCh:    inCh,
		wsOutCh:   outCh,
		channelID: channelID,
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		p.API.LogError(err.Error())
		return
	}

	var wg sync.WaitGroup
	wg.Add(3)
	doneCh := make(chan struct{})

	p.API.LogInfo("ws connected")

	p.mut.Lock()
	p.sessions[userID] = userSession
	p.mut.Unlock()

	go func() {
		defer wg.Done()
		p.handleTracks(userID)
	}()

	p.API.PublishWebSocketEvent(wsEventUserConnected, map[string]interface{}{
		"userID": userID,
	}, &model.WebsocketBroadcast{ChannelId: channelID})

	go func() {
		defer wg.Done()
		for {
			_, data, err := conn.ReadMessage()
			if err != nil {
				p.API.LogError(err.Error())
				close(doneCh)
				return
			}
			p.API.LogInfo(string(data))

			var msg message
			if err := msg.FromJSON(data); err != nil {
				p.API.LogError(err.Error())
				continue
			}

			p.API.LogInfo(msg.Type)
			p.API.LogInfo(string(msg.Data))

			switch msg.Type {
			case messageTypeSignal:
				select {
				case inCh <- []byte(msg.Data):
				default:
					p.API.LogError("channel is full, dropping msg")
				}
			case messageTypeICE:
				// TODO: handle ICE properly.
				p.API.LogInfo("candidate!")
			case messageTypeMute, messageTypeUnmute:
				userSession.mut.Lock()
				userSession.isMuted = (msg.Type == messageTypeMute)
				userSession.mut.Unlock()
				evType := wsEventUserUnmuted
				if msg.Type == messageTypeMute {
					evType = wsEventUserMuted
				}
				p.API.PublishWebSocketEvent(evType, map[string]interface{}{
					"userID": userID,
				}, &model.WebsocketBroadcast{ChannelId: channelID})
			}
		}
	}()

	go func() {
		defer wg.Done()
		for {
			select {
			case msg := <-outCh:
				err := conn.WriteMessage(websocket.TextMessage, msg)
				if err != nil {
					p.API.LogError(err.Error())
				}
			case <-doneCh:
				return
			}
		}
	}()

	select {
	case <-p.stopCh:
		p.API.LogInfo("stop received, closing connection")
		conn.Close()
	case <-doneCh:
		p.API.LogInfo("done")
	}

	p.mut.Lock()
	p.API.LogInfo("deleting session")
	delete(p.sessions, userID)
	p.mut.Unlock()

	p.API.PublishWebSocketEvent(wsEventUserDisconnected, map[string]interface{}{
		"userID": userID,
	}, &model.WebsocketBroadcast{ChannelId: channelID})

	close(inCh)

	wg.Wait()

	close(outCh)
}
