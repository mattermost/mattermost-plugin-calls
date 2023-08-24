// Copyright (c) 2022-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"errors"
	"fmt"
	"time"

	"golang.org/x/time/rate"

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

func (p *Plugin) addUserSession(userID, connID string, channel *model.Channel) (channelState, channelState, error) {
	var currState channelState
	var prevState channelState

	botID := p.getBotID()

	err := p.kvSetAtomicChannelState(channel.Id, func(state *channelState) (*channelState, error) {
		if state == nil {
			state = &channelState{}
		}

		if !p.userCanStartOrJoin(userID, state) {
			return nil, fmt.Errorf("calls are not enabled")
		}

		prevState = *state.Clone()

		if state.Call == nil {
			state.Call = &callState{
				ID:       model.NewId(),
				StartAt:  time.Now().UnixMilli(),
				Users:    make(map[string]*userState),
				Sessions: make(map[string]struct{}),
				OwnerID:  userID,
			}
			state.NodeID = p.nodeID

			if p.rtcdManager != nil {
				host, err := p.rtcdManager.GetHostForNewCall()
				if err != nil {
					return nil, fmt.Errorf("failed to get rtcd host: %w", err)
				}
				p.LogDebug("rtcd host has been assigned to call", "host", host)
				state.Call.RTCDHost = host
			}
		}

		if state.Call.EndAt > 0 {
			return nil, fmt.Errorf("call has ended")
		}

		if _, ok := state.Call.Users[userID]; ok {
			return nil, fmt.Errorf("user is already connected")
		}

		// Check for cloud limits -- needs to be done here to prevent a race condition
		if allowed, err := p.joinAllowed(state); !allowed {
			if err != nil {
				p.LogError("joinAllowed failed", "error", err.Error())
			}
			return nil, fmt.Errorf("user cannot join because of limits")
		}

		// When the bot joins the call it means the recording has started.
		if userID == botID {
			if state.Call.Recording != nil && state.Call.Recording.StartAt == 0 {
				state.Call.Recording.StartAt = time.Now().UnixMilli()
				state.Call.Recording.BotConnID = connID
			} else if state.Call.Recording == nil || state.Call.Recording.StartAt > 0 {
				// In this case we should fail to prevent the bot from recording
				// without consent.
				return nil, fmt.Errorf("recording not in progress or already started")
			}
		}

		if state.Call.HostID == "" && userID != botID {
			state.Call.HostID = userID
		}

		state.Call.Users[userID] = &userState{
			JoinAt: time.Now().UnixMilli(),
		}
		state.Call.Sessions[connID] = struct{}{}
		if len(state.Call.Users) > state.Call.Stats.Participants {
			state.Call.Stats.Participants = len(state.Call.Users)
		}

		currState = *state
		return state, nil
	})

	return currState, prevState, err
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

func (p *Plugin) removeUserSession(userID, connID, channelID string) (channelState, channelState, error) {
	var currState channelState
	var prevState channelState
	errNotFound := errors.New("not found")

	setChannelState := func(state *channelState) (*channelState, error) {
		if state == nil {
			return nil, fmt.Errorf("channel state is missing from store")
		}

		prevState = *state.Clone()

		if state.Call == nil {
			return nil, fmt.Errorf("call state is missing from channel state")
		}

		if _, ok := state.Call.Users[userID]; !ok {
			p.LogDebug("user not found in state", "userID", userID)
			return nil, errNotFound
		}

		if state.Call.ScreenSharingID == userID {
			state.Call.ScreenSharingID = ""
			state.Call.ScreenStreamID = ""
			if state.Call.ScreenStartAt > 0 {
				state.Call.Stats.ScreenDuration += secondsSinceTimestamp(state.Call.ScreenStartAt)
				state.Call.ScreenStartAt = 0
			}
		}

		delete(state.Call.Users, userID)
		delete(state.Call.Sessions, connID)

		if state.Call.HostID == userID && len(state.Call.Users) > 0 {
			state.Call.HostID = state.Call.getHostID(p.getBotID())
		}

		// If the bot leaves the call and recording has not been stopped it either means
		// something has failed or the max duration timeout triggered.
		if state.Call.Recording != nil && state.Call.Recording.EndAt == 0 && connID == state.Call.Recording.BotConnID {
			state.Call.Recording.EndAt = time.Now().UnixMilli()
		}

		if len(state.Call.Users) == 0 {
			if state.Call.ScreenStartAt > 0 {
				state.Call.Stats.ScreenDuration += secondsSinceTimestamp(state.Call.ScreenStartAt)
			}
			state.Call = nil
			state.NodeID = ""
		}

		currState = *state
		return state, nil
	}

	var err error
	maxTries := 5
	for i := 0; i < maxTries; i++ {
		err = p.kvSetAtomicChannelState(channelID, setChannelState)
		if errors.Is(err, errNotFound) {
			// pausing in the edge case that the db state has not been fully
			// replicated yet fixing possible read-after-write issues.
			time.Sleep(10 * time.Millisecond)
			continue
		}
		break
	}

	return currState, prevState, err
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
		*cfg.MaxCallParticipants != 0 && len(state.Call.Users) >= *cfg.MaxCallParticipants {
		return false, nil
	}
	return true, nil
}

func (p *Plugin) removeSession(us *session) error {
	p.LogDebug("removing session from state", "userID", us.userID, "connID", us.connID, "originalConnID", us.originalConnID)

	p.mut.Lock()
	delete(p.sessions, us.connID)
	p.mut.Unlock()

	currState, prevState, err := p.removeUserSession(us.userID, us.originalConnID, us.channelID)
	if err != nil {
		return err
	}

	// Checking if the user session was removed as this method can be called
	// multiple times but we should send out the ws event only once.
	if prevState.Call != nil && prevState.Call.Users[us.userID] != nil && (currState.Call == nil || currState.Call.Users[us.userID] == nil) {
		p.LogDebug("session was removed from state", "userID", us.userID, "connID", us.connID, "originalConnID", us.originalConnID)
		p.publishWebSocketEvent(wsEventUserDisconnected, map[string]interface{}{
			"userID": us.userID,
		}, &model.WebsocketBroadcast{ChannelId: us.channelID, ReliableClusterSend: true})

		// If the removed user was sharing we should send out a screen off event.
		if prevState.Call.ScreenSharingID != "" && (currState.Call == nil || currState.Call.ScreenSharingID == "") {
			p.LogDebug("removed session was sharing, sending screen off event", "userID", us.userID, "connID", us.connID)
			p.publishWebSocketEvent(wsEventUserScreenOff, map[string]interface{}{}, &model.WebsocketBroadcast{ChannelId: us.channelID, ReliableClusterSend: true})
		}
	}

	// Checking if the host has changed.
	if prevState.Call != nil && currState.Call != nil && currState.Call.HostID != prevState.Call.HostID {
		p.publishWebSocketEvent(wsEventCallHostChanged, map[string]interface{}{
			"hostID": currState.Call.HostID,
		}, &model.WebsocketBroadcast{ChannelId: us.channelID, ReliableClusterSend: true})
	}

	// Checking if the recording has ended due to the bot leaving.
	if prevState.Call != nil && prevState.Call.Recording != nil && currState.Call != nil && currState.Call.Recording != nil &&
		currState.Call.Recording.EndAt > prevState.Call.Recording.EndAt {

		p.LogDebug("recording bot left the call, attempting to stop job", "channelID", us.channelID, "jobID", currState.Call.Recording.JobID)

		// Since MM-52346 we don't need to explicitly stop the recording here as
		// the bot leaving the call will implicitly terminate the recording process.

		p.publishWebSocketEvent(wsEventCallRecordingState, map[string]interface{}{
			"callID":   us.channelID,
			"recState": currState.Call.Recording.getClientState().toMap(),
		}, &model.WebsocketBroadcast{ChannelId: us.channelID, ReliableClusterSend: true})
	}

	// If the bot is the only user left in the call we automatically stop the recording.
	if currState.Call != nil && currState.Call.Recording != nil && len(currState.Call.Users) == 1 && currState.Call.Users[p.getBotID()] != nil {
		p.LogDebug("all users left call with recording in progress, stopping", "channelID", us.channelID, "jobID", currState.Call.Recording.JobID)
		if err := p.getJobService().StopJob(us.channelID); err != nil {
			p.LogError("failed to stop recording job", "error", err.Error(), "channelID", us.channelID, "jobID", currState.Call.Recording.JobID)
		}
	}

	// Check if call has ended.
	if prevState.Call != nil && currState.Call == nil {
		dur, err := p.updateCallPostEnded(prevState.Call.PostID)
		if err != nil {
			return err
		}
		p.track(evCallEnded, map[string]interface{}{
			"ChannelID":      us.channelID,
			"CallID":         prevState.Call.ID,
			"Duration":       dur,
			"Participants":   prevState.Call.Stats.Participants,
			"ScreenDuration": prevState.Call.Stats.ScreenDuration,
		})
	}
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
