// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"fmt"
	"net/http"
	"time"

	"github.com/mattermost/mattermost-plugin-calls/server/db"
	"github.com/mattermost/mattermost/server/public/model"

	"github.com/gorilla/mux"
)

func (p *Plugin) getBotID() string {
	if p.botSession != nil {
		return p.botSession.UserId
	}
	return ""
}

func (p *Plugin) isBot(userID string) bool {
	if userID != "" && userID == p.getBotID() {
		return true
	}
	return false
}

func (p *Plugin) isBotSession(r *http.Request) bool {
	return p.isBot(r.Header.Get("Mattermost-User-Id"))
}

func (p *Plugin) handleEnd(w http.ResponseWriter, r *http.Request) {
	var res httpResponse
	defer p.httpAudit("handleEnd", &res, w, r)

	userID := r.Header.Get("Mattermost-User-Id")
	callID := mux.Vars(r)["call_id"]

	state, err := p.lockCallReturnState(callID)
	if err != nil {
		res.Err = fmt.Errorf("failed to lock call: %w", err).Error()
		res.Code = http.StatusInternalServerError
		return
	}
	defer p.unlockCall(callID)

	if state == nil {
		res.Err = "no call ongoing"
		res.Code = http.StatusBadRequest
		return
	}

	if userID != state.Call.GetHostID() {
		if isAdmin := p.API.HasPermissionTo(userID, model.PermissionManageSystem); !isAdmin {
			res.Err = "no permission to end call"
			res.Code = http.StatusForbidden
			return
		}
	}

	// Ask clients to disconnect themselves.
	p.publishWebSocketEvent(wsEventCallEnd, map[string]interface{}{}, &WebSocketBroadcast{ChannelID: callID, ReliableClusterSend: true})

	go p.deleteSIPDispatchRule(callID)

	callIDValue := state.Call.ID

	go func() {
		// Wait for the call to end cleanly. If it doesn't, force end it.
		time.Sleep(5 * time.Second)

		sessions, err := p.store.GetCallSessions(callIDValue, db.GetCallSessionOpts{})
		if err != nil {
			p.LogError("failed to get call sessions", "err", err.Error())
			return
		}

		if len(sessions) > 0 {
			p.LogDebug("force ending call", "callID", callIDValue, "remaining sessions", len(sessions))
			// Force remove remaining sessions
			for connID, session := range sessions {
				p.mut.RLock()
				us := p.sessions[connID]
				p.mut.RUnlock()
				if us != nil {
					if err := p.removeSession(us); err != nil {
						p.LogError("failed to remove session", "err", err.Error(), "userID", session.UserID)
					}
				}
			}
		}
	}()

	res.Code = http.StatusOK
	res.Msg = "success"
}
