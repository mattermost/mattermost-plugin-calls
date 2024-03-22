// Copyright (c) 2022-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/mattermost/mattermost-plugin-calls/server/db"
	"github.com/mattermost/mattermost-plugin-calls/server/public"

	"github.com/mattermost/mattermost/server/public/model"
)

type jobState struct {
	ID        string `json:"id"`
	CreatorID string `json:"creator_id"`
	JobID     string `json:"job_id"`
	BotConnID string `json:"bot_conn_id"`
	JobStateClient
}

type userState struct {
	UserID     string `json:"user_id"`
	Unmuted    bool   `json:"unmuted"`
	RaisedHand int64  `json:"raised_hand"`
	JoinAt     int64  `json:"join_at"`
}

type callStats struct {
	Participants   map[string]struct{} `json:"participants"`
	ScreenDuration int64               `json:"screen_duration"`
}

type callState struct {
	ID                     string                         `json:"id"`
	StartAt                int64                          `json:"start_at"`
	CreateAt               int64                          `json:"create_at"`
	EndAt                  int64                          `json:"end_at"`
	Sessions               map[string]*userState          `json:"sessions,omitempty"`
	OwnerID                string                         `json:"owner_id"`
	ThreadID               string                         `json:"thread_id"`
	PostID                 string                         `json:"post_id"`
	ScreenSharingSessionID string                         `json:"screen_sharing_session_id"`
	ScreenStartAt          int64                          `json:"screen_start_at"`
	Stats                  callStats                      `json:"stats"`
	RTCDHost               string                         `json:"rtcd_host"`
	HostID                 string                         `json:"host_id"`
	Recording              *jobState                      `json:"recording,omitempty"`
	Transcription          *jobState                      `json:"transcription,omitempty"`
	DismissedNotification  map[string]bool                `json:"dismissed_notification,omitempty"`
	NodeID                 string                         `json:"node_id,omitempty"`
	call                   *public.Call                   `json:"-"`
	sessions               map[string]*public.CallSession `json:"-"`
}

type channelState struct {
	Enabled *bool      `json:"enabled"`
	Call    *callState `json:"call,omitempty"`
}

type UserStateClient struct {
	SessionID  string `json:"session_id"`
	UserID     string `json:"user_id"`
	Unmuted    bool   `json:"unmuted"`
	RaisedHand int64  `json:"raised_hand"`
}

type CallStateClient struct {
	ID      string `json:"id"`
	StartAt int64  `json:"start_at"`

	// DEPRECATED in favour of Sessions (since v0.21)
	Users []string `json:"users"`
	// DEPRECATED in favour of Sessions (since v0.21)
	States []UserStateClient `json:"states,omitempty"`

	Sessions []UserStateClient `json:"sessions"`

	ThreadID string `json:"thread_id"`
	PostID   string `json:"post_id"`

	// DEPRECATED in favour of ScreenSharingSessionID (since v0.21)
	ScreenSharingID string `json:"screen_sharing_id"`

	ScreenSharingSessionID string          `json:"screen_sharing_session_id"`
	OwnerID                string          `json:"owner_id"`
	HostID                 string          `json:"host_id"`
	Recording              *JobStateClient `json:"recording,omitempty"`
	Transcription          *JobStateClient `json:"transcription,omitempty"`
	DismissedNotification  map[string]bool `json:"dismissed_notification,omitempty"`
}

type JobStateClient struct {
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

func (js *JobStateClient) toMap() map[string]interface{} {
	if js == nil {
		return nil
	}
	return map[string]interface{}{
		"init_at":  js.InitAt,
		"start_at": js.StartAt,
		"end_at":   js.EndAt,
		"err":      js.Err,
	}
}

func (js *jobState) getClientState() *JobStateClient {
	if js == nil {
		return nil
	}
	return &js.JobStateClient
}

func (cs *callState) Clone() *callState {
	if cs == nil {
		return nil
	}

	newState := *cs

	if cs.Sessions != nil {
		newState.Sessions = make(map[string]*userState, len(cs.Sessions))
		for id, state := range cs.Sessions {
			newState.Sessions[id] = &userState{}
			*newState.Sessions[id] = *state
		}
	}

	if cs.Recording != nil {
		newState.Recording = &jobState{}
		*newState.Recording = *cs.Recording
	}

	if cs.Transcription != nil {
		newState.Transcription = &jobState{}
		*newState.Transcription = *cs.Transcription
	}

	return &newState
}

func (cs *callState) sessionsForUser(userID string) []*userState {
	if cs == nil {
		return nil
	}
	var sessions []*userState
	for _, session := range cs.Sessions {
		if session.UserID == userID {
			sessions = append(sessions, session)
		}
	}
	return sessions
}

func (cs *channelState) getRecording() (*jobState, error) {
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

func (cs *channelState) getTranscription() (*jobState, error) {
	if cs == nil {
		return nil, fmt.Errorf("channel state is missing from store")
	}
	if cs.Call == nil {
		return nil, fmt.Errorf("no call ongoing")
	}
	if cs.Call.Transcription == nil {
		return nil, fmt.Errorf("no transcription ongoing")
	}
	return cs.Call.Transcription, nil
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

func (us *userState) getClientState(sessionID string) UserStateClient {
	return UserStateClient{
		SessionID:  sessionID,
		UserID:     us.UserID,
		Unmuted:    us.Unmuted,
		RaisedHand: us.RaisedHand,
	}
}

func (cs *callState) getHostID(botID string) string {
	var host userState

	for _, state := range cs.Sessions {
		if state.UserID == botID {
			continue
		}
		if host.UserID == "" {
			host = *state
			continue
		}
		if state.JoinAt < host.JoinAt {
			host = *state
		}
	}

	return host.UserID
}

func (cs *callState) getClientState(botID, userID string) *CallStateClient {
	users, states := cs.getUsersAndStates(botID)

	// For now, only send the user's own dismissed state.
	var dismissed map[string]bool
	if cs.DismissedNotification[userID] {
		dismissed = map[string]bool{
			userID: true,
		}
	}

	var screenSharingUserID string
	if s := cs.Sessions[cs.ScreenSharingSessionID]; s != nil {
		screenSharingUserID = s.UserID
	}

	return &CallStateClient{
		ID:      cs.ID,
		StartAt: cs.StartAt,

		// DEPRECATED since v0.21
		Users: users,
		// DEPRECATED since v0.21
		States: states,

		Sessions: states,
		ThreadID: cs.ThreadID,
		PostID:   cs.PostID,

		// DEPRECATED since v0.21
		ScreenSharingID: screenSharingUserID,

		ScreenSharingSessionID: cs.ScreenSharingSessionID,
		OwnerID:                cs.OwnerID,
		HostID:                 cs.HostID,
		Recording:              cs.Recording.getClientState(),
		Transcription:          cs.Transcription.getClientState(),
		DismissedNotification:  dismissed,
	}
}

func (cs *callState) getUsersAndStates(botID string) ([]string, []UserStateClient) {
	users := make([]string, 0, len(cs.Sessions))
	states := make([]UserStateClient, 0, len(cs.Sessions))
	for sessionID, state := range cs.Sessions {
		// We don't want to expose to the client that the bot is in a call.
		if state.UserID == botID {
			continue
		}
		users = append(users, state.UserID)
		states = append(states, state.getClientState(sessionID))
	}
	return users, states
}

func (cs *callState) onlyUserLeft(userID string) bool {
	for _, state := range cs.Sessions {
		if state.UserID != userID {
			return false
		}
	}
	return true
}

func (p *Plugin) kvGetChannelState(channelID string, fromWriter bool) (*channelState, error) {
	channel, err := p.store.GetCallsChannel(channelID, db.GetCallsChannelOpts{
		FromWriter: fromWriter,
	})
	if err != nil && !errors.Is(err, db.ErrNotFound) {
		return nil, fmt.Errorf("failed to get call channel: %w", err)
	}

	state := &channelState{
		Enabled: nil,
	}
	if channel != nil {
		state.Enabled = model.NewBool(channel.Enabled)
	}

	call, err := p.store.GetActiveCallByChannelID(channelID, db.GetCallOpts{
		FromWriter: fromWriter,
	})
	if err != nil && !errors.Is(err, db.ErrNotFound) {
		return nil, fmt.Errorf("failed to get active call: %w", err)
	}

	if call != nil {
		// TODO: add proper support for multiple hosts
		var hostID string
		if len(call.Props.Hosts) > 0 {
			hostID = call.Props.Hosts[0]
		}

		participants := make(map[string]struct{}, len(call.Participants))
		for _, p := range call.Participants {
			participants[p] = struct{}{}
		}

		state.Call = &callState{
			ID:                     call.ID,
			CreateAt:               call.CreateAt,
			StartAt:                call.StartAt,
			EndAt:                  call.EndAt,
			OwnerID:                call.OwnerID,
			ThreadID:               call.ThreadID,
			PostID:                 call.PostID,
			ScreenSharingSessionID: call.Props.ScreenSharingSessionID,
			ScreenStartAt:          call.Props.ScreenStartAt,
			RTCDHost:               call.Props.RTCDHost,
			HostID:                 hostID,
			NodeID:                 call.Props.NodeID,
			DismissedNotification:  call.Props.DismissedNotification,
			Stats: callStats{
				Participants:   participants,
				ScreenDuration: call.Stats.ScreenDuration,
			},
		}

		sessions, err := p.store.GetCallSessions(call.ID, db.GetCallSessionOpts{
			FromWriter: fromWriter,
		})
		if err != nil {
			return nil, fmt.Errorf("failed to get sessions: %w", err)
		}

		state.Call.Sessions = make(map[string]*userState, len(sessions))
		state.Call.sessions = make(map[string]*public.CallSession, len(sessions))

		for _, session := range sessions {
			state.Call.Sessions[session.ID] = &userState{
				UserID:     session.UserID,
				Unmuted:    session.Unmuted,
				RaisedHand: session.RaisedHand,
				JoinAt:     session.JoinAt,
			}
			state.Call.sessions[session.ID] = session
		}

		state.Call.call = call
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

func (p *Plugin) cleanUpState() (retErr error) {
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

			state, err := p.lockCall(k)
			if err != nil {
				p.LogError("failed to lock call", "err", err.Error())
				continue
			}
			if err := p.cleanCallState(k, state); err != nil {
				p.unlockCall(k)
				return fmt.Errorf("failed to clean up state: %w", err)
			}
			p.unlockCall(k)
		}
		page++
	}
	return nil
}

// NOTE: cleanCallState is meant to be called under lock (on channelID) so that
// the operation can be performed atomically.
func (p *Plugin) cleanCallState(channelID string, state *channelState) error {
	if state == nil {
		return nil
	}

	if state.Call == nil {
		return nil
	}

	if _, err := p.updateCallPostEnded(state.Call.PostID, mapKeys(state.Call.Stats.Participants)); err != nil {
		p.LogError("failed to update call post", "err", err.Error())
	}

	call := state.Call.call
	if call.EndAt == 0 {
		call.EndAt = time.Now().UnixMilli()
	}
	state.Call = nil

	return p.store.UpdateCall(call)
}
