// Copyright (c) 2022-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"fmt"
	"sync/atomic"
	"time"

	"golang.org/x/time/rate"

	"github.com/mattermost/mattermost-plugin-calls/server/batching"
	"github.com/mattermost/mattermost-plugin-calls/server/db"
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
	callID         string

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

func newUserSession(userID, channelID, connID, callID string, rtc bool) *session {
	return &session{
		userID:         userID,
		channelID:      channelID,
		connID:         connID,
		originalConnID: connID,
		callID:         callID,
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

func (p *Plugin) addUserSession(state *callState, callsEnabled *bool, userID, connID, channelID, jobID string) (retState *callState, retErr error) {
	defer func(start time.Time) {
		p.metrics.ObserveAppHandlersTime("addUserSession", time.Since(start).Seconds())
	}(time.Now())

	// We need to make sure to keep the state consistent in case of error since it can be shared
	// with other operations in the same batch. To do this we make a deep copy so that we can
	// return the original state in case of error.
	originalState := state
	state = state.Clone()
	defer func() {
		// In case of error we return the original, un-mutated state.
		if retErr != nil {
			retState = originalState
		}
	}()

	// If there is an ongoing call, we can let anyone join.
	if state == nil && !p.userCanStartOrJoin(userID, callsEnabled) {
		return nil, fmt.Errorf("calls are not enabled")
	}

	if state == nil {
		state = &callState{
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

	if _, ok := state.sessions[connID]; ok {
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
		if state.Recording == nil && state.Transcription == nil {
			return nil, fmt.Errorf("no job in progress")
		}

		if state.Recording != nil && state.Recording.ID == jobID && state.Recording.StartAt == 0 {
			p.LogDebug("bot joined, recording job is starting", "jobID", jobID)
			state.Recording.Props.BotConnID = connID

			if err := p.store.UpdateCallJob(state.Recording); err != nil {
				state.Recording.Props.BotConnID = ""
				return nil, fmt.Errorf("failed to update call job: %w", err)
			}
		} else if state.Transcription != nil && state.Transcription.ID == jobID && state.Transcription.StartAt == 0 {
			p.LogDebug("bot joined, transcribing job is starting", "jobID", jobID)
			state.Transcription.Props.BotConnID = connID

			if state.LiveCaptions != nil && state.LiveCaptions.StartAt == 0 {
				p.LogDebug("bot joined, live captions job is starting", "jobID", state.LiveCaptions.ID, "trID", jobID)
				state.LiveCaptions.Props.BotConnID = connID
				if err := p.store.UpdateCallJob(state.LiveCaptions); err != nil {
					state.LiveCaptions.Props.BotConnID = ""
					return nil, fmt.Errorf("failed to update call job: %w", err)
				}
			}

			if err := p.store.UpdateCallJob(state.Transcription); err != nil {
				state.Transcription.Props.BotConnID = ""
				return nil, fmt.Errorf("failed to update call job: %w", err)
			}
		} else {
			// In this case we should fail to prevent the bot from joining
			// without consent.
			return nil, fmt.Errorf("job not in progress or already started")
		}
	}

	state.sessions[connID] = &public.CallSession{
		ID:     connID,
		CallID: state.Call.ID,
		UserID: userID,
		JoinAt: time.Now().UnixMilli(),
	}

	if newHostID := state.getHostID(p.getBotID()); newHostID != state.Call.GetHostID() {
		state.Call.Props.Hosts = []string{newHostID}
		defer func() {
			if retErr == nil {
				p.publishWebSocketEvent(wsEventCallHostChanged, map[string]interface{}{
					"hostID":  newHostID,
					"call_id": state.Call.ID,
				}, &WebSocketBroadcast{
					ChannelID:           channelID,
					ReliableClusterSend: true,
					UserIDs:             getUserIDsFromSessions(state.sessions),
				})
			}
		}()
	}

	if state.Call.Props.Participants == nil {
		state.Call.Props.Participants = map[string]struct{}{}
	}

	if userID != p.getBotID() {
		state.Call.Props.Participants[userID] = struct{}{}
	}

	if len(state.sessions) == 1 {
		if err := p.store.CreateCall(&state.Call); err != nil {
			return nil, fmt.Errorf("failed to create call: %w", err)
		}
	} else {
		if err := p.store.UpdateCall(&state.Call); err != nil {
			return nil, fmt.Errorf("failed to update call: %w", err)
		}
	}
	if err := p.store.CreateCallSession(state.sessions[connID]); err != nil {
		return nil, fmt.Errorf("failed to create call session: %w", err)
	}

	return state, nil
}

func (p *Plugin) userCanStartOrJoin(userID string, enabled *bool) bool {
	// If calls are disabled, no-one can start or join.
	// If explicitly enabled, everyone can start or join.
	// If not explicitly enabled and default enabled, everyone can join or start
	// otherwise (not explicitly enabled and not default enabled), only sysadmins can start
	// TODO: look to see what logic we should lift to the joinCall fn
	cfg := p.getConfiguration()

	explicitlyEnabled := enabled != nil && *enabled
	explicitlyDisabled := enabled != nil && !*enabled
	defaultEnabled := cfg.DefaultEnabled != nil && *cfg.DefaultEnabled

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

func (p *Plugin) removeUserSession(state *callState, userID, originalConnID, connID, channelID string) error {
	defer func(start time.Time) {
		p.metrics.ObserveAppHandlersTime("removeUserSession", time.Since(start).Seconds())
	}(time.Now())

	if state == nil {
		return fmt.Errorf("call state is nil")
	}

	if _, ok := state.sessions[originalConnID]; !ok {
		return fmt.Errorf("session not found in call state")
	}

	if err := p.store.DeleteCallSession(originalConnID); err != nil {
		return fmt.Errorf("failed to delete call session: %w", err)
	}
	delete(state.sessions, originalConnID)
	p.LogDebug("session was removed from state", "userID", userID, "connID", connID, "originalConnID", originalConnID)

	// Check if leaving session was screen sharing.
	if state.Call.Props.ScreenSharingSessionID == originalConnID {
		state.Call.Props.ScreenSharingSessionID = ""
		if state.Call.Props.ScreenStartAt > 0 {
			state.Call.Stats.ScreenDuration += secondsSinceTimestamp(state.Call.Props.ScreenStartAt)
			state.Call.Props.ScreenStartAt = 0
		}
		p.LogDebug("removed session was sharing, sending screen off event", "userID", userID, "connID", connID, "originalConnID", originalConnID)
		p.publishWebSocketEvent(wsEventUserScreenOff, map[string]interface{}{}, &WebSocketBroadcast{
			ChannelID:           channelID,
			ReliableClusterSend: true,
			UserIDs:             getUserIDsFromSessions(state.sessions),
		})
	}

	// If the bot is the only user left in the call we automatically stop any
	// ongoing jobs.
	if state.onlyUserLeft(p.getBotID()) {
		p.LogDebug("all users left call with job(s) in progress, stopping", "channelID", channelID)

		if state.Recording != nil {
			p.LogDebug("stopping ongoing recording", "jobID", state.Recording.Props.JobID, "botConnID", state.Recording.Props.BotConnID)
			if err := p.getJobService().StopJob(channelID, state.Recording.ID, p.getBotID(), state.Recording.Props.BotConnID); err != nil {
				p.LogError("failed to stop recording job", "error", err.Error(),
					"channelID", channelID,
					"jobID", state.Recording.Props.JobID,
					"botConnID", state.Recording.Props.BotConnID)
			}
		}

		if state.Transcription != nil {
			p.LogDebug("stopping ongoing transcription", "jobID", state.Transcription.Props.JobID, "botConnID", state.Transcription.Props.BotConnID)
			if err := p.getJobService().StopJob(channelID, state.Transcription.ID, p.getBotID(), state.Transcription.Props.BotConnID); err != nil {
				p.LogError("failed to stop transcribing job", "error", err.Error(),
					"channelID", channelID,
					"jobID", state.Transcription.Props.JobID,
					"botConnID", state.Transcription.Props.BotConnID)
			}
		}
	}

	// If the bot leaves the call and recording has not been stopped it either means
	// something has failed or the max duration timeout triggered.
	if state.Recording != nil && state.Recording.EndAt == 0 && originalConnID == state.Recording.Props.BotConnID {
		p.LogDebug("recording bot left the call", "channelID", channelID, "jobID", state.Recording.Props.JobID, "botConnID", originalConnID)

		state.Recording.EndAt = time.Now().UnixMilli()
		if err := p.store.UpdateCallJob(state.Recording); err != nil {
			return fmt.Errorf("failed to update call job: %w", err)
		}

		// Since MM-52346 we don't need to explicitly stop the recording here as
		// the bot leaving the call will implicitly terminate the recording process.
		if state.Transcription != nil && state.Transcription.EndAt == 0 {
			p.LogDebug("attempting to stop transcribing job", "channelID", channelID, "jobID", state.Transcription.Props.JobID)
			if err := p.stopTranscribingJob(state, channelID); err != nil {
				p.LogError("failed to stop transcription", "channelID", channelID, "err", err.Error())
			}
		}

		p.publishWebSocketEvent(wsEventCallJobState, map[string]interface{}{
			"callID":   channelID,
			"jobState": getClientStateFromCallJob(state.Recording).toMap(),
		}, &WebSocketBroadcast{
			ChannelID:           channelID,
			ReliableClusterSend: true,
			UserIDs:             getUserIDsFromSessions(state.sessions),
		})

		// MM-57224: deprecated, remove when not needed by mobile pre 2.14.0
		p.publishWebSocketEvent(wsEventCallRecordingState, map[string]interface{}{
			"callID":   channelID,
			"recState": getClientStateFromCallJob(state.Recording).toMap(),
		}, &WebSocketBroadcast{
			ChannelID:           channelID,
			ReliableClusterSend: true,
			UserIDs:             getUserIDsFromSessions(state.sessions),
		})
	}

	if state.Transcription != nil && state.Transcription.EndAt == 0 && originalConnID == state.Transcription.Props.BotConnID {
		p.LogDebug("transcribing bot left the call", "channelID", channelID, "jobID", state.Transcription.Props.JobID, "botConnID", originalConnID)

		state.Transcription.EndAt = time.Now().UnixMilli()
		if err := p.store.UpdateCallJob(state.Transcription); err != nil {
			return fmt.Errorf("failed to update call job: %w", err)
		}

		if state.Recording != nil && state.Recording.EndAt == 0 {
			p.LogDebug("attempting to stop recording job", "channelID", channelID, "jobID", state.Recording.Props.JobID)
			if _, _, err := p.stopRecordingJob(state, channelID); err != nil {
				p.LogError("failed to stop recording", "channelID", channelID, "err", err.Error())
			}
		}

		p.publishWebSocketEvent(wsEventCallJobState, map[string]interface{}{
			"callID":   channelID,
			"jobState": getClientStateFromCallJob(state.Transcription).toMap(),
		}, &WebSocketBroadcast{
			ChannelID:           channelID,
			ReliableClusterSend: true,
			UserIDs:             getUserIDsFromSessions(state.sessions),
		})

		if state.LiveCaptions != nil {
			p.publishWebSocketEvent(wsEventCallJobState, map[string]interface{}{
				"callID":   channelID,
				"jobState": getClientStateFromCallJob(state.LiveCaptions).toMap(),
			}, &WebSocketBroadcast{
				ChannelID:           channelID,
				ReliableClusterSend: true,
				UserIDs:             getUserIDsFromSessions(state.sessions),
			})
		}
	}

	if state.LiveCaptions != nil && state.LiveCaptions.EndAt == 0 && connID == state.LiveCaptions.Props.BotConnID {
		state.LiveCaptions.EndAt = time.Now().UnixMilli()
		if err := p.store.UpdateCallJob(state.LiveCaptions); err != nil {
			return fmt.Errorf("failed to update call job: %w", err)
		}
	}

	if len(state.sessionsForUser(userID)) == 0 {
		// Only send event when all sessions for user have left.
		// This is to keep backwards compatibility with clients not supporting
		// multi-sessions.
		p.publishWebSocketEvent(wsEventUserDisconnected, map[string]interface{}{
			"userID": userID,
		}, &WebSocketBroadcast{ChannelID: channelID, ReliableClusterSend: true})
	}
	p.publishWebSocketEvent(wsEventUserLeft, map[string]interface{}{
		"user_id":    userID,
		"session_id": originalConnID,
	}, &WebSocketBroadcast{ChannelID: channelID, ReliableClusterSend: true})

	// Change host if needed
	if state.Call.GetHostID() == userID && len(state.sessions) > 0 {
		if newHostID := state.getHostID(p.getBotID()); newHostID != userID {
			if newHostID == "" {
				state.Call.Props.Hosts = nil
			} else {
				state.Call.Props.Hosts = []string{newHostID}
			}
			p.publishWebSocketEvent(wsEventCallHostChanged, map[string]interface{}{
				"hostID":  newHostID,
				"call_id": state.Call.ID,
			}, &WebSocketBroadcast{
				ChannelID:           channelID,
				ReliableClusterSend: true,
				UserIDs:             getUserIDsFromSessions(state.sessions),
			})
		}
	}

	// Call has ended
	if len(state.sessions) == 0 {
		if state.Call.Props.ScreenStartAt > 0 {
			state.Call.Stats.ScreenDuration += secondsSinceTimestamp(state.Call.Props.ScreenStartAt)
		}
		setCallEnded(&state.Call)

		defer func() {
			dur, err := p.updateCallPostEnded(state.Call.PostID, mapKeys(state.Call.Props.Participants))
			if err != nil {
				p.LogError("failed to update call post ended", "err", err.Error(), "channelID", channelID)
			}
			p.track(evCallEnded, map[string]interface{}{
				"ChannelID":      channelID,
				"CallID":         state.Call.ID,
				"Duration":       dur,
				"Participants":   len(state.Call.Props.Participants),
				"ScreenDuration": state.Call.Stats.ScreenDuration,
			})
		}()
	}

	if err := p.store.UpdateCall(&state.Call); err != nil {
		return fmt.Errorf("failed to update call: %w", err)
	}

	return nil
}

// JoinAllowed returns true if the user is allowed to join the call, taking into
// account cloud and configuration limits
func (p *Plugin) joinAllowed(state *callState) (bool, error) {
	// Rules are:
	// Cloud Starter: channels, dm/gm: limited to cfg.cloudStarterMaxParticipantsDefault
	// On-prem, Cloud Professional & Cloud Enterprise (incl. trial): DMs 1-1, GMs and Channel calls
	// limited to cfg.cloudPaidMaxParticipantsDefault people.
	// This is set in the override defaults, so MaxCallParticipants will be accurate for the current license.
	if cfg := p.getConfiguration(); cfg != nil && cfg.MaxCallParticipants != nil &&
		*cfg.MaxCallParticipants != 0 && len(state.sessions) >= *cfg.MaxCallParticipants {
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

	sessionsCount, err := p.store.GetCallSessionsCount(us.callID, db.GetCallSessionOpts{})
	if err != nil {
		p.LogError("failed to get call sessions count", "callID", us.callID, "err", err.Error())
	}

	removeSessionFromCall := func(state *callState) {
		p.LogDebug("removing session from state", "userID", us.userID, "connID", us.connID, "originalConnID", us.originalConnID)

		p.mut.Lock()
		delete(p.sessions, us.connID)

		channelID := us.channelID
		callID := us.callID

		// If all locally stored sessions for the call have been removed, we should stop any associated batcher.
		if !p.hasSessionsForCall(callID) {
			p.LogDebug("no more local sessions for this call", "channelID", channelID, "callID", callID)

			if batcher := p.addSessionsBatchers[channelID]; batcher != nil {
				p.LogDebug("stopping addSessionsBatcher for call", "channelID", channelID, "callID", callID)
				p.addSessionsBatchers[channelID] = nil
				delete(p.addSessionsBatchers, channelID)
				// stop needs to happen asynchronously since this method is executed as part of a batch.
				go func() {
					batcher.Stop()
					p.LogDebug("stopped addSessionsBatcher for call", "channelID", channelID, "callID", callID)
				}()
			}

			if batcher := p.removeSessionsBatchers[channelID]; batcher != nil {
				p.LogDebug("stopping removeSessionsBatcher for call", "channelID", channelID, "callID", callID)
				p.removeSessionsBatchers[channelID] = nil
				delete(p.removeSessionsBatchers, channelID)
				// stop needs to happen asynchronously since this method is executed as part of a batch.
				go func() {
					batcher.Stop()
					p.LogDebug("stopped removeSessionsBatcher for call", "channelID", channelID, "callID", callID)
				}()
			}
		}
		p.mut.Unlock()

		if err := p.removeUserSession(state, us.userID, us.originalConnID, us.connID, us.channelID); err != nil {
			p.LogError("failed to remove user session ", "originalConnID", us.originalConnID, "err", err.Error())
		}
	}

	p.mut.Lock()
	batcher := p.removeSessionsBatchers[us.channelID]
	shouldBatch := batcher != nil || sessionsCount >= minMembersCountForBatching
	if shouldBatch {
		defer p.mut.Unlock()
		p.LogDebug("will batch sessions leaving operations",
			"channelID", us.channelID,
			"sessionsCount", sessionsCount,
			"threshold", minMembersCountForBatching,
		)
		var err error
		if batcher == nil {
			p.LogDebug("creating new removeSessionsBatcher for call", "channelID", us.channelID, "batchMaxSize", sessionsCount)

			batcher, err = batching.NewBatcher(batching.Config{
				Interval: joinLeaveBatchingInterval,
				Size:     sessionsCount,
				PreRunCb: func(ctx batching.Context) error {
					p.LogDebug("performing removeSessionFromCall batch", "channelID", us.channelID, "batchSize", ctx[batching.ContextBatchSizeKey])

					state, err := p.lockCallReturnState(us.channelID)
					if err != nil {
						return fmt.Errorf("failed to lock call: %w", err)
					}
					ctx["callState"] = state

					return nil
				},
				PostRunCb: func(_ batching.Context) error {
					p.unlockCall(us.channelID)
					return nil
				},
			})
			if err != nil {
				return fmt.Errorf("failed to create batcher: %w", err)
			}
			p.removeSessionsBatchers[us.channelID] = batcher
			batcher.Start()
		}

		err = batcher.Push(func(ctx batching.Context) {
			removeSessionFromCall(ctx["callState"].(*callState))
		})
		if err != nil {
			return fmt.Errorf("failed to push to batcher: %w", err)
		}

		return nil
	}

	// Non-batching case
	p.mut.Unlock()

	p.LogDebug("no need to batch sessions leaving operations",
		"channelID", us.channelID,
		"sessionsCount", sessionsCount,
		"threshold", minMembersCountForBatching,
	)

	state, err := p.lockCallReturnState(us.channelID)
	if err != nil {
		return fmt.Errorf("failed to lock call: %w", err)
	}
	removeSessionFromCall(state)
	p.unlockCall(us.channelID)

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

func (p *Plugin) hasSessionsForCall(callID string) bool {
	for _, s := range p.sessions {
		if s.callID == callID {
			return true
		}
	}
	return false
}
