// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"

	"github.com/gorilla/mux"
	"github.com/mattermost/mattermost/server/public/model"
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
		p.handleHostControlsError(err, &res, "handleMakeHost")
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

	if err := p.hostMuteParticipant(userID, callID, payload.SessionID); err != nil {
		p.handleHostControlsError(err, &res, "handleMuteSession")
		return
	}

	res.Code = http.StatusOK
	res.Msg = "success"
}

func (p *Plugin) handleMuteOthers(w http.ResponseWriter, r *http.Request) {
	var res httpResponse
	defer p.httpAudit("handleMuteOthers", &res, w, r)

	userID := r.Header.Get("Mattermost-User-Id")
	callID := mux.Vars(r)["call_id"]

	if err := p.hostMuteAllParticipants(userID, callID); err != nil {
		p.handleHostControlsError(err, &res, "handleMuteOthers")
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

	if err := p.hostSwitchOffParticipantScreen(userID, callID, payload.SessionID); err != nil {
		p.handleHostControlsError(err, &res, "handleScreenOff")
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

	if err := p.hostLowerParticipantHand(userID, callID, payload.SessionID); err != nil {
		p.handleHostControlsError(err, &res, "handleLowerHand")
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

	if err := p.hostRemoveParticipant(userID, callID, payload.SessionID); err != nil {
		p.handleHostControlsError(err, &res, "handleRemoveSession")
		return
	}

	res.Code = http.StatusOK
	res.Msg = "success"
}

func (p *Plugin) handleEnd(w http.ResponseWriter, r *http.Request) {
	var res httpResponse
	defer p.httpAudit("handleEnd", &res, w, r)

	userID := r.Header.Get("Mattermost-User-Id")
	// Despite the route variable's name, this is the channel ID.
	channelID := mux.Vars(r)["call_id"]

	// The body is optional: call_id restricts the request to that call.
	var payload struct {
		CallID string `json:"call_id"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, requestBodyMaxSizeBytes)).Decode(&payload); err != nil && !errors.Is(err, io.EOF) {
		res.Err = err.Error()
		res.Code = http.StatusBadRequest
		return
	}
	if payload.CallID != "" && !model.IsValidId(payload.CallID) {
		res.Err = "invalid call_id"
		res.Code = http.StatusBadRequest
		return
	}

	if err := p.hostEnd(userID, channelID, payload.CallID); err != nil {
		p.handleHostControlsError(err, &res, "handleEnd")
		return
	}

	res.Code = http.StatusOK
	res.Msg = "success"
}

func (p *Plugin) handleHostControlsError(err error, res *httpResponse, handlerName string) {
	p.LogError(handlerName, "err", err.Error())

	res.Code = http.StatusInternalServerError
	if errors.Is(err, ErrNoCallOngoing) ||
		errors.Is(err, ErrNoPermissions) ||
		errors.Is(err, ErrNotInCall) ||
		errors.Is(err, ErrNotAllowed) ||
		errors.Is(err, ErrCallMismatch) {
		res.Code = http.StatusBadRequest
	}

	res.Err = err.Error()
}
