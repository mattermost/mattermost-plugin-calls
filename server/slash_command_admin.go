// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"errors"
	"fmt"
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
	return fmt.Sprintf("| %s | %s | %s | %s | %d |",
		name, team, call.ChannelID,
		time.UnixMilli(call.StartAt).UTC().Format(time.RFC3339),
		len(call.Props.Participants))
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

func (p *Plugin) isCallActive(c *callToEnd) bool {
	call, err := p.store.GetActiveCallByChannelID(c.channelID, db.GetCallOpts{FromWriter: true})
	return err == nil && call != nil && call.ID == c.callID
}

// forceEndCall closes every remaining session and cleans up the call state. Sessions are
// closed without holding the call lock: closing an embedded RTC session synchronously
// triggers the leave handler which needs that same lock.
func (p *Plugin) forceEndCall(c *callToEnd) error {
	sessions, err := p.store.GetCallSessions(c.callID, db.GetCallSessionOpts{FromWriter: true})
	if err != nil {
		p.LogError("end-all: failed to get call sessions", "err", err.Error(), "callID", c.callID)
	}
	for _, session := range sessions {
		if err := p.closeRTCSessionWithHost(session.UserID, session.ID, c.channelID, c.nodeID, c.callID, c.rtcdHost); err != nil {
			p.LogError("end-all: failed to close RTC session", "err", err.Error(), "sessionID", session.ID, "callID", c.callID)
		}
	}

	// Closing the last session may already have ended the call.
	state, err := p.lockCallReturnState(c.channelID)
	if err != nil {
		return fmt.Errorf("failed to lock call: %w", err)
	}
	defer p.unlockCall(c.channelID)

	if state == nil || state.Call.ID != c.callID {
		return nil
	}

	if err := p.cleanCallState(&state.Call); err != nil {
		return fmt.Errorf("failed to clean call state: %w", err)
	}

	return nil
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
				if p.isCallActive(c) {
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

	var ended []string
	for _, c := range pending {
		if p.isCallActive(c) {
			if err := p.forceEndCall(c); err != nil {
				p.LogError("end-all: failed to end call", "err", err.Error(), "callID", c.callID, "channelID", c.channelID)
				failed = append(failed, c.channelID)
				continue
			}
		}
		ended = append(ended, c.channelID)
	}

	text := fmt.Sprintf("Ended %d call(s).", len(ended))
	if len(ended) > 0 {
		text += " Channels: " + strings.Join(ended, ", ")
	}
	if len(failed) > 0 {
		text += fmt.Sprintf("\nFailed to end %d call(s): %s", len(failed), strings.Join(failed, ", "))
	}

	return &model.CommandResponse{ResponseType: model.CommandResponseTypeEphemeral, Text: text}, nil
}
