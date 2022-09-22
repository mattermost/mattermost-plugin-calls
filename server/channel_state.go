// Copyright (c) 2022-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"encoding/json"
	"fmt"
)

type userState struct {
	Unmuted    bool  `json:"unmuted"`
	RaisedHand int64 `json:"raised_hand"`
}

type callStats struct {
	Participants int `json:"participants"`
}

type emoji struct {
	Name string `json:"name"`
	Skin int    `json:"skin"`
}

type timestampedReaction struct {
	Timestamp int64  `json:"timestamp"`
	Emoji     emoji  `json:"emoji"`
	UserID    string `json:"user_id"`
}

type callState struct {
	ID              string                `json:"id"`
	StartAt         int64                 `json:"create_at"`
	EndAt           int64                 `json:"end_at"`
	Users           map[string]*userState `json:"users,omitempty"`
	Sessions        map[string]struct{}   `json:"sessions,omitempty"`
	OwnerID         string                `json:"owner_id"`
	ThreadID        string                `json:"thread_id"`
	ScreenSharingID string                `json:"screen_sharing_id"`
	ScreenStreamID  string                `json:"screen_stream_id"`
	Stats           callStats             `json:"stats"`
	RTCDHost        string                `json:"rtcd_host"`
	// Order is not guaranteed; use the Timestamp value to sort them if needed
	Reactions []timestampedReaction `json:"reactions"`
}

type channelState struct {
	NodeID  string     `json:"node_id,omitempty"`
	Enabled bool       `json:"enabled"`
	Call    *callState `json:"call,omitempty"`
}

func (cs *callState) getUsersAndStates() ([]string, []userState) {
	var i int
	users := make([]string, len(cs.Users))
	states := make([]userState, len(cs.Users))
	for id, state := range cs.Users {
		users[i] = id
		states[i] = *state
		i++
	}
	return users, states
}

func (p *Plugin) kvGetChannelState(channelID string) (*channelState, error) {
	p.metrics.IncStoreOp("KVGet")
	data, appErr := p.API.KVGet(channelID)
	if appErr != nil {
		return nil, fmt.Errorf("KVGet failed: %w", appErr)
	}
	if data == nil {
		return nil, nil
	}
	var state *channelState
	if err := json.Unmarshal(data, &state); err != nil {
		return nil, err
	}
	return state, nil
}

func (p *Plugin) kvSetAtomicChannelState(channelID string, cb func(state *channelState) (*channelState, error)) error {
	return p.kvSetAtomic(channelID, func(data []byte) ([]byte, error) {
		var err error
		var state *channelState
		if data != nil {
			if err := json.Unmarshal(data, &state); err != nil {
				return nil, err
			}
		}
		state, err = cb(state)
		if err != nil {
			return nil, err
		}
		if state == nil {
			return nil, nil
		}
		return json.Marshal(state)
	})
}

func (p *Plugin) cleanUpState() error {
	p.LogDebug("cleaning up calls state")
	var page int
	perPage := 100
	for {
		p.metrics.IncStoreOp("KVList")
		keys, appErr := p.API.KVList(page, perPage)
		if appErr != nil {
			return appErr
		}
		if len(keys) == 0 {
			break
		}
		for _, k := range keys {
			if k == handlerKey {
				handlerID, err := p.getHandlerID()
				if err != nil {
					p.LogError(err.Error())
					continue
				}

				if p.nodeID == handlerID {
					p.metrics.IncStoreOp("KVDelete")
					if appErr = p.API.KVDelete(k); appErr != nil {
						p.LogError(err.Error())
					}
				}
				continue
			}

			if len(k) < 26 {
				continue
			}

			if err := p.cleanCallState(k); err != nil {
				return fmt.Errorf("failed to clean up state: %w", err)
			}
		}
		page++
	}
	return nil
}

func (p *Plugin) cleanCallState(channelID string) error {
	if err := p.kvSetAtomicChannelState(channelID, func(state *channelState) (*channelState, error) {
		if state == nil {
			return nil, nil
		}
		state.NodeID = ""

		if state.Call != nil {
			if _, err := p.updateCallThreadEnded(state.Call.ThreadID); err != nil {
				p.LogError(err.Error())
			}
		}
		state.Call = nil
		return state, nil
	}); err != nil {
		return fmt.Errorf("failed to cleanup state: %w", err)
	}

	return nil
}
