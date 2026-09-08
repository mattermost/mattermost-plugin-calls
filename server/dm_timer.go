// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"errors"
	"time"

	"github.com/mattermost/mattermost/server/public/model"
)

type callEndReason int

const (
	callEndReasonNormal           callEndReason = iota
	callEndReasonCanceledByCaller callEndReason = iota
	callEndReasonNoAnswer         callEndReason = iota
	callEndReasonDeclined         callEndReason = iota
)

const (
	callStatusCalling          = "calling"
	callStatusEnded            = "ended"
	callStatusNoAnswer         = "no_answer"
	callStatusCanceledByCaller = "canceled_by_caller"
	callStatusDeclined         = "declined"
)

// A var rather than a const so tests can shorten it.
var dmNoAnswerTimeout = 30 * time.Second

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

func (p *Plugin) handleDMNoAnswer(channelID, callID string) {
	p.dmNoAnswerTimersMut.Lock()
	delete(p.dmNoAnswerTimers, channelID)
	p.dmNoAnswerTimersMut.Unlock()

	state, err := p.lockCallReturnState(channelID)
	if err != nil {
		p.LogError("handleDMNoAnswer: failed to lock call", "channelID", channelID, "err", err.Error())
		return
	}
	defer p.unlockCall(channelID)

	// A different call in the same channel, or one the callee has since answered, is not ours to
	// cancel.
	if state == nil || state.Call.ID != callID || len(state.distinctNonBotUserIDs(p.getBotID())) != 1 {
		return
	}

	p.endDMCallRoom("handleDMNoAnswer", channelID)

	p.LogInfo("DM call was not answered, cancelling",
		"callID", state.Call.ID,
		"channelID", channelID,
		"nodeID", p.nodeID)

	// Notify the whole channel so bystander UI (call post, sidebar icon) clears immediately. The
	// caller's own widget teardown is driven by LiveKit.
	p.publishWebSocketEvent(wsEventCallEnd, map[string]interface{}{}, &WebSocketBroadcast{
		ChannelID:           channelID,
		ReliableClusterSend: true,
	})

	if err := p.cleanCallState(&state.Call, "dm_no_answer", callEndReasonNoAnswer); err != nil {
		p.LogError("handleDMNoAnswer: failed to clean call state", "channelID", channelID, "err", err.Error())
	}
}
