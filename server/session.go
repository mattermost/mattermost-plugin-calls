package main

import (
	"fmt"
	"sync"

	"github.com/gorilla/websocket"
	"github.com/pion/webrtc/v3"
)

const (
	wsChSize = 10
)

type session struct {
	mut sync.RWMutex

	userID    string
	channelID string

	// User state
	isMuted    bool
	isSpeaking bool

	// WebSocket
	wsInCh  chan []byte
	wsOutCh chan []byte
	wsConn  *websocket.Conn

	// WebRTC
	outTrack *webrtc.TrackLocalStaticRTP
	outConn  *webrtc.PeerConnection
}

func newUserSession(userID, channelID string) *session {
	return &session{
		userID:    userID,
		channelID: channelID,
		wsInCh:    make(chan []byte, wsChSize),
		wsOutCh:   make(chan []byte, wsChSize),
	}
}

func (p *Plugin) addUserSession(userID, channelID string, userSession *session) error {
	p.mut.Lock()
	p.LogDebug("adding session", "UserID", userID, "ChannelID", channelID)
	p.sessions[userID] = userSession
	p.mut.Unlock()
	return p.kvSetAtomicChannelState(channelID, func(state *channelState) (*channelState, error) {
		if state == nil {
			return nil, fmt.Errorf("channel state is missing from store")
		}
		if state.Users == nil {
			state.Users = make(map[string]struct{})
		}
		state.Users[userID] = struct{}{}
		return state, nil
	})
}

func (p *Plugin) removeUserSession(userID, channelID string) error {
	p.mut.Lock()
	p.LogDebug("removing session", "UserID", userID, "ChannelID", channelID)
	delete(p.sessions, userID)
	p.mut.Unlock()
	return p.kvSetAtomicChannelState(channelID, func(state *channelState) (*channelState, error) {
		if state == nil {
			return nil, fmt.Errorf("channel state is missing from store")
		}
		delete(state.Users, userID)
		return state, nil
	})
}
