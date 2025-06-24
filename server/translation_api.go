// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/gorilla/mux"
	"github.com/mattermost/mattermost/server/public/model"
)

type translationActionRequest struct {
	SessionID      string `json:"session_id"`
	TargetLanguage string `json:"target_language,omitempty"`
}

func (p *Plugin) handleTranslationAction(w http.ResponseWriter, r *http.Request) {
	var res httpResponse
	defer p.httpAudit("handleTranslationAction", &res, w, r)

	userID := r.Header.Get("Mattermost-User-Id")
	callID := mux.Vars(r)["call_id"]
	action := mux.Vars(r)["action"]

	if !p.API.HasPermissionToChannel(userID, callID, model.PermissionReadChannel) {
		res.Err = "Forbidden"
		res.Code = http.StatusForbidden
		return
	}

	if !p.licenseChecker.RecordingsAllowed() {
		res.Err = "Recordings are not allowed by your license"
		res.Code = http.StatusForbidden
		return
	}

	if cfg := p.getConfiguration(); !cfg.recordingsEnabled() {
		res.Err = "Recordings are not enabled"
		res.Code = http.StatusForbidden
		return
	}

	if p.getJobService() == nil {
		res.Err = "Job service is not initialized"
		res.Code = http.StatusForbidden
		return
	}

	state, err := p.lockCallReturnState(callID)
	if err != nil {
		res.Err = fmt.Errorf("failed to lock call: %w", err).Error()
		res.Code = http.StatusInternalServerError
		return
	}
	defer p.unlockCall(callID)

	if state == nil {
		res.Err = "no call ongoing"
		res.Code = http.StatusForbidden
		return
	}

	if state.Call.GetHostID() != userID {
		res.Err = "no permissions to translate"
		res.Code = http.StatusForbidden
		return
	}

	if state.Transcription == nil || state.Transcription.EndAt != 0 {
		res.Err = "no transcription ongoing"
		res.Code = http.StatusForbidden
		return
	}

	if state.Transcription.Props.BotConnID == "" {
		res.Err = "no bot connection ID"
		res.Code = http.StatusForbidden
		return
	}

	var req translationActionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		res.Err = fmt.Sprintf("failed to decode request body: %v", err)
		res.Code = http.StatusBadRequest
		return
	}

	if req.SessionID == "" {
		res.Err = "session_id is required"
		res.Code = http.StatusBadRequest
		return
	}

	switch action {
	case "start":
		if req.TargetLanguage == "" {
			res.Err = "target_language is required for start action"
			res.Code = http.StatusBadRequest
			return
		}

		p.publishWebSocketEvent(wsEventStartLiveTranslation, map[string]interface{}{
			"channel_id":        callID,
			"session_id":        state.Transcription.Props.BotConnID,
			"target_session_id": req.SessionID,
			"target_language":   req.TargetLanguage,
		}, &WebSocketBroadcast{
			ReliableClusterSend: true,
			UserID:              p.getBotID(),
		})

		if state.Call.Props.LiveTranslations == nil {
			state.Call.Props.LiveTranslations = map[string]string{}
		}
		state.Call.Props.LiveTranslations[req.SessionID] = req.TargetLanguage

		if err := p.store.UpdateCall(&state.Call); err != nil {
			res.Err = fmt.Sprintf("failed to update call: %v", err)
			res.Code = http.StatusInternalServerError
			return
		}

		p.publishWebSocketEvent(wsEventStartLiveTranslation, map[string]interface{}{
			"target_session_id": req.SessionID,
			"target_language":   req.TargetLanguage,
		}, &WebSocketBroadcast{ReliableClusterSend: true, UserIDs: getUserIDsFromSessions(state.sessions)})
	case "stop":
		p.publishWebSocketEvent(wsEventStopLiveTranslation, map[string]interface{}{
			"channel_id":        callID,
			"session_id":        state.Transcription.Props.BotConnID,
			"target_session_id": req.SessionID,
		}, &WebSocketBroadcast{
			ReliableClusterSend: true,
			UserID:              p.getBotID(),
		})

		delete(state.Call.Props.LiveTranslations, req.SessionID)
		if err := p.store.UpdateCall(&state.Call); err != nil {
			res.Err = fmt.Sprintf("failed to update call: %v", err)
			res.Code = http.StatusInternalServerError
			return
		}

		p.publishWebSocketEvent(wsEventStopLiveTranslation, map[string]interface{}{
			"target_session_id": req.SessionID,
		}, &WebSocketBroadcast{ReliableClusterSend: true, UserIDs: getUserIDsFromSessions(state.sessions)})
	default:
		res.Err = "unsupported recording action"
		res.Code = http.StatusBadRequest
		return
	}

	res.Code = http.StatusOK
}
