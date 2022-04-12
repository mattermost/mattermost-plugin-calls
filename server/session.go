package main

import (
	"fmt"
	"time"

	"github.com/mattermost/mattermost-server/v6/model"
)

const (
	msgChSize = 20
)

type session struct {
	userID    string
	channelID string
	connID    string

	// WebSocket
	signalInCh  chan []byte
	signalOutCh chan []byte
	wsMsgCh     chan clientMessage
	wsCloseCh   chan struct{}

	doneCh  chan struct{}
	closeCh chan struct{}
}

func newUserSession(userID, channelID, connID string) *session {
	return &session{
		userID:      userID,
		channelID:   channelID,
		connID:      connID,
		signalInCh:  make(chan []byte, msgChSize),
		signalOutCh: make(chan []byte, msgChSize),
		wsMsgCh:     make(chan clientMessage, msgChSize*2),
		wsCloseCh:   make(chan struct{}),
		closeCh:     make(chan struct{}),
		doneCh:      make(chan struct{}),
	}
}

func (p *Plugin) addUserSession(userID, channelID string) (channelState, error) {
	var st channelState

	cfg := p.getConfiguration()

	err := p.kvSetAtomicChannelState(channelID, func(state *channelState) (*channelState, error) {
		if state == nil {
			if cfg.DefaultEnabled != nil && *cfg.DefaultEnabled {
				state = &channelState{
					Enabled: true,
				}
			} else {
				return nil, fmt.Errorf("channel state is missing from store")
			}
		}

		if !state.Enabled {
			return nil, fmt.Errorf("calls are not enabled")
		}

		if state.Call == nil {
			state.Call = &callState{
				ID:      model.NewId(),
				StartAt: time.Now().UnixMilli(),
				Users:   make(map[string]*userState),
			}
			state.NodeID = p.nodeID
		}

		if _, ok := state.Call.Users[userID]; ok {
			return nil, fmt.Errorf("user is already connected")
		}
		state.Call.Users[userID] = &userState{}
		if len(state.Call.Users) > state.Call.Stats.Participants {
			state.Call.Stats.Participants = len(state.Call.Users)
		}

		st = *state
		return state, nil
	})

	return st, err
}

func (p *Plugin) removeUserSession(userID, channelID string) (channelState, channelState, error) {
	var currState channelState
	var prevState channelState
	err := p.kvSetAtomicChannelState(channelID, func(state *channelState) (*channelState, error) {
		if state == nil {
			return nil, fmt.Errorf("channel state is missing from store")
		}
		prevState = *state
		if state.Call == nil {
			return nil, fmt.Errorf("call state is missing from channel state")
		}

		if state.Call.ScreenSharingID == userID {
			state.Call.ScreenSharingID = ""
			state.Call.ScreenStreamID = ""
		}

		delete(state.Call.Users, userID)

		if len(state.Call.Users) == 0 {
			state.Call = nil
			state.NodeID = ""
		}

		currState = *state
		return state, nil
	})

	return currState, prevState, err
}
