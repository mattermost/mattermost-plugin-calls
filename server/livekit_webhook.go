// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"net/http"
	"strings"
	"time"

	"github.com/mattermost/mattermost-plugin-calls/server/db"
	"github.com/mattermost/mattermost-plugin-calls/server/public"

	"github.com/mattermost/mattermost/server/public/model"

	"github.com/livekit/protocol/auth"
	"github.com/livekit/protocol/livekit"
	lkwebhook "github.com/livekit/protocol/webhook"
)

func (p *Plugin) handleLiveKitWebhook(w http.ResponseWriter, r *http.Request) {
	cfg := p.getConfiguration()
	provider := auth.NewSimpleKeyProvider(cfg.LiveKitAPIKey, cfg.LiveKitAPISecret)

	event, err := lkwebhook.ReceiveWebhookEvent(r, provider)
	if err != nil {
		p.LogError("failed to verify LiveKit webhook", "err", err.Error())
		http.Error(w, "invalid webhook", http.StatusUnauthorized)
		return
	}

	p.LogDebug("LiveKit webhook received",
		"event", event.GetEvent(),
		"room", event.GetRoom().GetName(),
		"participant", event.GetParticipant().GetIdentity(),
		"participantKind", event.GetParticipant().GetKind().String(),
	)

	switch event.GetEvent() {
	case lkwebhook.EventParticipantJoined:
		p.handleWebhookParticipantJoined(event)
	case lkwebhook.EventParticipantLeft:
		p.handleWebhookParticipantLeft(event)
	case lkwebhook.EventRoomFinished:
		p.handleWebhookRoomFinished(event)
	}

	w.WriteHeader(http.StatusOK)
}

func (p *Plugin) handleWebhookParticipantJoined(event *livekit.WebhookEvent) {
	participant := event.GetParticipant()
	room := event.GetRoom()
	if participant == nil || room == nil {
		return
	}

	identity := participant.GetIdentity()
	channelID := room.GetName()

	// Only handle guest and SIP participants — MM users are tracked via WebSocket.
	if !isGuestIdentity(identity) && !isSIPParticipant(participant) {
		return
	}

	if isSIPParticipant(participant) {
		p.handleSIPParticipantJoined(participant, channelID)
		return
	}

	// URL guest joined — session was already created in handleGuestJoin.
	// Nothing additional needed here.
	p.LogDebug("guest participant joined via webhook",
		"identity", identity, "channelID", channelID)
}

func (p *Plugin) handleSIPParticipantJoined(participant *livekit.ParticipantInfo, channelID string) {
	identity := participant.GetIdentity()
	displayName := participant.GetName()
	if displayName == "" {
		displayName = identity
	}

	// Extract caller number from attributes if available.
	var callerNumber *string
	if attrs := participant.GetAttributes(); attrs != nil {
		if num, ok := attrs["sip.callID"]; ok {
			callerNumber = &num
		}
	}

	// Check if a call is active; if not, start one.
	active, err := p.store.GetCallActive(channelID, db.GetCallOpts{FromWriter: true})
	if err != nil {
		p.LogError("handleSIPParticipantJoined: failed to check call active", "err", err.Error())
		return
	}
	if !active {
		if err := p.startCallFromGuest(channelID, displayName); err != nil {
			p.LogError("handleSIPParticipantJoined: failed to start call", "err", err.Error())
			return
		}
	}

	// Find the matching SIP guest link for this channel to record the session.
	// Try to find a permanent (non-single-use) SIP link first.
	link, err := p.store.GetActiveSIPGuestLinkByChannel(channelID, db.GetGuestLinkOpts{FromWriter: true})
	if err != nil {
		p.LogDebug("handleSIPParticipantJoined: no SIP guest link found for channel, creating session without link",
			"channelID", channelID, "err", err.Error())
	}

	sessionID := model.NewId()
	now := time.Now().UnixMilli()

	var linkID string
	if link != nil {
		linkID = link.ID
		_ = p.store.IncrementGuestLinkUseCount(link.ID)
	}

	guestSession := &public.GuestSession{
		ID:           sessionID,
		LinkID:       linkID,
		Type:         public.GuestLinkTypeSIP,
		ChannelID:    channelID,
		DisplayName:  displayName,
		CreateAt:     now,
		CallerNumber: callerNumber,
		Props:        public.GuestSessionProps{},
	}

	if linkID == "" {
		// Without a link ID the session won't pass IsValid, use a placeholder.
		guestSession.LinkID = "sip-direct"
	}

	if err := p.store.CreateGuestSession(guestSession); err != nil {
		p.LogError("handleSIPParticipantJoined: failed to create guest session", "err", err.Error())
		return
	}

	p.LogDebug("SIP participant joined",
		"identity", identity, "channelID", channelID, "sessionID", sessionID, "displayName", displayName)
}

func (p *Plugin) handleWebhookParticipantLeft(event *livekit.WebhookEvent) {
	participant := event.GetParticipant()
	room := event.GetRoom()
	if participant == nil || room == nil {
		return
	}

	identity := participant.GetIdentity()
	channelID := room.GetName()

	if !isGuestIdentity(identity) && !isSIPParticipant(participant) {
		return
	}

	// Extract session ID from identity prefix.
	sessionID := sessionIDFromIdentity(identity)
	if sessionID != "" {
		now := time.Now().UnixMilli()
		if err := p.store.UpdateGuestSessionEndAt(sessionID, now); err != nil {
			p.LogError("handleWebhookParticipantLeft: failed to update guest session end",
				"err", err.Error(), "sessionID", sessionID)
		}
	}

	p.LogDebug("guest/SIP participant left via webhook",
		"identity", identity, "channelID", channelID,
		"remainingParticipants", room.GetNumParticipants())

	// If the room is now empty, the room_finished event will handle call cleanup.
}

func (p *Plugin) handleWebhookRoomFinished(event *livekit.WebhookEvent) {
	room := event.GetRoom()
	if room == nil {
		return
	}

	channelID := room.GetName()

	p.LogDebug("LiveKit room finished", "channelID", channelID)

	// End any remaining active guest sessions for this channel.
	now := time.Now().UnixMilli()
	if err := p.store.EndActiveGuestSessionsByChannel(channelID, now); err != nil {
		p.LogError("handleWebhookRoomFinished: failed to end guest sessions", "err", err.Error(), "channelID", channelID)
	}

	// Check if there's an active call that needs to be ended.
	// This handles the case where a guest-started call has no MM user sessions
	// and the LiveKit room empties.
	call, err := p.store.GetActiveCallByChannelID(channelID, db.GetCallOpts{FromWriter: true})
	if err != nil {
		if strings.Contains(err.Error(), "not found") {
			return
		}
		p.LogError("handleWebhookRoomFinished: failed to get active call", "err", err.Error(), "channelID", channelID)
		return
	}

	// Check if any MM user sessions are still tracked. If not, end the call.
	p.mut.RLock()
	hasMMSessions := false
	for _, us := range p.sessions {
		if us.channelID == channelID {
			hasMMSessions = true
			break
		}
	}
	p.mut.RUnlock()

	if !hasMMSessions {
		p.LogDebug("ending call after room finished with no MM sessions", "channelID", channelID, "callID", call.ID)

		call.EndAt = now
		if err := p.store.UpdateCall(call); err != nil {
			p.LogError("handleWebhookRoomFinished: failed to end call", "err", err.Error())
			return
		}

		if _, err := p.updateCallPostEnded(call.PostID, mapKeys(call.Props.Participants)); err != nil {
			p.LogError("handleWebhookRoomFinished: failed to update call post", "err", err.Error())
		}

		p.publishWebSocketEvent(wsEventCallEnd, map[string]interface{}{}, &WebSocketBroadcast{
			ChannelID:           channelID,
			ReliableClusterSend: true,
		})
	}
}

// isGuestIdentity returns true if the participant identity has a "guest:" prefix.
func isGuestIdentity(identity string) bool {
	return strings.HasPrefix(identity, "guest:")
}

// isSIPParticipant returns true if the participant is a SIP participant.
func isSIPParticipant(p *livekit.ParticipantInfo) bool {
	return p.GetKind() == livekit.ParticipantInfo_SIP
}

// sessionIDFromIdentity extracts the session ID from a prefixed identity.
// "guest:abc123" -> "abc123", "sip:xyz789" -> "xyz789"
func sessionIDFromIdentity(identity string) string {
	if _, after, ok := strings.Cut(identity, ":"); ok {
		return after
	}
	return ""
}

