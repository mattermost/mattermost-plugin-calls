// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"time"

	"github.com/mattermost/mattermost-plugin-calls/server/public"

	"github.com/livekit/protocol/livekit"
)

// LiveKit participant lifecycle, driven by webhooks rather than the Calls
// WebSocket. See MM-69502.
//
// Two identifiers matter here and must not be confused:
//
//   - the identity is minted by us into the JWT (userID___sessionID) and is
//     stable across reconnects, so it is what we look a session row up by;
//   - the SID is assigned by LiveKit per connection and changes on every full
//     reconnect, so it acts as a generation stamp on the row.
//
// Webhooks are at-least-once and unordered, which is why participant_left only
// deletes a row when the SID still matches — see handleLiveKitParticipantLeft.

// handleLiveKitParticipantJoined confirms a human participant's session once
// LiveKit reports it connected. This is the point at which a session minted by
// the token endpoint becomes a real, announced participant.
func (p *Plugin) handleLiveKitParticipantJoined(event *livekit.WebhookEvent) {
	participant := event.GetParticipant()
	if participant == nil || participant.Kind == livekit.ParticipantInfo_SIP {
		return
	}

	channelID := event.GetRoom().GetName()
	if channelID == "" {
		p.LogError("handleLiveKitParticipantJoined: empty room name")
		return
	}

	sid := participant.Sid
	userID, sessionID, ok := parseLivekitIdentity(participant.Identity)
	if !ok {
		p.LogError("handleLiveKitParticipantJoined: unparseable identity",
			"channelID", channelID, "identity", participant.Identity)
		return
	}

	if p.isBot(userID) {
		p.LogDebug("handleLiveKitParticipantJoined: ignoring bot participant",
			"channelID", channelID, "sessionID", sessionID)
		return
	}

	state, err := p.lockCallReturnState(channelID)
	if err != nil {
		p.LogError("handleLiveKitParticipantJoined: failed to lock call", "channelID", channelID, "err", err.Error())
		return
	}
	defer p.unlockCall(channelID)

	if state == nil || state.Call.EndAt > 0 {
		p.LogDebug("handleLiveKitParticipantJoined: no active call",
			"channelID", channelID, "sessionID", sessionID)
		return
	}

	now := time.Now().UnixMilli()
	session := state.sessions[sessionID]

	switch {
	case session != nil && session.ConfirmedAt > 0 && session.SID == sid:
		// Duplicate delivery of an event we already applied.
		p.LogDebug("handleLiveKitParticipantJoined: already confirmed",
			"channelID", channelID, "sessionID", sessionID, "sid", sid)
		return

	case session != nil && session.ConfirmedAt > 0:
		// Full reconnect: same identity, new SID. Rebind the row to the new
		// incarnation so the stale participant_left cannot delete it, and do not
		// re-announce — as far as the channel is concerned nobody joined.
		p.LogDebug("handleLiveKitParticipantJoined: reconnect, rebinding SID",
			"channelID", channelID, "sessionID", sessionID, "oldSID", session.SID, "newSID", sid)

		if err := p.store.UpdateCallSessionSID(sessionID, sid); err != nil {
			p.LogError("handleLiveKitParticipantJoined: failed to update session SID",
				"channelID", channelID, "sessionID", sessionID, "err", err.Error())
			return
		}
		session.SID = sid
		return

	case session != nil:
		// Pending row created by the token endpoint: confirm it.
		if err := p.store.ConfirmCallSession(sessionID, sid, now); err != nil {
			p.LogError("handleLiveKitParticipantJoined: failed to confirm session",
				"channelID", channelID, "sessionID", sessionID, "err", err.Error())
			return
		}
		session.SID = sid
		session.ConfirmedAt = now

	default:
		// No row at all. Either the token endpoint's row was reaped, or the token
		// was minted against a call that has since been recreated. Create the row
		// so LiveKit stays the source of truth for who is in the room.
		p.LogDebug("handleLiveKitParticipantJoined: no session row, creating",
			"channelID", channelID, "sessionID", sessionID)

		session = &public.CallSession{
			ID:          sessionID,
			CallID:      state.Call.ID,
			UserID:      userID,
			JoinAt:      now,
			ConfirmedAt: now,
			SID:         sid,
		}
		if err := p.store.CreateCallSession(session); err != nil {
			p.LogError("handleLiveKitParticipantJoined: failed to create session",
				"channelID", channelID, "sessionID", sessionID, "err", err.Error())
			return
		}
		state.sessions[sessionID] = session
	}

	if state.Call.Props.Participants == nil {
		state.Call.Props.Participants = map[string]struct{}{}
	}
	state.Call.Props.Participants[userID] = struct{}{}

	if newHostID := state.getHostID(p.getBotID()); newHostID != state.Call.GetHostID() {
		state.Call.Props.Hosts = []string{newHostID}
		p.publishWebSocketEvent(wsEventCallHostChanged, map[string]interface{}{
			"hostID":  newHostID,
			"call_id": state.Call.ID,
		}, &WebSocketBroadcast{ChannelID: channelID, ReliableClusterSend: true})
	}

	if err := p.store.UpdateCall(&state.Call); err != nil {
		p.LogError("handleLiveKitParticipantJoined: failed to update call",
			"channelID", channelID, "err", err.Error())
	}

	p.LogInfo("call session confirmed",
		"callID", state.Call.ID,
		"channelID", channelID,
		"sessionID", sessionID,
		"userID", userID,
		"sid", sid,
		"nodeID", p.nodeID,
		"sessionCount", len(state.sessions))

	p.publishWebSocketEvent(wsEventUserJoined, map[string]interface{}{
		"user_id":    userID,
		"session_id": sessionID,
	}, &WebSocketBroadcast{ChannelID: channelID, ReliableClusterSend: true})
}

// handleLiveKitParticipantLeft removes a human participant's session when
// LiveKit reports it disconnected.
//
// The SID guard is the load-bearing part. A full reconnect reuses the identity
// but gets a new SID, so LiveKit emits participant_left(old) and
// participant_joined(new) — unordered. If joined(new) lands first it rebinds the
// row's SID, and the later left(old) must then be recognised as stale and
// ignored, or it deletes a session the client is actively using. That is the
// webhook-side form of the MM-69509 orphan.
func (p *Plugin) handleLiveKitParticipantLeft(event *livekit.WebhookEvent) {
	participant := event.GetParticipant()
	if participant == nil || participant.Kind == livekit.ParticipantInfo_SIP {
		return
	}

	channelID := event.GetRoom().GetName()
	if channelID == "" {
		p.LogError("handleLiveKitParticipantLeft: empty room name")
		return
	}

	sid := participant.Sid
	userID, sessionID, ok := parseLivekitIdentity(participant.Identity)
	if !ok {
		p.LogError("handleLiveKitParticipantLeft: unparseable identity",
			"channelID", channelID, "identity", participant.Identity)
		return
	}

	if p.isBot(userID) {
		p.LogDebug("handleLiveKitParticipantLeft: ignoring bot participant",
			"channelID", channelID, "sessionID", sessionID)
		return
	}

	state, err := p.lockCallReturnState(channelID)
	if err != nil {
		p.LogError("handleLiveKitParticipantLeft: failed to lock call", "channelID", channelID, "err", err.Error())
		return
	}
	defer p.unlockCall(channelID)

	if state == nil {
		p.LogDebug("handleLiveKitParticipantLeft: no active call",
			"channelID", channelID, "sessionID", sessionID)
		return
	}

	session := state.sessions[sessionID]
	if session == nil {
		p.LogDebug("handleLiveKitParticipantLeft: session not found (idempotent)",
			"channelID", channelID, "sessionID", sessionID)
		return
	}

	if session.SID != sid {
		p.LogDebug("handleLiveKitParticipantLeft: stale leave for superseded connection, ignoring",
			"channelID", channelID, "sessionID", sessionID, "eventSID", sid, "currentSID", session.SID)
		return
	}

	if err := p.store.DeleteCallSession(sessionID); err != nil {
		p.LogError("handleLiveKitParticipantLeft: failed to delete session",
			"channelID", channelID, "sessionID", sessionID, "err", err.Error())
		return
	}
	delete(state.sessions, sessionID)

	// A session that never confirmed was never announced, so there is nothing to
	// retract and nobody expecting a user_left for it.
	announced := session.ConfirmedAt > 0

	if state.Call.Props.ScreenSharingSessionID == sessionID {
		p.clearScreenSharingState(state, channelID, sessionID, userID)
	}

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
			}, &WebSocketBroadcast{ChannelID: channelID, ReliableClusterSend: true})
		}
	}

	p.LogInfo("call session left",
		"callID", state.Call.ID,
		"channelID", channelID,
		"sessionID", sessionID,
		"userID", userID,
		"nodeID", p.nodeID,
		"sessionCount", len(state.sessions))

	if announced {
		p.publishWebSocketEvent(wsEventUserLeft, map[string]interface{}{
			"user_id":    userID,
			"session_id": sessionID,
		}, &WebSocketBroadcast{ChannelID: channelID, ReliableClusterSend: true})
	}

	if len(state.sessions) == 0 {
		p.endEmptyCall(state, channelID, "last_left")
		return
	}

	if err := p.store.UpdateCall(&state.Call); err != nil {
		p.LogError("handleLiveKitParticipantLeft: failed to update call",
			"channelID", channelID, "err", err.Error())
	}
}

// handleLiveKitRoomFinished ends the call when LiveKit reports the room gone.
// This is the backstop for participant_left events we never received: the room
// cannot outlive its participants, so a finished room means the call is over.
func (p *Plugin) handleLiveKitRoomFinished(event *livekit.WebhookEvent) {
	channelID := event.GetRoom().GetName()
	if channelID == "" {
		p.LogError("handleLiveKitRoomFinished: empty room name")
		return
	}

	state, err := p.lockCallReturnState(channelID)
	if err != nil {
		p.LogError("handleLiveKitRoomFinished: failed to lock call", "channelID", channelID, "err", err.Error())
		return
	}
	defer p.unlockCall(channelID)

	if state == nil || state.Call.EndAt > 0 {
		p.LogDebug("handleLiveKitRoomFinished: no active call", "channelID", channelID)
		return
	}

	p.LogInfo("handleLiveKitRoomFinished: ending call for finished room",
		"callID", state.Call.ID, "channelID", channelID, "sessionCount", len(state.sessions))

	if _, err := p.store.DeleteCallsSessions(state.Call.ID); err != nil {
		p.LogError("handleLiveKitRoomFinished: failed to delete calls sessions",
			"channelID", channelID, "err", err.Error())
	}
	state.sessions = map[string]*public.CallSession{}

	p.endEmptyCall(state, channelID, "room_finished")
}

// endEmptyCall ends a call whose last session has gone, mirroring the WebSocket
// leave path so the call post, stats and channel-wide event stay consistent.
// Caller must hold the call lock.
func (p *Plugin) endEmptyCall(state *callState, channelID, reason string) {
	if state.Call.Props.ScreenStartAt > 0 {
		state.Call.Stats.ScreenDuration += secondsSinceTimestamp(state.Call.Props.ScreenStartAt)
	}
	setCallEnded(&state.Call)

	p.LogInfo("call ended",
		"callID", state.Call.ID,
		"channelID", channelID,
		"nodeID", p.nodeID,
		"reason", reason,
		"sessionCount", 0)

	p.publishWebSocketEvent(wsEventCallEnd, map[string]interface{}{}, &WebSocketBroadcast{
		ChannelID:           channelID,
		ReliableClusterSend: true,
	})

	if err := p.store.UpdateCall(&state.Call); err != nil {
		p.LogError("endEmptyCall: failed to update call", "channelID", channelID, "err", err.Error())
	}

	if _, err := p.updateCallPostEnded(state.Call.PostID, mapKeys(state.Call.Props.Participants)); err != nil {
		p.LogError("endEmptyCall: failed to update call post", "channelID", channelID, "err", err.Error())
	}
}

// Screen sharing, driven by LiveKit track events rather than a WebSocket
// message. The published screen track *is* the state, so there is no new
// message or participant attribute — the server only mirrors it into
// Call.Props for observers, who are not in the LiveKit room and cannot see
// tracks themselves.
//
// Video is deliberately not handled here: MM-69116 is removing the server-side
// video state that a handler would write, so mirroring camera tracks now would
// build something being deleted.

// handleLiveKitTrackPublished records a participant's screen share.
func (p *Plugin) handleLiveKitTrackPublished(event *livekit.WebhookEvent) {
	channelID, sessionID, userID, ok := p.screenShareTrackEvent(event, "handleLiveKitTrackPublished")
	if !ok {
		return
	}

	state, err := p.lockCallReturnState(channelID)
	if err != nil {
		p.LogError("handleLiveKitTrackPublished: failed to lock call", "channelID", channelID, "err", err.Error())
		return
	}
	defer p.unlockCall(channelID)

	if state == nil || state.Call.EndAt > 0 {
		return
	}

	if state.Call.Props.ScreenSharingSessionID == sessionID {
		return
	}

	// The client refuses to start a second share by checking LiveKit track state
	// directly, so a conflict here means that check was bypassed or raced. Record
	// the newcomer rather than dropping the event: LiveKit already accepted the
	// track, so the prop would otherwise name a sharer nobody can see.
	if state.Call.Props.ScreenSharingSessionID != "" {
		p.LogWarn("handleLiveKitTrackPublished: replacing existing screen sharer",
			"channelID", channelID, "previous", state.Call.Props.ScreenSharingSessionID, "current", sessionID)
		if state.Call.Props.ScreenStartAt > 0 {
			state.Call.Stats.ScreenDuration += secondsSinceTimestamp(state.Call.Props.ScreenStartAt)
		}
	}

	state.Call.Props.ScreenSharingSessionID = sessionID
	state.Call.Props.ScreenStartAt = time.Now().UnixMilli()

	if err := p.store.UpdateCall(&state.Call); err != nil {
		p.LogError("handleLiveKitTrackPublished: failed to update call", "channelID", channelID, "err", err.Error())
		return
	}

	p.publishWebSocketEvent(wsEventUserScreenOn, map[string]interface{}{
		"userID":     userID,
		"session_id": sessionID,
	}, &WebSocketBroadcast{ChannelID: channelID, ReliableClusterSend: true})
}

// handleLiveKitTrackUnpublished clears a participant's screen share.
func (p *Plugin) handleLiveKitTrackUnpublished(event *livekit.WebhookEvent) {
	channelID, sessionID, userID, ok := p.screenShareTrackEvent(event, "handleLiveKitTrackUnpublished")
	if !ok {
		return
	}

	state, err := p.lockCallReturnState(channelID)
	if err != nil {
		p.LogError("handleLiveKitTrackUnpublished: failed to lock call", "channelID", channelID, "err", err.Error())
		return
	}
	defer p.unlockCall(channelID)

	if state == nil || state.Call.EndAt > 0 {
		return
	}

	// Ignore an unpublish for a sharer that has already been superseded; track
	// events are unordered, so a late one must not clear the current sharer.
	if state.Call.Props.ScreenSharingSessionID != sessionID {
		p.LogDebug("handleLiveKitTrackUnpublished: not the current sharer, ignoring",
			"channelID", channelID, "sessionID", sessionID, "current", state.Call.Props.ScreenSharingSessionID)
		return
	}

	p.clearScreenSharingState(state, channelID, sessionID, userID)

	if err := p.store.UpdateCall(&state.Call); err != nil {
		p.LogError("handleLiveKitTrackUnpublished: failed to update call", "channelID", channelID, "err", err.Error())
	}
}

// clearScreenSharingState clears the sharing prop, banks the screen-share
// duration and tells observers. Caller must hold the call lock and is
// responsible for persisting the call.
func (p *Plugin) clearScreenSharingState(state *callState, channelID, sessionID, userID string) {
	if state.Call.Props.ScreenStartAt > 0 {
		state.Call.Stats.ScreenDuration += secondsSinceTimestamp(state.Call.Props.ScreenStartAt)
	}
	state.Call.Props.ScreenSharingSessionID = ""
	state.Call.Props.ScreenStartAt = 0

	p.publishWebSocketEvent(wsEventUserScreenOff, map[string]interface{}{
		"userID":     userID,
		"session_id": sessionID,
	}, &WebSocketBroadcast{ChannelID: channelID, ReliableClusterSend: true})
}

// screenShareTrackEvent filters a track event down to screen shares published by
// a human participant, returning the call and session it belongs to.
func (p *Plugin) screenShareTrackEvent(event *livekit.WebhookEvent, logPrefix string) (channelID, sessionID, userID string, ok bool) {
	track := event.GetTrack()
	if track == nil {
		return "", "", "", false
	}

	// Camera and microphone tracks fire the same events; only screen shares carry
	// state the server needs to mirror. ScreenShareAudio is ignored: it always
	// accompanies the video track, which is what we key the prop on.
	if track.Source != livekit.TrackSource_SCREEN_SHARE {
		return "", "", "", false
	}

	participant := event.GetParticipant()
	if participant == nil || participant.Kind == livekit.ParticipantInfo_SIP {
		return "", "", "", false
	}

	channelID = event.GetRoom().GetName()
	if channelID == "" {
		p.LogError(logPrefix + ": empty room name")
		return "", "", "", false
	}

	userID, sessionID, parsed := parseLivekitIdentity(participant.Identity)
	if !parsed {
		p.LogError(logPrefix+": unparseable identity", "channelID", channelID, "identity", participant.Identity)
		return "", "", "", false
	}

	if p.isBot(userID) {
		return "", "", "", false
	}

	return channelID, sessionID, userID, true
}
