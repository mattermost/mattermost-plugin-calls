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

// sipNoAnswerTimeout is the deadline for both the human caller to connect to
// the LiveKit room and the SIP callee to answer. If either side hasn't
// connected when the timer fires, the outbound call is hung up.
var sipNoAnswerTimeout = 60 * time.Second

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

	if _, ok := p.sipNoAnswerTimers[channelID]; ok {
		return
	}

	p.sipNoAnswerTimers[channelID] = time.AfterFunc(sipNoAnswerTimeout, func() {
		p.handleSIPNoAnswerTimer(channelID, callID)
	})
}

func (p *Plugin) cancelSIPNoAnswerTimer(channelID string) bool {
	p.sipNoAnswerTimersMut.Lock()
	defer p.sipNoAnswerTimersMut.Unlock()

	t, ok := p.sipNoAnswerTimers[channelID]
	if !ok {
		return false
	}

	t.Stop()
	delete(p.sipNoAnswerTimers, channelID)

	return true
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

// sipCalleeIsActive reports whether the outbound SIP callee has answered.
func (p *Plugin) sipCalleeIsActive(channelID string) bool {
	status, _, err := p.sipCalleeCallStatus(channelID)
	if err != nil {
		p.LogError("sipCalleeIsActive: failed to list participants", "channelID", channelID, "err", err.Error())
		return false
	}
	return status == sipCallStatusActive
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

func (p *Plugin) handleSIPNoAnswerTimer(channelID, callID string) {
	p.sipNoAnswerTimersMut.Lock()
	delete(p.sipNoAnswerTimers, channelID)
	p.sipNoAnswerTimersMut.Unlock()

	// The SIP bridge participant joins the room immediately when dialing starts,
	// before the callee answers. Check the live participant attributes to avoid
	// tearing down a call where the callee has already answered.
	if p.sipCalleeIsActive(channelID) {
		p.LogInfo("handleSIPNoAnswerTimer: SIP callee is active, not hanging up",
			"channelID", channelID,
			"callID", callID)
		return
	}

	p.LogInfo("handleSIPNoAnswerTimer: SIP callee did not answer, hanging up",
		"channelID", channelID,
		"callID", callID,
		"nodeID", p.nodeID)

	state, err := p.lockCallReturnState(channelID)
	if err != nil {
		p.LogError("handleSIPNoAnswerTimer: failed to lock call", "channelID", channelID, "err", err.Error())
		return
	}
	unlocked := false
	defer func() {
		if !unlocked {
			p.unlockCall(channelID)
		}
	}()

	if state == nil || state.Call.ID != callID {
		return
	}

	if err := p.cleanCallState(&state.Call, "sip_no_answer", callEndReasonNoAnswer); err != nil {
		p.LogError("handleSIPNoAnswerTimer: failed to clean call state", "channelID", channelID, "err", err.Error())
	}

	unlocked = true
	p.unlockCall(channelID)

	p.endDMCallRoom("handleSIPNoAnswerTimer", channelID)

	p.publishWebSocketEvent(wsEventCallEnd, map[string]interface{}{}, &WebSocketBroadcast{
		ChannelID:           channelID,
		ReliableClusterSend: true,
	})
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
	p.publishWebSocketEvent(wsEventCallEnd, map[string]interface{}{}, &WebSocketBroadcast{
		ChannelID:           channelID,
		ReliableClusterSend: true,
	})
}
