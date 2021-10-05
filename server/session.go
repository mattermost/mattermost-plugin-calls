package main

import (
	"fmt"
	"sync"
	"time"

	"github.com/mattermost/mattermost-server/v6/model"

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
	outVoiceTrack     *webrtc.TrackLocalStaticRTP
	outScreenTrack    *webrtc.TrackLocalStaticRTP
	remoteScreenTrack *webrtc.TrackRemote
	rtcConn           *webrtc.PeerConnection
	tracksCh          chan *webrtc.TrackLocalStaticRTP
}

func newUserSession(userID, channelID string) *session {
	return &session{
		userID:    userID,
		channelID: channelID,
		wsInCh:    make(chan []byte, wsChSize),
		wsOutCh:   make(chan []byte, wsChSize),
		tracksCh:  make(chan *webrtc.TrackLocalStaticRTP, 5),
	}
}

func (p *Plugin) addUserSession(userID, channelID string, userSession *session) (channelState, error) {
	p.mut.Lock()
	p.LogDebug("adding session", "UserID", userID, "ChannelID", channelID)
	p.sessions[userID] = userSession
	p.mut.Unlock()

	var st channelState
	err := p.kvSetAtomicChannelState(channelID, func(state *channelState) (*channelState, error) {
		if state == nil {
			return nil, fmt.Errorf("channel state is missing from store")
		}
		if state.Call == nil {
			state.Call = &callState{
				ID:      model.NewId(),
				StartAt: time.Now().UnixMilli(),
				Users:   make(map[string]struct{}),
			}
			state.NodeID = p.nodeID
		}
		state.Call.Users[userID] = struct{}{}
		st = *state
		return state, nil
	})

	return st, err
}

func (p *Plugin) removeUserSession(userID, channelID string) (channelState, error) {
	p.mut.Lock()
	p.LogDebug("removing session", "UserID", userID, "ChannelID", channelID)
	delete(p.sessions, userID)
	p.mut.Unlock()

	var st channelState
	err := p.kvSetAtomicChannelState(channelID, func(state *channelState) (*channelState, error) {
		if state == nil {
			return nil, fmt.Errorf("channel state is missing from store")
		}
		if state.Call == nil {
			return nil, fmt.Errorf("call state is missing from channel state")
		}

		if state.Call.ScreenSharingID == userID {
			state.Call.ScreenSharingID = ""
			if call := p.getCall(channelID); call != nil {
				call.setScreenSession(nil)
			}
		}

		delete(state.Call.Users, userID)

		if len(state.Call.Users) == 0 {
			state.Call = nil
			state.NodeID = ""
		}

		st = *state
		return state, nil
	})

	return st, err
}
