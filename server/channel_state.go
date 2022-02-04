package main

import (
	"encoding/json"
	"fmt"

	"github.com/prometheus/client_golang/prometheus"
)

type userState struct {
	Unmuted    bool  `json:"unmuted"`
	RaisedHand int64 `json:"raised_hand"`
}

type callStats struct {
	Participants int `json:"participants"`
}

type callState struct {
	ID              string                `json:"id"`
	StartAt         int64                 `json:"create_at"`
	Users           map[string]*userState `json:"users,omitempty"`
	ThreadID        string                `json:"thread_id"`
	ScreenSharingID string                `json:"screen_sharing_id"`
	Stats           callStats             `json:"stats"`
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

func (cs *callState) getUsers() []string {
	var i int
	users := make([]string, len(cs.Users))
	for id := range cs.Users {
		users[i] = id
		i++
	}
	return users
}

func (p *Plugin) kvGetChannelState(channelID string) (*channelState, error) {
	p.metrics.StoreOpCounters.With(prometheus.Labels{"type": "KVGet"}).Inc()
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
	var page int
	perPage := 100
	for {
		p.metrics.StoreOpCounters.With(prometheus.Labels{"type": "KVList"}).Inc()
		keys, appErr := p.API.KVList(page, perPage)
		if appErr != nil {
			return appErr
		}
		if len(keys) == 0 {
			break
		}
		for _, k := range keys {
			if err := p.kvSetAtomicChannelState(k, func(state *channelState) (*channelState, error) {
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
				return fmt.Errorf("failed to clean up state: %w", err)
			}
		}
		page++
	}
	return nil
}
