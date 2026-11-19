// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/mattermost/mattermost-plugin-calls/server/db"
	"github.com/mattermost/mattermost-plugin-calls/server/public"

	"github.com/mattermost/mattermost/server/public/model"
)

var errAdminOnlyCommand = errors.New("this command is only available to system admins")

func (p *Plugin) checkAdminCommand(userID string) error {
	if !p.API.HasPermissionTo(userID, model.PermissionManageSystem) {
		return errAdminOnlyCommand
	}
	return nil
}

// activeParticipantCount returns the number of distinct users currently in the call.
// Props.Participants can't be used: it also includes users who already left.
func (p *Plugin) activeParticipantCount(call *public.Call) (int, error) {
	sessions, err := p.store.GetCallSessions(call.ID, db.GetCallSessionOpts{FromWriter: true})
	if err != nil {
		return 0, err
	}
	users := make(map[string]struct{}, len(sessions))
	for _, session := range sessions {
		users[session.UserID] = struct{}{}
	}
	return len(users), nil
}

func (p *Plugin) describeCall(call *public.Call) string {
	name, team := call.ChannelID, ""
	if ch, appErr := p.API.GetChannel(call.ChannelID); appErr == nil {
		name = ch.DisplayName
		if name == "" {
			name = ch.Name
		}
		if ch.TeamId != "" {
			if t, appErr := p.API.GetTeam(ch.TeamId); appErr == nil {
				team = t.Name
			}
		}
	}
	if team == "" {
		team = "-"
	}
	count := "?"
	if n, err := p.activeParticipantCount(call); err != nil {
		p.LogError("list-all: failed to get call sessions", "err", err.Error(), "callID", call.ID)
	} else {
		count = strconv.Itoa(n)
	}
	return fmt.Sprintf("| %s | %s | %s | %s | %s |",
		name, team, call.ChannelID,
		time.UnixMilli(call.StartAt).UTC().Format(time.RFC3339),
		count)
}

func (p *Plugin) handleListAllCommand(args *model.CommandArgs) (*model.CommandResponse, error) {
	if err := p.checkAdminCommand(args.UserId); err != nil {
		return nil, err
	}

	calls, err := p.store.GetAllActiveCalls(db.GetCallOpts{FromWriter: true})
	if err != nil {
		return nil, fmt.Errorf("failed to get active calls: %w", err)
	}

	text := "No active calls."
	if len(calls) > 0 {
		var sb strings.Builder
		fmt.Fprintf(&sb, "%d active call(s):\n\n", len(calls))
		sb.WriteString("| Channel | Team | Channel ID | Started (UTC) | Participants |\n|:--|:--|:--|:--|--:|\n")
		for _, call := range calls {
			sb.WriteString(p.describeCall(call) + "\n")
		}
		text = sb.String()
	}

	return &model.CommandResponse{ResponseType: model.CommandResponseTypeEphemeral, Text: text}, nil
}

const endAllPollEvery = 250 * time.Millisecond

var endAllGracePeriod = 5 * time.Second

// callToEnd holds what is needed to force-end a call after the grace period.
type callToEnd struct {
	callID    string
	channelID string
	nodeID    string
	rtcdHost  string

	// closeFailures counts sessions that couldn't be closed (the call is cleaned up anyway).
	closeFailures int
}

// notifyCallEnd asks clients to leave the call (they disconnect themselves and the
// last one out ends it). It returns nil if there's no active call in the channel.
func (p *Plugin) notifyCallEnd(channelID string) (*callToEnd, error) {
	state, err := p.lockCallReturnState(channelID)
	if err != nil {
		return nil, fmt.Errorf("failed to lock call: %w", err)
	}
	defer p.unlockCall(channelID)

	if state == nil {
		return nil, nil
	}

	p.publishWebSocketEvent(wsEventCallEnd, map[string]interface{}{}, &WebSocketBroadcast{ChannelID: channelID, ReliableClusterSend: true})

	return &callToEnd{
		callID:    state.Call.ID,
		channelID: channelID,
		nodeID:    state.Call.Props.NodeID,
		rtcdHost:  state.Call.Props.RTCDHost,
	}, nil
}

func (p *Plugin) isCallActive(c *callToEnd) (bool, error) {
	call, err := p.store.GetActiveCallByChannelID(c.channelID, db.GetCallOpts{FromWriter: true})
	if errors.Is(err, db.ErrNotFound) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return call != nil && call.ID == c.callID, nil
}

const maxForceEndAttempts = 5

// forceEndCall closes every remaining session and cleans up the call state. Sessions are
// closed without holding the call lock: closing an embedded RTC session synchronously
// triggers the leave handler which needs that same lock.
//
// Joins also take the call lock, so the session list is re-read under it before cleaning up:
// a session that joined after the first read gets closed on the next attempt instead of
// having its row deleted while its RTC session stays live.
func (p *Plugin) forceEndCall(c *callToEnd) error {
	closed := map[string]struct{}{}

	closeNew := func() error {
		sessions, err := p.store.GetCallSessions(c.callID, db.GetCallSessionOpts{FromWriter: true})
		if err != nil {
			return fmt.Errorf("failed to get call sessions: %w", err)
		}
		for _, session := range sessions {
			if _, ok := closed[session.ID]; ok {
				continue
			}
			// Best effort: end-all is a last-resort cleanup (e.g. right before disabling the
			// plugin), so a failed close mustn't leave the call lingering in the DB.
			closed[session.ID] = struct{}{}
			if err := p.closeRTCSessionWithHost(session.UserID, session.ID, c.channelID, c.nodeID, c.callID, c.rtcdHost); err != nil {
				p.LogWarn("end-all: failed to close RTC session, cleaning up anyway", "err", err.Error(), "sessionID", session.ID, "callID", c.callID)
				c.closeFailures++
			}
		}
		return nil
	}

	for range maxForceEndAttempts {
		if err := closeNew(); err != nil {
			return err
		}

		done, err := p.cleanIfAllClosed(c, closed)
		if err != nil {
			return err
		}
		if done {
			return nil
		}
	}

	return fmt.Errorf("sessions kept joining call %s", c.callID)
}

// cleanIfAllClosed cleans up the call state if, under the call lock, every session has
// already been closed. It reports false if new sessions showed up in the meantime.
func (p *Plugin) cleanIfAllClosed(c *callToEnd, closed map[string]struct{}) (bool, error) {
	state, err := p.lockCallReturnState(c.channelID)
	if err != nil {
		return false, fmt.Errorf("failed to lock call: %w", err)
	}
	defer p.unlockCall(c.channelID)

	// Closing the last session may already have ended the call.
	if state == nil || state.Call.ID != c.callID {
		return true, nil
	}

	sessions, err := p.store.GetCallSessions(c.callID, db.GetCallSessionOpts{FromWriter: true})
	if err != nil {
		return false, fmt.Errorf("failed to get call sessions: %w", err)
	}
	for _, session := range sessions {
		if _, ok := closed[session.ID]; !ok {
			return false, nil
		}
	}

	if err := p.cleanCallState(&state.Call); err != nil {
		return false, fmt.Errorf("failed to clean call state: %w", err)
	}

	return true, nil
}

func (p *Plugin) handleEndAllCommand(args *model.CommandArgs) (*model.CommandResponse, error) {
	if err := p.checkAdminCommand(args.UserId); err != nil {
		return nil, err
	}

	calls, err := p.store.GetAllActiveCalls(db.GetCallOpts{FromWriter: true})
	if err != nil {
		return nil, fmt.Errorf("failed to get active calls: %w", err)
	}

	var pending []*callToEnd
	var failed []string
	for _, call := range calls {
		c, err := p.notifyCallEnd(call.ChannelID)
		if err != nil {
			p.LogError("end-all: failed to notify call end", "err", err.Error(), "callID", call.ID, "channelID", call.ChannelID)
			failed = append(failed, call.ChannelID)
			continue
		}
		if c != nil {
			pending = append(pending, c)
		}
	}

	// Give clients a chance to leave on their own, returning early once all calls are gone.
	deadline := time.After(endAllGracePeriod)
	ticker := time.NewTicker(endAllPollEvery)
	defer ticker.Stop()
wait:
	for len(pending) > 0 {
		select {
		case <-ticker.C:
			var still []*callToEnd
			for _, c := range pending {
				// On lookup errors keep the call pending so it gets checked again.
				if active, err := p.isCallActive(c); err != nil || active {
					still = append(still, c)
				}
			}
			if len(still) == 0 {
				break wait
			}
		case <-deadline:
			break wait
		case <-p.stopCh:
			break wait
		}
	}

	var ended, closeFailed []string
	for _, c := range pending {
		active, err := p.isCallActive(c)
		if err != nil {
			p.LogError("end-all: failed to check call state", "err", err.Error(), "callID", c.callID, "channelID", c.channelID)
			failed = append(failed, c.channelID)
			continue
		}
		if active {
			if err := p.forceEndCall(c); err != nil {
				p.LogError("end-all: failed to end call", "err", err.Error(), "callID", c.callID, "channelID", c.channelID)
				failed = append(failed, c.channelID)
				continue
			}
		}
		ended = append(ended, c.channelID)
		if c.closeFailures > 0 {
			closeFailed = append(closeFailed, c.channelID)
		}
	}

	text := fmt.Sprintf("Ended %d call(s).", len(ended))
	if len(ended) > 0 {
		text += " Channels: " + strings.Join(ended, ", ")
	}
	if len(closeFailed) > 0 {
		text += fmt.Sprintf("\nSome sessions could not be closed for %d call(s), their state was cleaned up anyway: %s", len(closeFailed), strings.Join(closeFailed, ", "))
	}
	if len(failed) > 0 {
		text += fmt.Sprintf("\nFailed to end %d call(s): %s", len(failed), strings.Join(failed, ", "))
	}

	return &model.CommandResponse{ResponseType: model.CommandResponseTypeEphemeral, Text: text}, nil
}
