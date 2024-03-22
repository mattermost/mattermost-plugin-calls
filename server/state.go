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

type jobState struct {
	ID        string `json:"id"`
	CreatorID string `json:"creator_id"`
	JobID     string `json:"job_id"`
	BotConnID string `json:"bot_conn_id"`
	JobStateClient
}

type callState struct {
	public.Call
	sessions map[string]*public.CallSession

	// FIXME later
	Recording     *jobState
	Transcription *jobState
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

func (cs *callState) getRecording() (*jobState, error) {
	if cs == nil {
		return nil, fmt.Errorf("no call ongoing")
	}
	if cs.Recording == nil {
		return nil, fmt.Errorf("no recording ongoing")
	}
	return cs.Recording, nil
}

func (cs *callState) getTranscription() (*jobState, error) {
	if cs == nil {
		return nil, fmt.Errorf("no call ongoing")
	}
	if cs.Transcription == nil {
		return nil, fmt.Errorf("no transcription ongoing")
	}
	return cs.Transcription, nil
}

func (cs *callState) getHostID(botID string) string {
	var host public.CallSession
	for _, session := range cs.sessions {
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
		Recording:              cs.Recording.getClientState(),
		Transcription:          cs.Transcription.getClientState(),
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
	for _, session := range cs.sessions {
		if session.UserID != userID {
			return false
		}
	}
	return true
}

func (p *Plugin) getCallState(channelID string, fromWriter bool) (*callState, error) {
	call, err := p.store.GetActiveCallByChannelID(channelID, db.GetCallOpts{
		FromWriter: fromWriter,
	})
	if err != nil && !errors.Is(err, db.ErrNotFound) {
		return nil, fmt.Errorf("failed to get active call: %w", err)
	}

	if call == nil {
		return nil, nil
	}

	state := &callState{}

	if call != nil {
		participants := make(map[string]struct{}, len(call.Participants))
		for _, p := range call.Participants {
			participants[p] = struct{}{}
		}

		state.Call = *call

		sessions, err := p.store.GetCallSessions(call.ID, db.GetCallSessionOpts{
			FromWriter: fromWriter,
		})
		if err != nil {
			return nil, fmt.Errorf("failed to get call sessions: %w", err)
		}

		state.sessions = sessions
	}

	return state, nil
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
func (p *Plugin) cleanCallState(channelID string, state *callState) error {
	if state == nil {
		return nil
	}

	if _, err := p.updateCallPostEnded(state.Call.PostID, mapKeys(state.Call.Props.Participants)); err != nil {
		p.LogError("failed to update call post", "err", err.Error())
	}

	if state.Call.EndAt == 0 {
		state.Call.EndAt = time.Now().UnixMilli()
	}

	return p.store.UpdateCall(&state.Call)
}
