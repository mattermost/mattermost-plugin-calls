// Copyright (c) 2022-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"fmt"
	"sync/atomic"
	"time"

	"golang.org/x/time/rate"

	"github.com/mattermost/mattermost-plugin-calls/server/public"

	"github.com/mattermost/mattermost/server/public/model"
)

const (
	msgChSize = 50
)

type session struct {
	userID         string
	channelID      string
	connID         string
	originalConnID string

	// WebSocket

	signalOutCh chan []byte
	wsMsgCh     chan clientMessage
	// to notify of websocket disconnect.
	wsCloseCh chan struct{}
	wsClosed  int32
	// to notify of websocket reconnection.
	wsReconnectCh chan struct{}
	wsReconnected int32

	// RTC

	// to notify of rtc session disconnect.
	rtcCloseCh chan struct{}
	rtcClosed  int32
	// rtc indicates whether or not the session is also handling the WebRTC
	// connection.
	rtc bool

	// to notify of session leaving a call.
	leaveCh chan struct{}
	left    int32

	// removed tracks whether the session was removed from state.
	removed int32

	// rate limiter for incoming WebSocket messages.
	wsMsgLimiter *rate.Limiter
}

func newUserSession(userID, channelID, connID string, rtc bool) *session {
	return &session{
		userID:         userID,
		channelID:      channelID,
		connID:         connID,
		originalConnID: connID,
		signalOutCh:    make(chan []byte, msgChSize),
		wsMsgCh:        make(chan clientMessage, msgChSize*2),
		wsCloseCh:      make(chan struct{}),
		wsReconnectCh:  make(chan struct{}),
		leaveCh:        make(chan struct{}),
		rtcCloseCh:     make(chan struct{}),
		wsMsgLimiter:   rate.NewLimiter(10, 100),
		rtc:            rtc,
	}
}

func (p *Plugin) addUserSession(state *channelState, userID, connID, channelID, jobID string) (*channelState, error) {
	if state == nil {
		state = &channelState{}
	}

	if !p.userCanStartOrJoin(userID, state) {
		return nil, fmt.Errorf("calls are not enabled")
	}

	if state.Call == nil {
		state.Call = &callState{
			Call: public.Call{
				ID:        model.NewId(),
				CreateAt:  time.Now().UnixMilli(),
				StartAt:   time.Now().UnixMilli(),
				OwnerID:   userID,
				ChannelID: channelID,
				Props: public.CallProps{
					NodeID: p.nodeID,
				},
			},
			sessions: map[string]*public.CallSession{},
		}

		if p.rtcdManager != nil {
			host, err := p.rtcdManager.GetHostForNewCall()
			if err != nil {
				return nil, fmt.Errorf("failed to get rtcd host: %w", err)
			}
			p.LogDebug("rtcd host has been assigned to call", "host", host)
			state.Call.Props.RTCDHost = host
		}
	}

	if state.Call.EndAt > 0 {
		return nil, fmt.Errorf("call has ended")
	}

	if _, ok := state.Call.sessions[connID]; ok {
		return nil, fmt.Errorf("session is already connected")
	}

	// Check for cloud limits -- needs to be done here to prevent a race condition
	if allowed, err := p.joinAllowed(state); !allowed {
		if err != nil {
			p.LogError("joinAllowed failed", "error", err.Error())
		}
		return nil, fmt.Errorf("user cannot join because of limits")
	}

	// When the bot joins the call it means a job (recording, transcription) is
	// starting.The actual start time is when the bot sends the status update through the API.
	if userID == p.getBotID() {
		if state.Call.Recording == nil && state.Call.Transcription == nil {
			return nil, fmt.Errorf("no job in progress")
		}

		if state.Call.Recording != nil && state.Call.Recording.ID == jobID && state.Call.Recording.StartAt == 0 {
			p.LogDebug("bot joined, recording job is starting", "jobID", jobID)
			state.Call.Recording.BotConnID = connID
		} else if state.Call.Transcription != nil && state.Call.Transcription.ID == jobID && state.Call.Transcription.StartAt == 0 {
			p.LogDebug("bot joined, transcribing job is starting", "jobID", jobID)
			state.Call.Transcription.BotConnID = connID
		} else {
			// In this case we should fail to prevent the bot from joining
			// without consent.
			return nil, fmt.Errorf("job not in progress or already started")
		}
	}

	if len(state.Call.Props.Hosts) == 0 && userID != p.getBotID() {
		state.Call.Props.Hosts = []string{userID}
	}

	state.Call.sessions[connID] = &public.CallSession{
		ID:     connID,
		CallID: state.Call.ID,
		UserID: userID,
		JoinAt: time.Now().UnixMilli(),
	}

	if state.Call.Props.Participants == nil {
		state.Call.Props.Participants = map[string]struct{}{}
	}

	if userID != p.getBotID() {
		state.Call.Props.Participants[userID] = struct{}{}
	}

	if len(state.Call.sessions) == 1 {
		if err := p.store.CreateCall(&state.Call.Call); err != nil {
			return state, fmt.Errorf("failed to create call: %w", err)
		}
	} else {
		if err := p.store.UpdateCall(&state.Call.Call); err != nil {
			return state, fmt.Errorf("failed to update call: %w", err)
		}
	}
	if err := p.store.CreateCallSession(state.Call.sessions[connID]); err != nil {
		return state, fmt.Errorf("failed to create call session: %w", err)
	}

	return state, nil
}

func (p *Plugin) userCanStartOrJoin(userID string, state *channelState) bool {
	// If there is an ongoing call, we can let anyone join.
	// If calls are disabled, no-one can start or join.
	// If explicitly enabled, everyone can start or join.
	// If not explicitly enabled and default enabled, everyone can join or start
	// otherwise (not explicitly enabled and not default enabled), only sysadmins can start
	// TODO: look to see what logic we should lift to the joinCall fn
	cfg := p.getConfiguration()

	explicitlyEnabled := state.Enabled != nil && *state.Enabled
	explicitlyDisabled := state.Enabled != nil && !*state.Enabled
	defaultEnabled := cfg.DefaultEnabled != nil && *cfg.DefaultEnabled

	if state.Call != nil {
		return true
	}
	if explicitlyDisabled {
		return false
	}
	if explicitlyEnabled {
		return true
	}
	if defaultEnabled {
		return true
	}

	// must be !explicitlyEnabled and !defaultEnabled
	return p.API.HasPermissionTo(userID, model.PermissionManageSystem)
}

func (p *Plugin) removeUserSession(state *channelState, userID, originalConnID, connID, channelID string) (rErr error) {
	if state == nil {
		return fmt.Errorf("channel state is missing from store")
	}

	if state.Call == nil {
		return fmt.Errorf("call state is missing from channel state")
	}

	if _, ok := state.Call.sessions[originalConnID]; !ok {
		return fmt.Errorf("session not found in call state")
	}

	if state.Call.Props.ScreenSharingSessionID == originalConnID {
		state.Call.Props.ScreenSharingSessionID = ""
		if state.Call.Props.ScreenStartAt > 0 {
			state.Call.Stats.ScreenDuration += secondsSinceTimestamp(state.Call.Props.ScreenStartAt)
			state.Call.Props.ScreenStartAt = 0
		}
		defer func() {
			if rErr == nil {
				p.LogDebug("removed session was sharing, sending screen off event", "userID", userID, "connID", connID, "originalConnID", originalConnID)
				p.publishWebSocketEvent(wsEventUserScreenOff, map[string]interface{}{}, &model.WebsocketBroadcast{ChannelId: channelID, ReliableClusterSend: true})
			}
		}()
	}

	delete(state.Call.sessions, originalConnID)

	// If the bot leaves the call and recording has not been stopped it either means
	// something has failed or the max duration timeout triggered.
	if state.Call.Recording != nil && state.Call.Recording.EndAt == 0 && originalConnID == state.Call.Recording.BotConnID {
		state.Call.Recording.EndAt = time.Now().UnixMilli()
	}

	if state.Call.Transcription != nil && state.Call.Transcription.EndAt == 0 && originalConnID == state.Call.Transcription.BotConnID {
		state.Call.Transcription.EndAt = time.Now().UnixMilli()
	}

	if len(state.Call.sessions) == 0 {
		if state.Call.Props.ScreenStartAt > 0 {
			state.Call.Stats.ScreenDuration += secondsSinceTimestamp(state.Call.Props.ScreenStartAt)
		}
		state.Call.EndAt = time.Now().UnixMilli()
		state.Call.Props.RTCDHost = ""
		state.Call.Props.DismissedNotification = nil
		state.Call.Props.NodeID = ""
		state.Call.Props.Hosts = nil
	}

	if err := p.store.DeleteCallSession(originalConnID); err != nil {
		return fmt.Errorf("failed to delete call session: %w", err)
	}

	p.LogDebug("session was removed from state", "userID", userID, "connID", connID, "originalConnID", originalConnID)
	if len(state.Call.sessionsForUser(userID)) == 0 {
		// Only send event when all sessions for user have left.
		// This is to keep backwards compatibility with clients not supporting
		// multi-sessions.
		p.publishWebSocketEvent(wsEventUserDisconnected, map[string]interface{}{
			"userID": userID,
		}, &model.WebsocketBroadcast{ChannelId: channelID, ReliableClusterSend: true})
	}
	p.publishWebSocketEvent(wsEventUserLeft, map[string]interface{}{
		"user_id":    userID,
		"session_id": originalConnID,
	}, &model.WebsocketBroadcast{ChannelId: channelID, ReliableClusterSend: true})

	if state.Call.GetHostID() == userID && len(state.Call.sessions) > 0 {
		newHostID := state.Call.getHostID(p.getBotID())
		state.Call.Props.Hosts = []string{newHostID}
		if newHostID != userID {
			p.publishWebSocketEvent(wsEventCallHostChanged, map[string]interface{}{
				"hostID": newHostID,
			}, &model.WebsocketBroadcast{ChannelId: channelID, ReliableClusterSend: true})
		}
	}

	if err := p.store.UpdateCall(&state.Call.Call); err != nil {
		return fmt.Errorf("failed to update call: %w", err)
	}

	if state.Call.EndAt > 0 {
		dur, err := p.updateCallPostEnded(state.Call.PostID, mapKeys(state.Call.Props.Participants))
		if err != nil {
			return err
		}
		p.track(evCallEnded, map[string]interface{}{
			"ChannelID":      channelID,
			"CallID":         state.Call.ID,
			"Duration":       dur,
			"Participants":   len(state.Call.Props.Participants),
			"ScreenDuration": state.Call.Stats.ScreenDuration,
		})
	}

	return nil
}

// JoinAllowed returns true if the user is allowed to join the call, taking into
// account cloud and configuration limits
func (p *Plugin) joinAllowed(state *channelState) (bool, error) {
	// Rules are:
	// Cloud Starter: channels, dm/gm: limited to cfg.cloudStarterMaxParticipantsDefault
	// On-prem, Cloud Professional & Cloud Enterprise (incl. trial): DMs 1-1, GMs and Channel calls
	// limited to cfg.cloudPaidMaxParticipantsDefault people.
	// This is set in the override defaults, so MaxCallParticipants will be accurate for the current license.
	if cfg := p.getConfiguration(); cfg != nil && cfg.MaxCallParticipants != nil &&
		*cfg.MaxCallParticipants != 0 && len(state.Call.sessions) >= *cfg.MaxCallParticipants {
		return false, nil
	}
	return true, nil
}

func (p *Plugin) removeSession(us *session) error {
	// The flow to remove a session is a bit complex as it can trigger from many
	// (concurrent) places:
	// - Client leaving the call (proper WS disconnect).
	// - Client disconnecting (RTC connection closed).
	// - RTC side detecting a disconnection (network failure).
	// - Any of the above events coming from a different app node in a HA cluster.
	// Using an atomic helps to avoid logging errors for benign cases.
	if !atomic.CompareAndSwapInt32(&us.removed, 0, 1) {
		p.LogDebug("session was already removed", "userID", us.userID, "connID", us.connID, "originalConnID", us.originalConnID)
		return nil
	}

	state, err := p.lockCall(us.channelID)
	if err != nil {
		return fmt.Errorf("failed to lock call: %w", err)
	}
	defer p.unlockCall(us.channelID)

	p.LogDebug("removing session from state", "userID", us.userID, "connID", us.connID, "originalConnID", us.originalConnID)

	p.mut.Lock()
	delete(p.sessions, us.connID)
	p.mut.Unlock()

	if err := p.removeUserSession(state, us.userID, us.originalConnID, us.connID, us.channelID); err != nil {
		return fmt.Errorf("failed to remove user session (connID=%s): %w", us.originalConnID, err)
	}

	// // Checking if the recording has ended due to the bot leaving.
	// if prevState.Call != nil && prevState.Call.Recording != nil && currState.Call != nil && currState.Call.Recording != nil &&
	// 	currState.Call.Recording.EndAt > prevState.Call.Recording.EndAt {

	// 	p.LogDebug("recording bot left the call", "channelID", us.channelID, "jobID", currState.Call.Recording.JobID)

	// 	// Since MM-52346 we don't need to explicitly stop the recording here as
	// 	// the bot leaving the call will implicitly terminate the recording process.

	// 	if currState.Call.Transcription != nil && currState.Call.Transcription.EndAt == 0 {
	// 		p.LogDebug("attempting to stop transcribing job", "channelID", us.channelID, "jobID", currState.Call.Transcription.JobID)
	// 		if err := p.stopTranscribingJob(currState, us.channelID); err != nil {
	// 			p.LogError("failed to stop transcription", "channelID", us.channelID, "err", err.Error())
	// 		}
	// 	}

	// 	p.publishWebSocketEvent(wsEventCallRecordingState, map[string]interface{}{
	// 		"callID":   us.channelID,
	// 		"recState": currState.Call.Recording.getClientState().toMap(),
	// 	}, &model.WebsocketBroadcast{ChannelId: us.channelID, ReliableClusterSend: true})
	// }

	// // Checking if the transcription has ended due to the bot leaving.
	// if prevState.Call != nil && prevState.Call.Transcription != nil && currState.Call != nil && currState.Call.Transcription != nil &&
	// 	currState.Call.Transcription.EndAt > prevState.Call.Transcription.EndAt {

	// 	p.LogDebug("transcribing bot left the call", "channelID", us.channelID, "jobID", currState.Call.Transcription.JobID)

	// 	if currState.Call.Recording != nil && currState.Call.Recording.EndAt == 0 {
	// 		p.LogDebug("attempting to stop recording job", "channelID", us.channelID, "jobID", currState.Call.Recording.JobID)
	// 		if _, _, err := p.stopRecordingJob(currState, us.channelID); err != nil {
	// 			p.LogError("failed to stop recording", "channelID", us.channelID, "err", err.Error())
	// 		}
	// 	}

	// 	p.publishWebSocketEvent(wsEventCallTranscriptionState, map[string]interface{}{
	// 		"callID":  us.channelID,
	// 		"trState": currState.Call.Transcription.getClientState().toMap(),
	// 	}, &model.WebsocketBroadcast{ChannelId: us.channelID, ReliableClusterSend: true})
	// }

	// If the bot is the only user left in the call we automatically stop any
	// ongoing jobs.
	// if currState.Call != nil && currState.Call.onlyUserLeft(p.getBotID()) {
	// 	p.LogDebug("all users left call with job(s) in progress, stopping", "channelID", us.channelID)

	// 	if currState.Call.Recording != nil {
	// 		p.LogDebug("stopping ongoing recording", "jobID", currState.Call.Recording.JobID, "botConnID", currState.Call.Recording.BotConnID)
	// 		if err := p.getJobService().StopJob(us.channelID, currState.Call.Recording.ID, p.getBotID(), currState.Call.Recording.BotConnID); err != nil {
	// 			p.LogError("failed to stop recording job", "error", err.Error(),
	// 				"channelID", us.channelID,
	// 				"jobID", currState.Call.Recording.JobID,
	// 				"botConnID", currState.Call.Recording.BotConnID)
	// 		}
	// 	}

	// 	if currState.Call.Transcription != nil {
	// 		p.LogDebug("stopping ongoing transcription", "jobID", currState.Call.Transcription.JobID, "botConnID", currState.Call.Transcription.BotConnID)
	// 		if err := p.getJobService().StopJob(us.channelID, currState.Call.Transcription.ID, p.getBotID(), currState.Call.Transcription.BotConnID); err != nil {
	// 			p.LogError("failed to stop recording job", "error", err.Error(),
	// 				"channelID", us.channelID,
	// 				"jobID", currState.Call.Transcription.JobID,
	// 				"botConnID", currState.Call.Transcription.BotConnID)
	// 		}
	// 	}
	// }

	return nil
}

// getSessionByOriginalID retrieves a session by its original connection ID
// which is also the session ID matching the RTC connection.
func (p *Plugin) getSessionByOriginalID(sessionID string) *session {
	p.mut.RLock()
	defer p.mut.RUnlock()

	// We first try to see if the session is mapped by its original ID since
	// it's more efficient and the most probable case.
	us := p.sessions[sessionID]
	if us != nil {
		return us
	}

	// If we can't find one, we resort to looping through all the sessions to
	// check against the originalConnID field. This would be necessary only if
	// the session reconnected throughout the call with a new ws connection ID.
	for _, s := range p.sessions {
		if s.originalConnID == sessionID {
			return s
		}
	}

	return nil
}
