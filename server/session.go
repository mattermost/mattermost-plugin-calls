// Copyright (c) 2022-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"errors"
	"fmt"
	"time"

	"golang.org/x/time/rate"

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

	limiter *rate.Limiter
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
		limiter:     rate.NewLimiter(2, 50),
	}
}

func (p *Plugin) addUserSession(userID, connID string, channel *model.Channel) (channelState, error) {
	var st channelState

	cfg := p.getConfiguration()

	err := p.kvSetAtomicChannelState(channel.Id, func(state *channelState) (*channelState, error) {
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
				ID:       model.NewId(),
				StartAt:  time.Now().UnixMilli(),
				Users:    make(map[string]*userState),
				Sessions: make(map[string]struct{}),
				OwnerID:  userID,
			}
			state.NodeID = p.nodeID

			if p.rtcdManager != nil {
				host, err := p.rtcdManager.GetHostForNewCall()
				if err != nil {
					return nil, fmt.Errorf("failed to get rtcd host: %w", err)
				}
				p.LogDebug("rtcd host has been assigned to call", "host", host)
				state.Call.RTCDHost = host
			}
		}

		if state.Call.EndAt > 0 {
			return nil, fmt.Errorf("call has ended")
		}

		if _, ok := state.Call.Users[userID]; ok {
			return nil, fmt.Errorf("user is already connected")
		}

		// Check for cloud limits -- needs to be done here to prevent a race condition
		if allowed, err := p.joinAllowed(channel, state); !allowed {
			if err != nil {
				p.LogError("error checking for cloud limits", "error", err.Error())
			}
			return nil, fmt.Errorf("user cannot join because of cloud limits")
		}

		state.Call.Users[userID] = &userState{}
		state.Call.Sessions[connID] = struct{}{}
		if len(state.Call.Users) > state.Call.Stats.Participants {
			state.Call.Stats.Participants = len(state.Call.Users)
		}

		st = *state
		return state, nil
	})

	return st, err
}

func (p *Plugin) removeUserSession(userID, connID, channelID string) (channelState, channelState, error) {
	var currState channelState
	var prevState channelState
	errNotFound := errors.New("not found")

	setChannelState := func(state *channelState) (*channelState, error) {
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

		if _, ok := state.Call.Users[userID]; !ok {
			p.LogDebug("user not found in state", "userID", userID)
			return nil, errNotFound
		}

		delete(state.Call.Users, userID)
		delete(state.Call.Sessions, connID)

		if len(state.Call.Users) == 0 {
			state.Call = nil
			state.NodeID = ""
		}

		currState = *state
		return state, nil
	}

	var err error
	maxTries := 5
	for i := 0; i < maxTries; i++ {
		err = p.kvSetAtomicChannelState(channelID, setChannelState)
		if errors.Is(err, errNotFound) {
			// pausing in the edge case that the db state has not been fully
			// replicated yet fixing possible read-after-write issues.
			time.Sleep(10 * time.Millisecond)
			continue
		}
		break
	}

	return currState, prevState, err
}
