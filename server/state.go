// Copyright (c) 2022-present Mattermost, Inc. All Rights Reserved.
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
	sessions      map[string]*public.CallSession
	Recording     *public.CallJob
	Transcription *public.CallJob
	LiveCaptions  *public.CallJob
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
	LiveCaptions           *JobStateClient `json:"live_captions,omitempty"`
	DismissedNotification  map[string]bool `json:"dismissed_notification,omitempty"`
}

type JobStateClient struct {
	Type    public.JobType `json:"type"`
	InitAt  int64          `json:"init_at"`
	StartAt int64          `json:"start_at"`
	EndAt   int64          `json:"end_at"`
	Err     string         `json:"err,omitempty"`
}

func (js *JobStateClient) toMap() map[string]interface{} {
	if js == nil {
		return nil
	}
	return map[string]interface{}{
		"type":     string(js.Type),
		"init_at":  js.InitAt,
		"start_at": js.StartAt,
		"end_at":   js.EndAt,
		"err":      js.Err,
	}
}

func getClientStateFromCallJob(job *public.CallJob) *JobStateClient {
	if job == nil {
		return nil
	}
	return &JobStateClient{
		Type:    job.Type,
		InitAt:  job.InitAt,
		StartAt: job.StartAt,
		EndAt:   job.EndAt,
		Err:     job.Props.Err,
	}
}

func (cs *callState) sessionsForUser(userID string) []*public.CallSession {
	if cs == nil {
		return nil
	}
	var sessions []*public.CallSession
	for _, session := range cs.sessions {
		if session.UserID == userID {
			sessions = append(sessions, session)
		}
	}
	return sessions
}

func (cs *callState) getRecording() (*public.CallJob, error) {
	if cs == nil {
		return nil, fmt.Errorf("no call ongoing")
	}
	if cs.Recording == nil {
		return nil, fmt.Errorf("no recording ongoing")
	}
	return cs.Recording, nil
}

func (cs *callState) getTranscription() (*public.CallJob, error) {
	if cs == nil {
		return nil, fmt.Errorf("no call ongoing")
	}
	if cs.Transcription == nil {
		return nil, fmt.Errorf("no transcription ongoing")
	}
	return cs.Transcription, nil
}

func (cs *callState) getLiveCaptions() (*public.CallJob, error) {
	if cs == nil {
		return nil, fmt.Errorf("no call ongoing")
	}
	if cs.LiveCaptions == nil {
		return nil, fmt.Errorf("no live captions ongoing")
	}
	return cs.LiveCaptions, nil
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

		// the participant who joined earliest should be host
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
	users, states := cs.getUsersAndStates(botID)

	// For now, only send the user's own dismissed state.
	var dismissed map[string]bool
	if cs.Props.DismissedNotification[userID] {
		dismissed = map[string]bool{
			userID: true,
		}
	}

	var screenSharingUserID string
	if s := cs.sessions[cs.Props.ScreenSharingSessionID]; s != nil {
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

		ScreenSharingSessionID: cs.Props.ScreenSharingSessionID,
		OwnerID:                cs.OwnerID,
		HostID:                 cs.GetHostID(),
		Recording:              getClientStateFromCallJob(cs.Recording),
		Transcription:          getClientStateFromCallJob(cs.Transcription),
		LiveCaptions:           getClientStateFromCallJob(cs.LiveCaptions),
		DismissedNotification:  dismissed,
	}
}

func (cs *callState) getUsersAndStates(botID string) ([]string, []UserStateClient) {
	users := make([]string, 0, len(cs.sessions))
	states := make([]UserStateClient, 0, len(cs.sessions))
	for _, session := range cs.sessions {
		// We don't want to expose to the client that the bot is in a call.
		if session.UserID == botID {
			continue
		}
		users = append(users, session.UserID)
		states = append(states, UserStateClient{
			SessionID:  session.ID,
			UserID:     session.UserID,
			Unmuted:    session.Unmuted,
			RaisedHand: session.RaisedHand,
		})
	}
	return users, states
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

	participants := make(map[string]struct{}, len(call.Participants))
	for _, p := range call.Participants {
		participants[p] = struct{}{}
	}

	sessions, err := p.store.GetCallSessions(call.ID, db.GetCallSessionOpts{
		FromWriter: fromWriter,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to get call sessions: %w", err)
	}
	state.sessions = sessions

	jobs, err := p.store.GetActiveCallJobs(call.ID, db.GetCallJobOpts{
		FromWriter: fromWriter,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to get call jobs: %w", err)
	}
	state.Recording = jobs[public.JobTypeRecording]
	state.Transcription = jobs[public.JobTypeTranscribing]
	state.LiveCaptions = jobs[public.JobTypeCaptioning]

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

	handlerID, err := p.getHandlerID()
	if err != nil {
		p.LogError(err.Error())
	}

	if handlerID != "" && p.nodeID == handlerID {
		p.metrics.IncStoreOp("KVDelete")
		if appErr := p.API.KVDelete(handlerKey); appErr != nil {
			p.LogError(appErr.Error())
		}
	}

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

// NOTE: cleanCallState is meant to be called under lock (on channelID) so that
// the operation can be performed atomically.
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

	jobs, err := p.store.GetActiveCallJobs(call.ID, db.GetCallJobOpts{
		FromWriter: true,
	})
	if err != nil {
		p.LogError("failed to get call jobs", "err", err.Error())
	}
	for _, job := range jobs {
		if job.EndAt == 0 {
			job.EndAt = time.Now().UnixMilli()
			if err := p.store.UpdateCallJob(job); err != nil {
				p.LogError("failed to update call job", "err", err.Error())
			}

			if job.Type == public.JobTypeRecording {
				p.publishWebSocketEvent(wsEventCallRecordingState, map[string]interface{}{
					"callID":   call.ChannelID,
					"recState": getClientStateFromCallJob(job).toMap(),
				}, &WebSocketBroadcast{ChannelID: call.ChannelID, ReliableClusterSend: true})
			}
		}
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
