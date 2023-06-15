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
	BotConnID string `json:"bot_conn_id"`
	RecordingStateClient
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
	PostID          string                `json:"post_id"`
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
	Enabled *bool      `json:"enabled"`
	Call    *callState `json:"call,omitempty"`
}

type UserStateClient struct {
	Unmuted    bool  `json:"unmuted"`
	RaisedHand int64 `json:"raised_hand"`
}

type CallStateClient struct {
	ID              string                `json:"id"`
	StartAt         int64                 `json:"start_at"`
	Users           []string              `json:"users"`
	States          []UserStateClient     `json:"states,omitempty"`
	ThreadID        string                `json:"thread_id"`
	PostID          string                `json:"post_id"`
	ScreenSharingID string                `json:"screen_sharing_id"`
	OwnerID         string                `json:"owner_id"`
	HostID          string                `json:"host_id"`
	Recording       *RecordingStateClient `json:"recording,omitempty"`
}

type RecordingStateClient struct {
	InitAt  int64  `json:"init_at"`
	StartAt int64  `json:"start_at"`
	EndAt   int64  `json:"end_at"`
	Err     string `json:"err,omitempty"`
}

type ChannelStateClient struct {
	ChannelID string           `json:"channel_id,omitempty"`
	Enabled   *bool            `json:"enabled,omitempty"`
	Call      *CallStateClient `json:"call,omitempty"`
}

func (rs *RecordingStateClient) toMap() map[string]interface{} {
	if rs == nil {
		return nil
	}
	return map[string]interface{}{
		"init_at":  rs.InitAt,
		"start_at": rs.StartAt,
		"end_at":   rs.EndAt,
		"err":      rs.Err,
	}
}

func (rs *recordingState) getClientState() *RecordingStateClient {
	if rs == nil {
		return nil
	}
	return &rs.RecordingStateClient
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

func (cs *channelState) getRecording() (*recordingState, error) {
	if cs == nil {
		return nil, fmt.Errorf("channel state is missing from store")
	}
	if cs.Call == nil {
		return nil, fmt.Errorf("no call ongoing")
	}
	if cs.Call.Recording == nil {
		return nil, fmt.Errorf("no recording ongoing")
	}
	return cs.Call.Recording, nil
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

func (us *userState) getClientState() UserStateClient {
	return UserStateClient{
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

func (cs *callState) getClientState(botID string) *CallStateClient {
	users, states := cs.getUsersAndStates(botID)
	return &CallStateClient{
		ID:              cs.ID,
		StartAt:         cs.StartAt,
		Users:           users,
		States:          states,
		ThreadID:        cs.ThreadID,
		PostID:          cs.PostID,
		ScreenSharingID: cs.ScreenSharingID,
		OwnerID:         cs.OwnerID,
		HostID:          cs.HostID,
		Recording:       cs.Recording.getClientState(),
	}
}

func (cs *callState) getUsersAndStates(botID string) ([]string, []UserStateClient) {
	users := make([]string, 0, len(cs.Users))
	states := make([]UserStateClient, 0, len(cs.Users))
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

func (p *Plugin) kvSetChannelState(channelID string, state *channelState) error {
	p.metrics.IncStoreOp("KVSet")

	data, err := json.Marshal(state)
	if err != nil {
		return fmt.Errorf("failed to marshal channel state: %w", err)
	}

	appErr := p.API.KVSet(channelID, data)
	if appErr != nil {
		return fmt.Errorf("KVSet failed: %w", appErr)
	}
	return nil
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

			if len(k) != 26 {
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
			if _, err := p.updateCallPostEnded(state.Call.PostID); err != nil {
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
