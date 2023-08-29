// Copyright (c) 2022-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"time"

	"github.com/mattermost/mattermost/server/public/model"
)

var callRecordingActionRE = regexp.MustCompile(`^\/calls\/([a-z0-9]+)/recording/(start|stop|publish)$`)

const recordingJobStartTimeout = 2 * time.Minute

func (p *Plugin) recJobTimeoutChecker(callID, jobID string) {
	time.Sleep(recordingJobStartTimeout)

	state, err := p.lockCall(callID)
	if err != nil {
		p.LogError("failed to lock call", "err", err.Error())
		return
	}
	defer p.unlockCall(callID)

	recState, err := state.getRecording()
	if err != nil {
		p.LogError("failed to get recording state", "error", err.Error())
		return
	}

	// If the recording hasn't started (bot hasn't joined yet) we notify the
	// client.
	if recState.StartAt == 0 {
		if recState.JobID != jobID {
			p.LogInfo("a new job has started in between, exiting", "callID", callID, "jobID", jobID)
			return
		}

		p.LogError("timed out waiting for recorder bot to join", "callID", callID, "jobID", jobID)

		state.Call.Recording = nil
		if err := p.kvSetChannelState(callID, state); err != nil {
			p.LogError("failed to set channel state", "err", err.Error())
			return
		}

		clientState := recState.getClientState()
		clientState.Err = "failed to start recording job: timed out waiting for bot to join call"
		clientState.EndAt = time.Now().UnixMilli()

		p.publishWebSocketEvent(wsEventCallRecordingState, map[string]interface{}{
			"callID":   callID,
			"recState": clientState.toMap(),
		}, &model.WebsocketBroadcast{ChannelId: callID, ReliableClusterSend: true})
	}
}

func (p *Plugin) handleRecordingStartAction(state *channelState, callID, userID string) (*RecordingStateClient, httpResponse) {
	var res httpResponse

	if state.Call.Recording != nil && state.Call.Recording.EndAt == 0 {
		res.Err = "recording already in progress"
		res.Code = http.StatusForbidden
		return nil, res
	}

	recState := new(recordingState)
	recState.ID = model.NewId()
	recState.CreatorID = userID
	recState.InitAt = time.Now().UnixMilli()
	state.Call.Recording = recState

	if err := p.kvSetChannelState(callID, state); err != nil {
		res.Err = fmt.Errorf("failed to set channel state: %w", err).Error()
		res.Code = http.StatusInternalServerError
		return nil, res
	}

	defer func() {
		// In case of any error we relay it to the client.
		if res.Err != "" && recState != nil {
			recState.EndAt = time.Now().UnixMilli()
			recState.Err = res.Err
			p.publishWebSocketEvent(wsEventCallRecordingState, map[string]interface{}{
				"callID":   callID,
				"recState": recState.getClientState().toMap(),
			}, &model.WebsocketBroadcast{ChannelId: callID, ReliableClusterSend: true})
		}
	}()

	// Sending the event prior to making the API call to the job service
	// since it could take a few seconds to complete and we want clients
	// to get their local state updated as soon as it changes on the server.
	p.publishWebSocketEvent(wsEventCallRecordingState, map[string]interface{}{
		"callID":   callID,
		"recState": recState.getClientState().toMap(),
	}, &model.WebsocketBroadcast{ChannelId: callID, ReliableClusterSend: true})

	// We don't want to keep the lock while making the API call to the service since it
	// could take a while to return. We lock again as soon as this returns.
	p.unlockCall(callID)
	recJobID, jobErr := p.getJobService().RunRecordingJob(callID, state.Call.PostID, p.botSession.Token)
	state, err := p.lockCall(callID)
	if err != nil {
		res.Err = fmt.Errorf("failed to lock call: %w", err).Error()
		res.Code = http.StatusInternalServerError
		return nil, res
	}

	recState, err = state.getRecording()
	if err != nil {
		res.Err = fmt.Errorf("failed to get recording state: %w", err).Error()
		res.Code = http.StatusInternalServerError
		return nil, res
	}

	if jobErr != nil {
		state.Call.Recording = nil
		if err := p.kvSetChannelState(callID, state); err != nil {
			res.Err = fmt.Errorf("failed to set channel state: %w", err).Error()
			res.Code = http.StatusInternalServerError
			return nil, res
		}
		res.Err = "failed to create recording job: " + jobErr.Error()
		res.Code = http.StatusInternalServerError
		return nil, res
	}

	if recState.JobID != "" {
		res.Err = "recording job already in progress"
		res.Code = http.StatusForbidden
		return nil, res
	}
	recState.JobID = recJobID
	if err := p.kvSetChannelState(callID, state); err != nil {
		res.Err = fmt.Errorf("failed to set channel state: %w", err).Error()
		res.Code = http.StatusInternalServerError
		return nil, res
	}

	p.LogDebug("recording job started successfully", "jobID", recJobID, "callID", callID)

	p.publishWebSocketEvent(wsEventCallRecordingState, map[string]interface{}{
		"callID":   callID,
		"recState": recState.getClientState().toMap(),
	}, &model.WebsocketBroadcast{ChannelId: callID, ReliableClusterSend: true})

	go p.recJobTimeoutChecker(callID, recJobID)

	return recState.getClientState(), res
}

func (p *Plugin) handleRecordingStopAction(state *channelState, callID string) (*RecordingStateClient, httpResponse) {
	var res httpResponse

	if state.Call.Recording == nil || state.Call.Recording.EndAt != 0 {
		res.Err = "no recording in progress"
		res.Code = http.StatusForbidden
		return nil, res
	}

	recState, err := state.getRecording()
	if err != nil {
		res.Err = fmt.Errorf("failed to get recording state: %w", err).Error()
		res.Code = http.StatusInternalServerError
		return nil, res
	}
	recState.EndAt = time.Now().UnixMilli()
	state.Call.Recording = nil

	if err := p.kvSetChannelState(callID, state); err != nil {
		res.Err = fmt.Errorf("failed to set channel state: %w", err).Error()
		res.Code = http.StatusInternalServerError
		return nil, res
	}

	defer func() {
		// In case of any error we relay it to the client.
		if res.Err != "" {
			recState.EndAt = time.Now().UnixMilli()
			recState.Err = res.Err
			p.publishWebSocketEvent(wsEventCallRecordingState, map[string]interface{}{
				"callID":   callID,
				"recState": recState.getClientState().toMap(),
			}, &model.WebsocketBroadcast{ChannelId: callID, ReliableClusterSend: true})
		}
	}()

	if err := p.getJobService().StopJob(callID); err != nil {
		res.Err = "failed to stop recording job: " + err.Error()
		res.Code = http.StatusInternalServerError
		return nil, res
	}

	p.publishWebSocketEvent(wsEventCallRecordingState, map[string]interface{}{
		"callID":   callID,
		"recState": recState.getClientState().toMap(),
	}, &model.WebsocketBroadcast{ChannelId: callID, ReliableClusterSend: true})

	return recState.getClientState(), res
}

func (p *Plugin) handleRecordingAction(w http.ResponseWriter, r *http.Request, callID, action string) {
	var res httpResponse
	defer p.httpAudit("handleRecordingAction", &res, w, r)

	userID := r.Header.Get("Mattermost-User-Id")

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
		res.Err = "no permissions to record"
		res.Code = http.StatusForbidden
		return
	}

	var recState *RecordingStateClient
	switch action {
	case "start":
		recState, res = p.handleRecordingStartAction(state, callID, userID)
	case "stop":
		recState, res = p.handleRecordingStopAction(state, callID)
	default:
		res.Err = "unsupported recording action"
		res.Code = http.StatusBadRequest
		return
	}

	if res.Err != "" {
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(recState); err != nil {
		p.LogError(err.Error())
	}
}
