// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"errors"
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

var errGroupCallsNotAllowed = fmt.Errorf("unlicensed servers only allow calls in DMs")

type session struct {
	userID         string
	channelID      string
	connID         string
	originalConnID string
	callID         string

	// WebSocket
	wsMsgCh chan clientMessage
	// to notify of websocket disconnect.
	wsCloseCh chan struct{}
	wsClosed  int32
	// to notify of websocket reconnection.
	wsReconnectCh chan struct{}
	wsReconnected int32

	// to notify of session leaving a call.
	leaveCh chan struct{}
	left    int32

	// removed tracks whether the session was removed from state.
	removed int32

	// rate limiter for incoming WebSocket messages.
	wsMsgLimiter *rate.Limiter
}

func newUserSession(userID, channelID, connID, callID string) *session {
	return &session{
		userID:         userID,
		channelID:      channelID,
		connID:         connID,
		originalConnID: connID,
		callID:         callID,
		wsMsgCh:        make(chan clientMessage, msgChSize*2),
		wsCloseCh:      make(chan struct{}),
		wsReconnectCh:  make(chan struct{}),
		leaveCh:        make(chan struct{}),
		wsMsgLimiter:   rate.NewLimiter(10, 100),
	}
}

func (p *Plugin) addUserSession(state *callState, callsEnabled *bool, userID, connID, channelID string, ct model.ChannelType) (retState *callState, retErr error) {
	defer func(start time.Time) {
		p.metrics.ObserveAppHandlersTime("addUserSession", time.Since(start).Seconds())
	}(time.Now())

	originalState := state
	state = state.Clone()
	defer func() {
		if retErr != nil {
			retState = originalState
		}
	}()

	if state == nil {
		if err := p.userCanStartOrJoin(userID, callsEnabled, ct); err != nil {
			if errors.Is(err, errGroupCallsNotAllowed) {
				T := p.getTranslationFunc("")
				p.API.SendEphemeralPost(
					userID,
					&model.Post{
						UserId:    p.getBotID(),
						ChannelId: channelID,
						Message:   T("app.add_user_session.group_calls_not_allowed_error"),
					},
				)
			}
			return nil, err
		}
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
	}

	if state.Call.EndAt > 0 {
		return nil, fmt.Errorf("call has ended")
	}

	if _, ok := state.sessions[connID]; ok {
		return nil, fmt.Errorf("session is already connected")
	}

	if allowed, err := p.joinAllowed(state); !allowed {
		if err != nil {
			p.LogError("joinAllowed failed", "error", err.Error())
		}
		return nil, fmt.Errorf("user cannot join because of limits")
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

func (p *Plugin) userCanStartOrJoin(userID string, enabled *bool, channelType model.ChannelType) error {
	if channelType != model.ChannelTypeDirect && !p.licenseChecker.GroupCallsAllowed() {
		return errGroupCallsNotAllowed
	}

	cfg := p.getConfiguration()

	explicitlyEnabled := enabled != nil && *enabled
	explicitlyDisabled := enabled != nil && !*enabled
	defaultEnabled := cfg.DefaultEnabled != nil && *cfg.DefaultEnabled

	if explicitlyDisabled {
		return fmt.Errorf("calls are disabled in the channel")
	}
	if explicitlyEnabled {
		return nil
	}
	if defaultEnabled {
		return nil
	}

	if p.API.HasPermissionTo(userID, model.PermissionManageSystem) {
		return nil
	}

	return fmt.Errorf("insufficient permissions")
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
		setCallEnded(&state.Call)

		go p.deleteSIPDispatchRule(channelID)

		defer func() {
			_, err := p.updateCallPostEnded(state.Call.PostID, mapKeys(state.Call.Props.Participants))
			if err != nil {
				p.LogError("failed to update call post ended", "err", err.Error(), "channelID", channelID)
			}
		}()
	}

	if err := p.store.UpdateCall(&state.Call); err != nil {
		return fmt.Errorf("failed to update call: %w", err)
	}

	return nil
}

// JoinAllowed returns true if the user is allowed to join the call
func (p *Plugin) joinAllowed(state *callState) (bool, error) {
	if cfg := p.getConfiguration(); cfg != nil && cfg.MaxCallParticipants != nil &&
		*cfg.MaxCallParticipants != 0 && len(state.sessions) >= *cfg.MaxCallParticipants {
		return false, nil
	}
	return true, nil
}

func (p *Plugin) removeSession(us *session) error {
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

		if !p.hasSessionsForCall(callID) {
			p.LogDebug("no more local sessions for this call", "channelID", channelID, "callID", callID)

			if batcher := p.addSessionsBatchers[channelID]; batcher != nil && batcher.Empty() {
				p.addSessionsBatchers[channelID] = nil
				delete(p.addSessionsBatchers, channelID)
				go func() {
					batcher.Stop()
				}()
			}

			if batcher := p.removeSessionsBatchers[channelID]; batcher != nil && batcher.Empty() {
				p.removeSessionsBatchers[channelID] = nil
				delete(p.removeSessionsBatchers, channelID)
				go func() {
					batcher.Stop()
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

		var err error
		if batcher == nil {
			batcher, err = newBatcher(batching.Config{
				Interval: joinLeaveBatchingInterval,
				Size:     sessionsCount,
				PreRunCb: func(ctx batching.Context) error {
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

	state, err := p.lockCallReturnState(us.channelID)
	if err != nil {
		return fmt.Errorf("failed to lock call: %w", err)
	}
	removeSessionFromCall(state)
	p.unlockCall(us.channelID)

	return nil
}

func (p *Plugin) getSessionByOriginalID(sessionID string) *session {
	p.mut.RLock()
	defer p.mut.RUnlock()

	us := p.sessions[sessionID]
	if us != nil {
		return us
	}

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
