package main

import (
	"encoding/json"
	"net/http"

	"github.com/gorilla/mux"
)

func (p *Plugin) handleMakeHost(w http.ResponseWriter, r *http.Request) {
	var res httpResponse
	defer p.httpAudit("handleMakeHost", &res, w, r)

	userID := r.Header.Get("Mattermost-User-Id")
	callID := mux.Vars(r)["call_id"]

	var payload struct {
		NewHostID string `json:"new_host_id"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, requestBodyMaxSizeBytes)).Decode(&payload); err != nil {
		res.Err = err.Error()
		res.Code = http.StatusBadRequest
		return
	}

	if err := p.changeHost(userID, callID, payload.NewHostID); err != nil {
		p.LogError("handleMakeHost: failed to changeHost", "err", err.Error())
		res.Code = http.StatusInternalServerError
		res.Err = err.Error()
		return
	}

	res.Code = http.StatusOK
	res.Msg = "success"
}

func (p *Plugin) handleMuteSession(w http.ResponseWriter, r *http.Request) {
	var res httpResponse
	defer p.httpAudit("handleMuteSession", &res, w, r)

	userID := r.Header.Get("Mattermost-User-Id")
	callID := mux.Vars(r)["call_id"]

	var payload struct {
		SessionID string `json:"session_id"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, requestBodyMaxSizeBytes)).Decode(&payload); err != nil {
		res.Err = err.Error()
		res.Code = http.StatusBadRequest
		return
	}

	if err := p.muteSession(userID, callID, payload.SessionID); err != nil {
		p.LogError("handleMuteSession: failed to mute", "err", err.Error())
		res.Code = http.StatusInternalServerError
		res.Err = err.Error()
		return
	}

	res.Code = http.StatusOK
	res.Msg = "success"
}

func (p *Plugin) handleScreenOff(w http.ResponseWriter, r *http.Request) {
	var res httpResponse
	defer p.httpAudit("handleScreenOff", &res, w, r)

	userID := r.Header.Get("Mattermost-User-Id")
	callID := mux.Vars(r)["call_id"]

	var payload struct {
		SessionID string `json:"session_id"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, requestBodyMaxSizeBytes)).Decode(&payload); err != nil {
		res.Err = err.Error()
		res.Code = http.StatusBadRequest
		return
	}

	if err := p.screenOff(userID, callID, payload.SessionID); err != nil {
		p.LogError("handleScreenOff: failed", "err", err.Error())
		res.Code = http.StatusInternalServerError
		res.Err = err.Error()
		return
	}

	res.Code = http.StatusOK
	res.Msg = "success"
}

func (p *Plugin) handleLowerHand(w http.ResponseWriter, r *http.Request) {
	var res httpResponse
	defer p.httpAudit("handleLowerHand", &res, w, r)

	userID := r.Header.Get("Mattermost-User-Id")
	callID := mux.Vars(r)["call_id"]

	var payload struct {
		SessionID string `json:"session_id"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, requestBodyMaxSizeBytes)).Decode(&payload); err != nil {
		res.Err = err.Error()
		res.Code = http.StatusBadRequest
		return
	}

	if err := p.lowerHand(userID, callID, payload.SessionID); err != nil {
		p.LogError("handleLowerHand: failed", "err", err.Error())
		res.Code = http.StatusInternalServerError
		res.Err = err.Error()
		return
	}

	res.Code = http.StatusOK
	res.Msg = "success"
}

func (p *Plugin) handleRemoveSession(w http.ResponseWriter, r *http.Request) {
	var res httpResponse
	defer p.httpAudit("handleRemoveSession", &res, w, r)

	userID := r.Header.Get("Mattermost-User-Id")
	callID := mux.Vars(r)["call_id"]

	var payload struct {
		SessionID string `json:"session_id"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, requestBodyMaxSizeBytes)).Decode(&payload); err != nil {
		res.Err = err.Error()
		res.Code = http.StatusBadRequest
		return
	}

	if err := p.hostRemoveSession(userID, callID, payload.SessionID); err != nil {
		p.LogError("handleRemoveSession: failed to remove", "err", err.Error())
		res.Code = http.StatusInternalServerError
		res.Err = err.Error()
		return
	}

	res.Code = http.StatusOK
	res.Msg = "success"
}
