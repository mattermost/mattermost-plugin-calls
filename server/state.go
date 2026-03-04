// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"errors"
	"fmt"
	"time"

	"github.com/mattermost/mattermost-plugin-calls/server/db"
	"github.com/mattermost/mattermost-plugin-calls/server/public"
)

type callState struct {
	public.Call
	sessions map[string]*public.CallSession
}

// Clone performs a deep copy of the call state.
func (cs *callState) Clone() *callState {
	if cs == nil {
		return nil
	}

	csCopy := new(callState)

	csCopy.Call = cs.Call

	if cs.Participants != nil {
		csCopy.Participants = make([]string, len(cs.Call.Participants))
		copy(csCopy.Call.Participants, cs.Call.Participants)
	}

	// Props
	if cs.Props.Hosts != nil {
		csCopy.Props.Hosts = make([]string, len(cs.Call.Props.Hosts))
		copy(csCopy.Call.Props.Hosts, cs.Call.Props.Hosts)
	}
	if cs.Props.DismissedNotification != nil {
		csCopy.Props.DismissedNotification = make(map[string]bool, len(cs.Call.Props.DismissedNotification))
		for k, v := range cs.Call.Props.DismissedNotification {
			csCopy.Props.DismissedNotification[k] = v
		}
	}
	if cs.Props.Participants != nil {
		csCopy.Props.Participants = make(map[string]struct{}, len(cs.Call.Props.Participants))
		for k, v := range cs.Call.Props.Participants {
			csCopy.Props.Participants[k] = v
		}
	}

	// Sessions
	if cs.sessions != nil {
		csCopy.sessions = make(map[string]*public.CallSession, len(cs.sessions))
		for k := range cs.sessions {
			csCopy.sessions[k] = new(public.CallSession)
			*csCopy.sessions[k] = *cs.sessions[k]
		}
	}

	return csCopy
}

type UserStateClient struct {
	SessionID string `json:"session_id"`
	UserID    string `json:"user_id"`
	Unmuted   bool   `json:"unmuted"`
}

type CallStateClient struct {
	ID      string `json:"id"`
	StartAt int64  `json:"start_at"`

	Sessions []UserStateClient `json:"sessions"`

	ThreadID string `json:"thread_id"`
	PostID   string `json:"post_id"`

	OwnerID               string          `json:"owner_id"`
	HostID                string          `json:"host_id"`
	DismissedNotification map[string]bool `json:"dismissed_notification,omitempty"`
}

func (cs *callState) getHostID(botID string) string {
	if cs.Call.Props.HostLockedUserID != "" && cs.isUserIDInCall(cs.Call.Props.HostLockedUserID) {
		return cs.Call.Props.HostLockedUserID
	}

	var host public.CallSession
	for _, session := range cs.sessions {
		// if current host is still in the call, keep them as the host
		if session.UserID == cs.Call.GetHostID() {
			return cs.Call.GetHostID()
		}

		// bot can't be host
		if session.UserID == botID {
			continue
		}

		if host.UserID == "" {
			host = *session
			continue
		}

		if session.JoinAt < host.JoinAt {
			host = *session
		}
	}

	return host.UserID
}

func (cs *callState) isUserIDInCall(userID string) bool {
	for _, session := range cs.sessions {
		if session.UserID == userID {
			return true
		}
	}
	return false
}

func (cs *callState) getClientState(botID, userID string) *CallStateClient {
	states := cs.getStates(botID)

	// For now, only send the user's own dismissed state.
	var dismissed map[string]bool
	if cs.Props.DismissedNotification[userID] {
		dismissed = map[string]bool{
			userID: true,
		}
	}

	return &CallStateClient{
		ID:      cs.ID,
		StartAt: cs.StartAt,

		Sessions:              states,
		ThreadID:              cs.ThreadID,
		PostID:                cs.PostID,
		OwnerID:               cs.OwnerID,
		HostID:                cs.GetHostID(),
		DismissedNotification: dismissed,
	}
}

func (cs *callState) getStates(botID string) []UserStateClient {
	states := make([]UserStateClient, 0, len(cs.sessions))
	for _, session := range cs.sessions {
		if session.UserID == botID {
			continue
		}
		states = append(states, UserStateClient{
			SessionID: session.ID,
			UserID:    session.UserID,
			Unmuted:   session.Unmuted,
		})
	}
	return states
}

func (cs *callState) onlyUserLeft(userID string) bool {
	var found bool
	for _, session := range cs.sessions {
		if session.UserID != userID {
			return false
		}
		found = true
	}
	return found
}

func (p *Plugin) getCallStateFromCall(call *public.Call, fromWriter bool) (*callState, error) {
	if call == nil {
		return nil, fmt.Errorf("call should not be nil")
	}

	state := &callState{
		Call: *call,
	}

	sessions, err := p.store.GetCallSessions(call.ID, db.GetCallSessionOpts{
		FromWriter: fromWriter,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to get call sessions: %w", err)
	}
	state.sessions = sessions

	return state, nil
}

func (p *Plugin) getCallState(channelID string, fromWriter bool) (*callState, error) {
	defer func(start time.Time) {
		p.metrics.ObserveAppHandlersTime("getCallState", time.Since(start).Seconds())
	}(time.Now())

	call, err := p.store.GetActiveCallByChannelID(channelID, db.GetCallOpts{
		FromWriter: fromWriter,
	})
	if err != nil && !errors.Is(err, db.ErrNotFound) {
		return nil, fmt.Errorf("failed to get active call: %w", err)
	}

	if call == nil {
		return nil, nil
	}

	return p.getCallStateFromCall(call, fromWriter)
}

func (p *Plugin) cleanUpState() error {
	p.LogDebug("cleaning up calls state")

	calls, err := p.store.GetAllActiveCalls(db.GetCallOpts{FromWriter: true})
	if err != nil {
		return fmt.Errorf("failed to get all active calls: %w", err)
	}

	for _, call := range calls {
		if err := p.lockCall(call.ChannelID); err != nil {
			p.LogError("failed to lock call", "err", err.Error())
			continue
		}

		if err := p.cleanCallState(call); err != nil {
			p.unlockCall(call.ChannelID)
			return fmt.Errorf("failed to clean up state: %w", err)
		}

		p.unlockCall(call.ChannelID)
	}

	return nil
}

func (p *Plugin) cleanCallState(call *public.Call) error {
	if call == nil {
		return nil
	}

	if _, err := p.updateCallPostEnded(call.PostID, mapKeys(call.Props.Participants)); err != nil {
		p.LogError("failed to update call post", "err", err.Error())
	}

	if call.EndAt == 0 {
		setCallEnded(call)
	}

	if err := p.store.DeleteCallsSessions(call.ID); err != nil {
		p.LogError("failed to delete calls sessions", "err", err.Error())
	}

	return p.store.UpdateCall(call)
}

func setCallEnded(call *public.Call) {
	call.EndAt = time.Now().UnixMilli()
	call.Participants = mapKeys(call.Props.Participants)
	call.Props.RTCDHost = ""
	call.Props.DismissedNotification = nil
	call.Props.NodeID = ""
	call.Props.Hosts = nil
	call.Props.Participants = nil
}
