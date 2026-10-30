// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"errors"
	"time"

	"github.com/mattermost/mattermost-plugin-calls/server/public"

	livekit "github.com/livekit/protocol/livekit"
	"github.com/mattermost/mattermost/server/public/model"
)

type callEndReason int

const (
	callEndReasonNormal           callEndReason = iota
	callEndReasonCanceledByCaller callEndReason = iota
	callEndReasonNoAnswer         callEndReason = iota
	callEndReasonDeclined         callEndReason = iota
	callEndReasonFailed           callEndReason = iota
)

const (
	callStatusCalling          = "calling"
	callStatusEnded            = "ended"
	callStatusNoAnswer         = "no_answer"
	callStatusCanceledByCaller = "canceled_by_caller"
	callStatusDeclined         = "declined"
	callStatusFailed           = "failed"
)

func (r callEndReason) status() string {
	switch r {
	case callEndReasonNoAnswer:
		return callStatusNoAnswer
	case callEndReasonCanceledByCaller:
		return callStatusCanceledByCaller
	case callEndReasonDeclined:
		return callStatusDeclined
	case callEndReasonFailed:
		return callStatusFailed
	default:
		return callStatusEnded
	}
}

// A var rather than a const so tests can shorten it.
var dmNoAnswerTimeout = 30 * time.Second

// sipNoAnswerTimeout is how long an outbound phone call has for the callee to
// answer and the caller's client to connect. When it fires, the call is hung
// up unless both have happened.
var sipNoAnswerTimeout = 60 * time.Second

// sipNoAnswerRetryInterval is how soon the no-answer check runs again after it
// failed to read the call.
var sipNoAnswerRetryInterval = 10 * time.Second

// sipNoAnswerTimer is kept by pointer so a callback that has already fired can
// tell whether the map entry is still its own.
type sipNoAnswerTimer struct {
	callID string
	timer  *time.Timer
}

// endDMCallRoom destroys the LiveKit room backing a DM call. That forcibly disconnects every
// connected participant, and each client's LiveKit SDK fires RoomEvent.Disconnected
// (reason=ROOM_DELETED), driving in-call UI teardown independently of plugin-WebSocket delivery.
// Mirrors hostEnd; a call ended this way needs no grace period before tearing the transport down,
// because the SDK reports it as an ended call rather than a failed connection.
func (p *Plugin) endDMCallRoom(caller, channelID string) {
	if err := p.livekitDeleteRoom(channelID); err != nil && !errors.Is(err, errLiveKitNotConfigured) {
		p.LogError(caller+": failed to delete LiveKit room", "channelID", channelID, "err", err.Error())
	}
}

// isDMCallChannel reports whether the channel is a DM that the DM call lifecycle applies to.
// Outbound phone calls live in bot DMs, which are ChannelTypeDirect too, but they have their own
// lifecycle (SIP dialing, participant_left webhooks) and must not be caught by the no-answer timer
// or the auto-end below.
func (p *Plugin) isDMCallChannel(channelType model.ChannelType, channelID string) bool {
	return channelType == model.ChannelTypeDirect && !p.isPhoneCallChannel(channelID)
}

func (p *Plugin) startDMNoAnswerTimer(channelID, callID string) {
	p.dmNoAnswerTimersMut.Lock()
	defer p.dmNoAnswerTimersMut.Unlock()

	if _, ok := p.dmNoAnswerTimers[channelID]; ok {
		return
	}

	p.dmNoAnswerTimers[channelID] = time.AfterFunc(dmNoAnswerTimeout, func() {
		p.handleDMNoAnswer(channelID, callID)
	})
}

func (p *Plugin) cancelDMNoAnswerTimer(channelID string) bool {
	p.dmNoAnswerTimersMut.Lock()
	defer p.dmNoAnswerTimersMut.Unlock()

	t, ok := p.dmNoAnswerTimers[channelID]
	if !ok {
		return false
	}

	t.Stop()
	delete(p.dmNoAnswerTimers, channelID)

	return true
}

func (p *Plugin) startSIPNoAnswerTimer(channelID, callID string) {
	p.sipNoAnswerTimersMut.Lock()
	defer p.sipNoAnswerTimersMut.Unlock()

	if existing, ok := p.sipNoAnswerTimers[channelID]; ok {
		if existing.callID == callID {
			return
		}
		// Left over from an earlier call in this bot DM. Keeping it would leave
		// this call without a deadline.
		existing.timer.Stop()
	}

	entry := &sipNoAnswerTimer{callID: callID}
	entry.timer = time.AfterFunc(sipNoAnswerTimeout, func() {
		p.handleSIPNoAnswerTimer(channelID, entry)
	})
	p.sipNoAnswerTimers[channelID] = entry
}

func (p *Plugin) cancelSIPNoAnswerTimer(channelID string) bool {
	p.sipNoAnswerTimersMut.Lock()
	defer p.sipNoAnswerTimersMut.Unlock()

	entry, ok := p.sipNoAnswerTimers[channelID]
	if !ok {
		return false
	}

	entry.timer.Stop()
	delete(p.sipNoAnswerTimers, channelID)

	return true
}

// clearSIPNoAnswerTimer removes entry unless a newer timer has replaced it.
func (p *Plugin) clearSIPNoAnswerTimer(channelID string, entry *sipNoAnswerTimer) {
	p.sipNoAnswerTimersMut.Lock()
	defer p.sipNoAnswerTimersMut.Unlock()

	if p.sipNoAnswerTimers[channelID] == entry {
		delete(p.sipNoAnswerTimers, channelID)
	}
}

// retrySIPNoAnswerTimer runs the check again later, unless the timer has been
// cancelled or replaced in the meantime.
func (p *Plugin) retrySIPNoAnswerTimer(channelID string, entry *sipNoAnswerTimer) {
	p.sipNoAnswerTimersMut.Lock()
	defer p.sipNoAnswerTimersMut.Unlock()

	if p.sipNoAnswerTimers[channelID] != entry {
		return
	}

	entry.timer = time.AfterFunc(sipNoAnswerRetryInterval, func() {
		p.handleSIPNoAnswerTimer(channelID, entry)
	})
}

// sipCalleeCallStatus queries the LiveKit room for the outbound SIP participant's
// sip.callStatus attribute. found is false when no SIP participant is in the room.
// participant_joined fires when the SIP bridge joins the room, not when the
// callee picks up, so session state alone can't tell whether the call was answered.
func (p *Plugin) sipCalleeCallStatus(channelID string) (status string, found bool, err error) {
	participants, err := p.livekitListParticipants(channelID)
	if err != nil {
		return "", false, err
	}
	for _, participant := range participants {
		if participant.Kind != livekit.ParticipantInfo_SIP {
			continue
		}
		return participant.GetAttributes()[livekit.AttrSIPCallStatus], true, nil
	}
	return "", false, nil
}

// sipCalleeAnswered reports whether any SIP leg in the room has been answered.
func sipCalleeAnswered(participants []*livekit.ParticipantInfo) bool {
	for _, participant := range participants {
		if participant.Kind == livekit.ParticipantInfo_SIP &&
			participant.GetAttributes()[livekit.AttrSIPCallStatus] == sipCallStatusActive {
			return true
		}
	}
	return false
}

// phoneCallerConnected reports whether a Mattermost user is connected to the
// phone call. A confirmed session counts as much as a LiveKit participant, so
// neither a late participant_joined webhook nor a reconnect at the deadline
// hangs up a live call.
func (p *Plugin) phoneCallerConnected(state *callState, participants []*livekit.ParticipantInfo) bool {
	botID := p.getBotID()
	for _, participant := range participants {
		if userID, _, ok := parseLivekitIdentity(participant.Identity); ok && userID != botID {
			return true
		}
	}
	for _, session := range state.sessions {
		if !session.IsSIPParticipant && session.ConfirmedAt > 0 && session.UserID != botID {
			return true
		}
	}
	return false
}

// phoneCallerHangupReason reports what the call post should say when the caller
// hangs up a phone call: canceled if the callee had not answered yet, ended
// otherwise. Non-phone calls and lookup failures fall back to ended.
func (p *Plugin) phoneCallerHangupReason(call *public.Call, channelID string) callEndReason {
	if call.Props.Type != callTypePhone {
		return callEndReasonNormal
	}
	status, found, err := p.sipCalleeCallStatus(channelID)
	if err != nil {
		if !errors.Is(err, errLiveKitNotConfigured) {
			p.LogError("phoneCallerHangupReason: failed to get SIP call status", "channelID", channelID, "err", err.Error())
		}
		return callEndReasonNormal
	}
	if !found || status == sipCallStatusActive {
		return callEndReasonNormal
	}
	return callEndReasonCanceledByCaller
}

// phoneLegEndReason maps why the SIP leg left the room onto what the call post
// should say. Busy (486) and rejected (603) both arrive as USER_REJECTED.
func phoneLegEndReason(reason livekit.DisconnectReason) callEndReason {
	switch reason {
	case livekit.DisconnectReason_USER_REJECTED:
		return callEndReasonDeclined
	case livekit.DisconnectReason_USER_UNAVAILABLE:
		return callEndReasonNoAnswer
	case livekit.DisconnectReason_SIP_TRUNK_FAILURE:
		return callEndReasonFailed
	default:
		return callEndReasonNormal
	}
}

// resolveCallEndReason prefers a reason the phone teardown already worked out
// over the generic last-participant heuristic.
func (p *Plugin) resolveCallEndReason(state *callState, participants []string, channelID string) callEndReason {
	if state.endReasonOverride != nil {
		return *state.endReasonOverride
	}
	return p.callEndReason(participants, channelID)
}

// handleSIPNoAnswerTimer hangs up a phone call that, at the deadline, has no
// answered SIP leg or no connected caller. A call it can't check is left up and
// checked again later.
func (p *Plugin) handleSIPNoAnswerTimer(channelID string, entry *sipNoAnswerTimer) {
	callID := entry.callID

	// LiveKit doesn't webhook sip.callStatus, so listing the room is the only way
	// to tell whether the callee answered. It's a network call, so it runs
	// before the call lock is taken.
	participants, listErr := p.livekitListParticipants(channelID)

	state, err := p.lockCallReturnState(channelID)
	if err != nil {
		p.LogError("handleSIPNoAnswerTimer: failed to lock call, will retry", "channelID", channelID, "err", err.Error())
		p.retrySIPNoAnswerTimer(channelID, entry)
		return
	}
	unlocked := false
	defer func() {
		if !unlocked {
			p.unlockCall(channelID)
		}
	}()

	if state == nil || state.Call.ID != callID {
		p.clearSIPNoAnswerTimer(channelID, entry)
		return
	}

	if listErr != nil {
		p.LogError("handleSIPNoAnswerTimer: failed to list participants, will retry",
			"channelID", channelID, "callID", callID, "err", listErr.Error())
		p.retrySIPNoAnswerTimer(channelID, entry)
		return
	}

	p.clearSIPNoAnswerTimer(channelID, entry)

	var reason string
	var endReason callEndReason
	switch {
	case !sipCalleeAnswered(participants):
		reason, endReason = "sip_no_answer", callEndReasonNoAnswer
	case !p.phoneCallerConnected(state, participants):
		reason, endReason = "sip_caller_not_connected", callEndReasonFailed
	default:
		p.LogInfo("handleSIPNoAnswerTimer: phone call is connected, not hanging up",
			"channelID", channelID, "callID", callID)
		return
	}

	p.LogInfo("handleSIPNoAnswerTimer: hanging up phone call",
		"channelID", channelID,
		"callID", callID,
		"reason", reason,
		"nodeID", p.nodeID)

	if err := p.cleanCallState(&state.Call, reason, endReason); err != nil {
		p.LogError("handleSIPNoAnswerTimer: failed to clean call state", "channelID", channelID, "err", err.Error())
	}

	unlocked = true
	p.unlockCall(channelID)

	p.endDMCallRoom("handleSIPNoAnswerTimer", channelID)

	p.publishCallEnd(channelID, callID, endReason)
}

func (p *Plugin) handleDMNoAnswer(channelID, callID string) {
	p.dmNoAnswerTimersMut.Lock()
	delete(p.dmNoAnswerTimers, channelID)
	p.dmNoAnswerTimersMut.Unlock()

	state, err := p.lockCallReturnState(channelID)
	if err != nil {
		p.LogError("handleDMNoAnswer: failed to lock call", "channelID", channelID, "err", err.Error())
		return
	}
	unlocked := false
	defer func() {
		if !unlocked {
			p.unlockCall(channelID)
		}
	}()

	// A different call in the same channel, or one the callee has since answered, is not ours to
	// cancel.
	if state == nil || state.Call.ID != callID || len(state.distinctNonBotUserIDs(p.getBotID())) != 1 {
		return
	}

	logCallID := state.Call.ID

	if err := p.cleanCallState(&state.Call, "dm_no_answer", callEndReasonNoAnswer); err != nil {
		p.LogError("handleDMNoAnswer: failed to clean call state", "channelID", channelID, "err", err.Error())
	}

	unlocked = true
	p.unlockCall(channelID)

	p.endDMCallRoom("handleDMNoAnswer", channelID)

	p.LogInfo("DM call was not answered, cancelling",
		"callID", logCallID,
		"channelID", channelID,
		"nodeID", p.nodeID)

	// Notify the whole channel so bystander UI (call post, sidebar icon) clears immediately. The
	// caller's own widget teardown is driven by LiveKit.
	p.publishCallEnd(channelID, callID, callEndReasonNoAnswer)
}
