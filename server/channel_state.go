// Copyright (c) 2022-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"encoding/json"
	"fmt"
)

type recordingState struct {
	ID        string `json:"id"`
	CreatorID string `json:"creator_id"`
	JobID     string `json:"job_id"`
	RecordingState
}

type userState struct {
	Unmuted    bool  `json:"unmuted"`
	RaisedHand int64 `json:"raised_hand"`
	JoinAt     int64 `json:"join_at"`
}

type callStats struct {
	Participants   int   `json:"participants"`
	ScreenDuration int64 `json:"screen_duration"`
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
	ScreenStartAt   int64                 `json:"screen_start_at"`
	Stats           callStats             `json:"stats"`
	RTCDHost        string                `json:"rtcd_host"`
	HostID          string                `json:"host_id"`
	Recording       *recordingState       `json:"recording,omitempty"`
}

type channelState struct {
	NodeID  string     `json:"node_id,omitempty"`
	Enabled bool       `json:"enabled"`
	Call    *callState `json:"call,omitempty"`
}

type UserState struct {
	Unmuted    bool  `json:"unmuted"`
	RaisedHand int64 `json:"raised_hand"`
}

type CallState struct {
	ID              string          `json:"id"`
	StartAt         int64           `json:"start_at"`
	Users           []string        `json:"users"`
	States          []UserState     `json:"states,omitempty"`
	ThreadID        string          `json:"thread_id"`
	ScreenSharingID string          `json:"screen_sharing_id"`
	OwnerID         string          `json:"owner_id"`
	HostID          string          `json:"host_id"`
	Recording       *RecordingState `json:"recording,omitempty"`
}

type RecordingState struct {
	InitAt  int64 `json:"init_at"`
	StartAt int64 `json:"start_at"`
	EndAt   int64 `json:"end_at"`
}

type ChannelState struct {
	ChannelID string     `json:"channel_id,omitempty"`
	Enabled   bool       `json:"enabled"`
	Call      *CallState `json:"call,omitempty"`
}

func (rs *RecordingState) toMap() map[string]interface{} {
	if rs == nil {
		return nil
	}
	return map[string]interface{}{
		"init_at":  rs.InitAt,
		"start_at": rs.StartAt,
		"end_at":   rs.EndAt,
	}
}

func (rs *recordingState) getClientState() *RecordingState {
	if rs == nil {
		return nil
	}
	return &rs.RecordingState
}

func (cs *callState) Clone() *callState {
	if cs == nil {
		return nil
	}

	newState := *cs

	if cs.Users != nil {
		newState.Users = make(map[string]*userState, len(cs.Users))
		for id, state := range cs.Users {
			newState.Users[id] = &userState{}
			*newState.Users[id] = *state
		}
	}

	if cs.Sessions != nil {
		newState.Sessions = make(map[string]struct{}, len(cs.Sessions))
		for id := range cs.Sessions {
			newState.Sessions[id] = struct{}{}
		}
	}

	if cs.Recording != nil {
		newState.Recording = &recordingState{}
		*newState.Recording = *cs.Recording
	}

	return &newState
}

func (cs *channelState) Clone() *channelState {
	if cs == nil {
		return nil
	}
	newState := *cs
	if cs.Call != nil {
		newState.Call = cs.Call.Clone()
	}
	return &newState
}

func (us *userState) getClientState() UserState {
	return UserState{
		Unmuted:    us.Unmuted,
		RaisedHand: us.RaisedHand,
	}
}

func (cs *callState) getHostID(botID string) string {
	var hostID string

	for id, state := range cs.Users {
		if id == botID {
			continue
		}
		if hostID == "" {
			hostID = id
			continue
		}
		if state.JoinAt < cs.Users[hostID].JoinAt {
			hostID = id
		}
	}

	return hostID
}

func (cs *callState) getClientState(botID string) *CallState {
	users, states := cs.getUsersAndStates(botID)
	return &CallState{
		ID:              cs.ID,
		StartAt:         cs.StartAt,
		Users:           users,
		States:          states,
		ThreadID:        cs.ThreadID,
		ScreenSharingID: cs.ScreenSharingID,
		OwnerID:         cs.OwnerID,
		HostID:          cs.HostID,
		Recording:       cs.Recording.getClientState(),
	}
}

func (cs *callState) getUsersAndStates(botID string) ([]string, []UserState) {
	users := make([]string, 0, len(cs.Users))
	states := make([]UserState, 0, len(cs.Users))
	for id, state := range cs.Users {
		// We don't want to expose to the client that the bot is in a call.
		if id == botID {
			continue
		}
		users = append(users, id)
		states = append(states, state.getClientState())
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
