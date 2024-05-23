// Copyright (c) 2022-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/mattermost/mattermost-plugin-calls/server/public"

	"github.com/mattermost/calls-offloader/public/job"

	"github.com/mattermost/mattermost/server/public/model"

	"github.com/gorilla/mux"
)

const recordingJobStartTimeout = time.Minute

func (p *Plugin) recJobTimeoutChecker(callID, jobID string) {
	time.Sleep(recordingJobStartTimeout)

	state, err := p.lockCallReturnState(callID)
	if err != nil {
		p.LogError("failed to lock call", "err", err.Error(), "callID", callID, "jobID", jobID)
		return
	}
	defer p.unlockCall(callID)

	recState, err := state.getRecording()
	if err != nil {
		p.LogWarn("failed to get recording state", "err", err.Error(), "callID", callID, "jobID", jobID)
		return
	}

	// If the recording hasn't started (bot hasn't joined yet) we notify the
	// client.
	if recState.StartAt == 0 {
		if recState.Props.JobID != jobID {
			p.LogInfo("a new job has started in between, exiting", "callID", callID, "jobID", jobID)
			return
		}

		p.LogError("timed out waiting for recorder bot to join", "callID", callID, "jobID", jobID)

		recState.Props.Err = "failed to start recording job: timed out waiting for bot to join call"
		recState.EndAt = time.Now().UnixMilli()
		if err := p.store.UpdateCallJob(recState); err != nil {
			p.LogError("failed to update call job", "callID", callID, "jobID", jobID, "err", err.Error())
		}

		if state.Transcription != nil && state.Transcription.EndAt == 0 {
			if err := p.stopTranscribingJob(state, callID); err != nil {
				p.LogError("failed to stop transcribing job", "err", err.Error(), "callID", callID, "jobID", jobID)
			}
		}

		clientState := getClientStateFromCallJob(recState)
		clientState.Err = "failed to start recording job: timed out waiting for bot to join call"
		clientState.EndAt = time.Now().UnixMilli()

		p.publishWebSocketEvent(wsEventCallJobState, map[string]interface{}{
			"callID":   callID,
			"jobState": clientState.toMap(),
		}, &WebSocketBroadcast{
			ChannelID:           callID,
			ReliableClusterSend: true,
			UserIDs:             getUserIDsFromSessions(state.sessions),
		})

		// MM-57224: deprecated, remove when not needed by mobile pre 2.14.0
		p.publishWebSocketEvent(wsEventCallRecordingState, map[string]interface{}{
			"callID":   callID,
			"recState": clientState.toMap(),
		}, &WebSocketBroadcast{
			ChannelID:           callID,
			ReliableClusterSend: true,
			UserIDs:             getUserIDsFromSessions(state.sessions),
		})
	}
}

func (p *Plugin) startRecordingJob(state *callState, callID, userID string) (rst *JobStateClient, rcode int, rerr error) {
	if state.Recording != nil && state.Recording.EndAt == 0 {
		return nil, http.StatusForbidden, fmt.Errorf("recording already in progress")
	}

	recState := new(public.CallJob)
	recState.ID = model.NewId()
	recState.CallID = state.Call.ID
	recState.Type = public.JobTypeRecording
	recState.CreatorID = userID
	recState.InitAt = time.Now().UnixMilli()

	if err := p.store.CreateCallJob(recState); err != nil {
		return nil, http.StatusInternalServerError, fmt.Errorf("failed to create call job: %w", err)
	}

	defer func() {
		// In case of any error we relay it to the client.
		if rerr != nil && recState != nil {
			recState.EndAt = time.Now().UnixMilli()
			recState.Props.Err = rerr.Error()
			p.publishWebSocketEvent(wsEventCallJobState, map[string]interface{}{
				"callID":   callID,
				"jobState": getClientStateFromCallJob(recState).toMap(),
			}, &WebSocketBroadcast{
				ChannelID:           callID,
				ReliableClusterSend: true,
				UserIDs:             getUserIDsFromSessions(state.sessions),
			})

			// MM-57224: deprecated, remove when not needed by mobile pre 2.14.0
			p.publishWebSocketEvent(wsEventCallRecordingState, map[string]interface{}{
				"callID":   callID,
				"recState": getClientStateFromCallJob(recState).toMap(),
			}, &WebSocketBroadcast{
				ChannelID:           callID,
				ReliableClusterSend: true,
				UserIDs:             getUserIDsFromSessions(state.sessions),
			})
		}
	}()

	// Sending the event prior to making the API call to the job service
	// since it could take a few seconds to complete and we want clients
	// to get their local state updated as soon as it changes on the server.
	p.publishWebSocketEvent(wsEventCallJobState, map[string]interface{}{
		"callID":   callID,
		"jobState": getClientStateFromCallJob(recState).toMap(),
	}, &WebSocketBroadcast{
		ChannelID:           callID,
		ReliableClusterSend: true,
		UserIDs:             getUserIDsFromSessions(state.sessions),
	})

	// MM-57224: deprecated, remove when not needed by mobile pre 2.14.0
	p.publishWebSocketEvent(wsEventCallRecordingState, map[string]interface{}{
		"callID":   callID,
		"recState": getClientStateFromCallJob(recState).toMap(),
	}, &WebSocketBroadcast{
		ChannelID:           callID,
		ReliableClusterSend: true,
		UserIDs:             getUserIDsFromSessions(state.sessions),
	})

	// We don't want to keep the lock while making the API call to the service since it
	// could take a while to return. We lock again as soon as this returns.
	p.unlockCall(callID)
	recJobID, jobErr := p.getJobService().RunJob(job.TypeRecording, callID, state.Call.PostID, recState.ID, p.botSession.Token)
	state, err := p.lockCallReturnState(callID)
	if err != nil {
		return nil, http.StatusInternalServerError, fmt.Errorf("failed to lock call: %w", err)
	}

	recState, err = state.getRecording()
	if err != nil {
		return nil, http.StatusInternalServerError, fmt.Errorf("failed to get recording state: %w", err)
	}

	if jobErr != nil {
		recState.EndAt = time.Now().UnixMilli()
		recState.Props.Err = jobErr.Error()
		if err := p.store.UpdateCallJob(recState); err != nil {
			p.LogError("failed to update call job", "err", err.Error(), "jobID", recJobID, "callID", callID)
		}

		return nil, http.StatusInternalServerError, fmt.Errorf("failed to create recording job: %w", jobErr)
	}

	if recState.Props.JobID != "" {
		return nil, http.StatusForbidden, fmt.Errorf("recording job already in progress")
	}
	recState.Props.JobID = recJobID
	if err := p.store.UpdateCallJob(recState); err != nil {
		return nil, http.StatusInternalServerError, fmt.Errorf("failed to update call job: %w", err)
	}

	p.LogDebug("recording job started successfully", "jobID", recJobID, "callID", callID)

	var trID string
	if cfg := p.getConfiguration(); cfg.transcriptionsEnabled() {
		trID = model.NewId()
		p.LogDebug("transcriptions enabled, starting job", "callID", callID)
		if err := p.startTranscribingJob(state, callID, userID, trID); err != nil {
			p.LogError("failed to start transcribing job", "callID", callID, "err", err.Error())
			return nil, http.StatusInternalServerError, fmt.Errorf("failed to start transcribing job: %w", err)
		}
	}

	if err := p.saveRecordingMetadata(state.Call.PostID, recState.ID, trID); err != nil {
		p.LogError("failed to save recording metadata", "err", err.Error())
	}

	p.publishWebSocketEvent(wsEventCallJobState, map[string]interface{}{
		"callID":   callID,
		"jobState": getClientStateFromCallJob(recState).toMap(),
	}, &WebSocketBroadcast{
		ChannelID:           callID,
		ReliableClusterSend: true,
		UserIDs:             getUserIDsFromSessions(state.sessions),
	})

	// MM-57224: deprecated, remove when not needed by mobile pre 2.14.0
	p.publishWebSocketEvent(wsEventCallRecordingState, map[string]interface{}{
		"callID":   callID,
		"recState": getClientStateFromCallJob(recState).toMap(),
	}, &WebSocketBroadcast{
		ChannelID:           callID,
		ReliableClusterSend: true,
		UserIDs:             getUserIDsFromSessions(state.sessions),
	})

	go p.recJobTimeoutChecker(callID, recJobID)

	return getClientStateFromCallJob(recState), http.StatusOK, nil
}

func (p *Plugin) stopRecordingJob(state *callState, callID string) (rst *JobStateClient, rcode int, rerr error) {
	if state.Recording == nil || state.Recording.EndAt != 0 {
		return nil, http.StatusForbidden, fmt.Errorf("no recording in progress")
	}

	recState, err := state.getRecording()
	if err != nil {
		return nil, http.StatusInternalServerError, fmt.Errorf("failed to get recording state: %w", err)
	}
	recState.EndAt = time.Now().UnixMilli()
	if err := p.store.UpdateCallJob(recState); err != nil {
		return nil, http.StatusInternalServerError, fmt.Errorf("failed to update call job: %w", err)
	}

	defer func() {
		// In case of any error we relay it to the client.
		if rerr != nil {
			recState.Props.Err = rerr.Error()
			p.publishWebSocketEvent(wsEventCallJobState, map[string]interface{}{
				"callID":   callID,
				"jobState": getClientStateFromCallJob(recState).toMap(),
			}, &WebSocketBroadcast{
				ChannelID:           callID,
				ReliableClusterSend: true,
				UserIDs:             getUserIDsFromSessions(state.sessions),
			})

			// MM-57224: deprecated, remove when not needed by mobile pre 2.14.0
			p.publishWebSocketEvent(wsEventCallRecordingState, map[string]interface{}{
				"callID":   callID,
				"recState": getClientStateFromCallJob(recState).toMap(),
			}, &WebSocketBroadcast{
				ChannelID:           callID,
				ReliableClusterSend: true,
				UserIDs:             getUserIDsFromSessions(state.sessions),
			})
		}
	}()

	if state.Transcription != nil && state.Transcription.EndAt == 0 {
		if err := p.stopTranscribingJob(state, callID); err != nil {
			p.LogError("failed to stop transcribing job", "callID", callID, "err", err.Error())
		}
	}

	if err := p.getJobService().StopJob(callID, recState.ID, p.getBotID(), recState.Props.BotConnID); err != nil {
		return nil, http.StatusInternalServerError, fmt.Errorf("failed to stop recording job: %w", err)
	}

	p.publishWebSocketEvent(wsEventCallJobState, map[string]interface{}{
		"callID":   callID,
		"jobState": getClientStateFromCallJob(recState).toMap(),
	}, &WebSocketBroadcast{
		ChannelID:           callID,
		ReliableClusterSend: true,
		UserIDs:             getUserIDsFromSessions(state.sessions),
	})

	// MM-57224: deprecated, remove when not needed by mobile pre 2.14.0
	p.publishWebSocketEvent(wsEventCallRecordingState, map[string]interface{}{
		"callID":   callID,
		"recState": getClientStateFromCallJob(recState).toMap(),
	}, &WebSocketBroadcast{
		ChannelID:           callID,
		ReliableClusterSend: true,
		UserIDs:             getUserIDsFromSessions(state.sessions),
	})

	return getClientStateFromCallJob(recState), http.StatusOK, nil
}

func (p *Plugin) handleRecordingAction(w http.ResponseWriter, r *http.Request) {
	var res httpResponse
	defer p.httpAudit("handleRecordingAction", &res, w, r)

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
		res.Err = "no permissions to record"
		res.Code = http.StatusForbidden
		return
	}

	var code int
	var recState *JobStateClient
	switch action {
	case "start":
		recState, code, err = p.startRecordingJob(state, callID, userID)
	case "stop":
		recState, code, err = p.stopRecordingJob(state, callID)
	default:
		res.Err = "unsupported recording action"
		res.Code = http.StatusBadRequest
		return
	}

	if err != nil {
		res.Code = code
		res.Err = err.Error()
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(recState); err != nil {
		p.LogError(err.Error())
	}
}
