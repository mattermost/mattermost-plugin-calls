// Copyright (c) 2022-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"time"

	"github.com/mattermost/calls-offloader/public/job"

	"github.com/mattermost/mattermost/server/public/model"
)

var callTranscriptionActionRE = regexp.MustCompile(`^\/calls\/([a-z0-9]+)/transcription/(start|stop|publish)$`)

const transcriptionJobStartTimeout = 30 * time.Second

func (p *Plugin) transcriptionJobTimeoutChecker(callID, jobID string) {
	time.Sleep(transcriptionJobStartTimeout)

	state, err := p.lockCall(callID)
	if err != nil {
		p.LogError("failed to lock call", "err", err.Error())
		return
	}
	defer p.unlockCall(callID)

	trState, err := state.getTranscription()
	if err != nil {
		p.LogError("failed to get transcription state", "error", err.Error())
		return
	}

	// If the transcription hasn't started (bot hasn't joined yet) we notify the
	// client.
	if trState.StartAt == 0 {
		if trState.JobID != jobID {
			p.LogInfo("a new job has started in between, exiting", "callID", callID, "jobID", jobID)
			return
		}

		p.LogError("timed out waiting for transcriber bot to join", "callID", callID, "jobID", jobID)

		state.Call.Transcription = nil
		if err := p.kvSetChannelState(callID, state); err != nil {
			p.LogError("failed to set channel state", "err", err.Error())
			return
		}

		clientState := trState.getClientState()
		clientState.Err = "failed to start transcriber job: timed out waiting for bot to join call"
		clientState.EndAt = time.Now().UnixMilli()

		p.publishWebSocketEvent(wsEventCallTranscriptionState, map[string]interface{}{
			"callID":  callID,
			"trState": clientState.toMap(),
		}, &model.WebsocketBroadcast{ChannelId: callID, ReliableClusterSend: true})
	}
}

func (p *Plugin) handleTranscriptionStartAction(state *channelState, callID, userID string) (*JobStateClient, httpResponse) {
	var res httpResponse

	if state.Call.Transcription != nil && state.Call.Transcription.EndAt == 0 {
		res.Err = "transcription already in progress"
		res.Code = http.StatusForbidden
		return nil, res
	}

	trState := new(jobState)
	trState.ID = model.NewId()
	trState.CreatorID = userID
	trState.InitAt = time.Now().UnixMilli()
	state.Call.Transcription = trState

	if err := p.kvSetChannelState(callID, state); err != nil {
		res.Err = fmt.Errorf("failed to set channel state: %w", err).Error()
		res.Code = http.StatusInternalServerError
		return nil, res
	}

	defer func() {
		// In case of any error we relay it to the client.
		if res.Err != "" && trState != nil {
			trState.EndAt = time.Now().UnixMilli()
			trState.Err = res.Err
			p.publishWebSocketEvent(wsEventCallTranscriptionState, map[string]interface{}{
				"callID":  callID,
				"trState": trState.getClientState().toMap(),
			}, &model.WebsocketBroadcast{ChannelId: callID, ReliableClusterSend: true})
		}
	}()

	// Sending the event prior to making the API call to the job service
	// since it could take a few seconds to complete and we want clients
	// to get their local state updated as soon as it changes on the server.
	p.publishWebSocketEvent(wsEventCallTranscriptionState, map[string]interface{}{
		"callID":  callID,
		"trState": trState.getClientState().toMap(),
	}, &model.WebsocketBroadcast{ChannelId: callID, ReliableClusterSend: true})

	// We don't want to keep the lock while making the API call to the service since it
	// could take a while to return. We lock again as soon as this returns.
	p.unlockCall(callID)
	trJobID, jobErr := p.getJobService().RunJob(job.TypeTranscribing, callID, state.Call.PostID, trState.ID, p.botSession.Token)
	state, err := p.lockCall(callID)
	if err != nil {
		res.Err = fmt.Errorf("failed to lock call: %w", err).Error()
		res.Code = http.StatusInternalServerError
		return nil, res
	}

	trState, err = state.getTranscription()
	if err != nil {
		res.Err = fmt.Errorf("failed to get transcription state: %w", err).Error()
		res.Code = http.StatusInternalServerError
		return nil, res
	}

	if jobErr != nil {
		state.Call.Transcription = nil
		if err := p.kvSetChannelState(callID, state); err != nil {
			res.Err = fmt.Errorf("failed to set channel state: %w", err).Error()
			res.Code = http.StatusInternalServerError
			return nil, res
		}
		res.Err = "failed to create transcription job: " + jobErr.Error()
		res.Code = http.StatusInternalServerError
		return nil, res
	}

	if trState.JobID != "" {
		res.Err = "transcription job already in progress"
		res.Code = http.StatusForbidden
		return nil, res
	}
	trState.JobID = trJobID
	if err := p.kvSetChannelState(callID, state); err != nil {
		res.Err = fmt.Errorf("failed to set channel state: %w", err).Error()
		res.Code = http.StatusInternalServerError
		return nil, res
	}

	p.LogDebug("transcription job started successfully", "jobID", trJobID, "callID", callID)

	p.publishWebSocketEvent(wsEventCallTranscriptionState, map[string]interface{}{
		"callID":  callID,
		"trState": trState.getClientState().toMap(),
	}, &model.WebsocketBroadcast{ChannelId: callID, ReliableClusterSend: true})

	go p.transcriptionJobTimeoutChecker(callID, trJobID)

	return trState.getClientState(), res
}

func (p *Plugin) handleTranscriptionStopAction(state *channelState, callID string) (*JobStateClient, httpResponse) {
	var res httpResponse

	if state.Call.Transcription == nil || state.Call.Transcription.EndAt != 0 {
		res.Err = "no transcription in progress"
		res.Code = http.StatusForbidden
		return nil, res
	}

	trState, err := state.getTranscription()
	if err != nil {
		res.Err = fmt.Errorf("failed to get transcription state: %w", err).Error()
		res.Code = http.StatusInternalServerError
		return nil, res
	}
	trState.EndAt = time.Now().UnixMilli()
	state.Call.Transcription = nil

	if err := p.kvSetChannelState(callID, state); err != nil {
		res.Err = fmt.Errorf("failed to set channel state: %w", err).Error()
		res.Code = http.StatusInternalServerError
		return nil, res
	}

	defer func() {
		// In case of any error we relay it to the client.
		if res.Err != "" {
			trState.EndAt = time.Now().UnixMilli()
			trState.Err = res.Err
			p.publishWebSocketEvent(wsEventCallTranscriptionState, map[string]interface{}{
				"callID":  callID,
				"trState": trState.getClientState().toMap(),
			}, &model.WebsocketBroadcast{ChannelId: callID, ReliableClusterSend: true})
		}
	}()

	if err := p.getJobService().StopJob(callID, trState.BotConnID); err != nil {
		res.Err = "failed to stop transcription job: " + err.Error()
		res.Code = http.StatusInternalServerError
		return nil, res
	}

	p.publishWebSocketEvent(wsEventCallTranscriptionState, map[string]interface{}{
		"callID":  callID,
		"trState": trState.getClientState().toMap(),
	}, &model.WebsocketBroadcast{ChannelId: callID, ReliableClusterSend: true})

	return trState.getClientState(), res
}

func (p *Plugin) handleTranscriptionAction(w http.ResponseWriter, r *http.Request, callID, action string) {
	var res httpResponse
	defer p.httpAudit("handleTranscriptionAction", &res, w, r)

	userID := r.Header.Get("Mattermost-User-Id")

	if !p.API.HasPermissionToChannel(userID, callID, model.PermissionReadChannel) {
		res.Err = "forbidden"
		res.Code = http.StatusForbidden
		return
	}

	if !p.licenseChecker.TranscriptionsAllowed() {
		res.Err = "transcriptions are not allowed by your license"
		res.Code = http.StatusForbidden
		return
	}

	if cfg := p.getConfiguration(); !cfg.transcriptionsEnabled() {
		res.Err = "transcriptions are not enabled"
		res.Code = http.StatusForbidden
		return
	}

	if p.getJobService() == nil {
		res.Err = "job service is not initialized"
		res.Code = http.StatusForbidden
		return
	}

	state, err := p.lockCall(callID)
	if err != nil {
		res.Err = fmt.Errorf("failed to lock call: %w", err).Error()
		res.Code = http.StatusInternalServerError
		return
	}
	defer p.unlockCall(callID)

	if state == nil {
		res.Err = "channel state is missing from store"
		res.Code = http.StatusForbidden
		return
	}
	if state.Call == nil {
		res.Err = "no call ongoing"
		res.Code = http.StatusForbidden
		return
	}
	if state.Call.HostID != userID {
		res.Err = "no permissions to transcribe"
		res.Code = http.StatusForbidden
		return
	}

	var trState *JobStateClient
	switch action {
	case "start":
		trState, res = p.handleTranscriptionStartAction(state, callID, userID)
	case "stop":
		trState, res = p.handleTranscriptionStopAction(state, callID)
	default:
		res.Err = "unsupported transcription action"
		res.Code = http.StatusBadRequest
		return
	}

	if res.Err != "" {
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(trState); err != nil {
		p.LogError(err.Error())
	}
}
