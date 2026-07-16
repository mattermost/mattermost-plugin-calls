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
)

const (
	callStatusCalling          = "calling"
	callStatusEnded            = "ended"
	callStatusNoAnswer         = "no_answer"
	callStatusCanceledByCaller = "canceled_by_caller"
)

const dmNoAnswerTimeout = 30 * time.Second

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

	if state == nil || state.Call.ID != callID || len(state.sessions) != 1 {
		p.unlockCall(channelID)
		return
	}

	postID := state.Call.PostID
	participants := mapKeys(state.Call.Props.Participants)
	nodeID := state.Call.Props.NodeID

	type sessionInfo struct {
		userID, connID string
	}
	sessionInfos := make([]sessionInfo, 0, len(state.sessions))
	for connID, sess := range state.sessions {
		sessionInfos = append(sessionInfos, sessionInfo{sess.UserID, connID})
	}

	setCallEnded(&state.Call)
	if err := p.store.UpdateCall(&state.Call); err != nil {
		p.LogError("handleDMNoAnswer: failed to update call", "channelID", channelID, "err", err.Error())
	}
	if err := p.store.DeleteCallsSessions(state.Call.ID); err != nil {
		p.LogError("handleDMNoAnswer: failed to delete call sessions", "channelID", channelID, "err", err.Error())
	}

	p.unlockCall(channelID)

	if _, err := p.updateCallPostEnded(postID, participants, callEndReasonNoAnswer); err != nil {
		p.LogError("handleDMNoAnswer: failed to update call post", "channelID", channelID, "err", err.Error())
	}

	p.publishWebSocketEvent(wsEventCallEnd, map[string]interface{}{}, &WebSocketBroadcast{ChannelID: channelID, ReliableClusterSend: true})

	for _, si := range sessionInfos {
		if err := p.closeRTCSession(si.userID, si.connID, channelID, nodeID, callID); err != nil {
			p.LogError("handleDMNoAnswer: failed to close RTC session", "err", err.Error())
		}
	}
}
