// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"time"
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

// How long we wait after telling clients a DM call ended before force-closing any RTC
// sessions still connected, giving them the chance to disconnect on their own first.
var dmCallEndGracePeriod = 5 * time.Second

// forceCloseRTCSessionsAfterGrace runs closeSessions once clients have had the chance to disconnect
// themselves in response to call_end. Tearing the RTC connection down before that makes clients
// report the call as failed rather than ended, and doing it synchronously would run it under the
// call lock, which closeRTCSession can re-enter. Mirrors hostEnd and the DM auto-end path.
func (p *Plugin) forceCloseRTCSessionsAfterGrace(caller string, closeSessions func() error) {
	grace := dmCallEndGracePeriod

	go func() {
		select {
		case <-time.After(grace):
		case <-p.stopCh:
			return
		}

		if err := closeSessions(); err != nil {
			p.LogError(caller+": failed to close RTC sessions", "err", err.Error())
		}
	}()
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

	if state == nil || state.Call.ID != callID || len(state.distinctNonBotUserIDs(p.getBotID())) != 1 {
		p.unlockCall(channelID)
		return
	}

	postID := state.Call.PostID
	participants := mapKeys(state.Call.Props.Participants)

	// Captured before setCallEnded clears the routing info the disconnects need. The actual
	// close runs once clients have been told the call ended, see below.
	closeSessions := p.deferredRTCSessionsCloser(state, channelID)

	setCallEnded(&state.Call)
	if err := p.store.UpdateCall(&state.Call); err != nil {
		p.LogError("handleDMNoAnswer: failed to update call", "channelID", channelID, "err", err.Error())
		p.unlockCall(channelID)
		return
	}
	if err := p.store.DeleteCallsSessions(state.Call.ID); err != nil {
		p.LogError("handleDMNoAnswer: failed to delete call sessions", "channelID", channelID, "err", err.Error())
	}

	p.unlockCall(channelID)

	if _, err := p.updateCallPostEnded(postID, participants, callEndReasonNoAnswer); err != nil {
		p.LogError("handleDMNoAnswer: failed to update call post", "channelID", channelID, "err", err.Error())
	}

	p.publishWebSocketEvent(wsEventCallEnd, map[string]interface{}{}, &WebSocketBroadcast{ChannelID: channelID, ReliableClusterSend: true})

	p.forceCloseRTCSessionsAfterGrace("handleDMNoAnswer", closeSessions)
}
