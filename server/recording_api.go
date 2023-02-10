// Copyright (c) 2022-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"time"

	"github.com/mattermost/mattermost-server/v6/model"
)

var callRecordingActionRE = regexp.MustCompile(`^\/calls\/([a-z0-9]+)/recording/(start|stop|publish)$`)

const recordingJobStartTimeout = 15 * time.Second

func (p *Plugin) recJobTimeoutChecker(callID, jobID string) {
	time.Sleep(recordingJobStartTimeout)

	state, err := p.kvGetChannelState(callID)
	if err != nil {
		p.LogError("failed to get channel state", "error", err.Error())
		return
	}

	recState, err := state.getRecording()
	if err != nil {
		p.LogError("failed to get recording state", "error", err.Error())
		return
	}

	// If the recording hasn't started (bot hasn't joined yet) we notify the
	// client.
	var clientState *RecordingStateClient
	if recState.JobID == jobID && recState.StartAt == 0 {
		if err := p.kvSetAtomicChannelState(callID, func(state *channelState) (*channelState, error) {
			recordingState, err := state.getRecording()
			if err != nil {
				return nil, err
			}
			if recordingState.JobID != jobID {
				return nil, fmt.Errorf("invalid recording job")
			}

			clientState = recordingState.getClientState()
			state.Call.Recording = nil

			return state, nil
		}); err != nil {
			p.LogError("failed to set channel state", "error", err.Error())
			return
		}

		p.LogError("timed out waiting for recorder bot to join", "callID", callID, "jobID", jobID)

		clientState.Err = "failed to start recording job: timed out waiting for bot to join call"
		clientState.EndAt = time.Now().UnixMilli()

		p.publishWebSocketEvent(wsEventCallRecordingState, map[string]interface{}{
			"callID":   callID,
			"recState": clientState.toMap(),
		}, &model.WebsocketBroadcast{ChannelId: callID, ReliableClusterSend: true})
	}
}

func (p *Plugin) handleRecordingAction(w http.ResponseWriter, r *http.Request, callID, action string) {
	var res httpResponse
	defer p.httpAudit("handlePostRecording", &res, w, r)

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

	if p.jobService == nil {
		res.Err = "Job service is not initialized"
		res.Code = http.StatusForbidden
		return
	}

	if action == "publish" {
		res.Err = "Not implemented"
		res.Code = http.StatusNotImplemented
		return
	}

	var recState recordingState
	var postID string
	if err := p.kvSetAtomicChannelState(callID, func(state *channelState) (*channelState, error) {
		if state == nil {
			return nil, fmt.Errorf("channel state is missing from store")
		}
		if state.Call == nil {
			return nil, fmt.Errorf("no call ongoing")
		}
		if state.Call.HostID != userID {
			return nil, fmt.Errorf("no permissions to record")
		}
		if action == "start" && state.Call.Recording != nil && state.Call.Recording.EndAt == 0 {
			return nil, fmt.Errorf("recording already in progress")
		}
		if action == "stop" && (state.Call.Recording == nil || state.Call.Recording.EndAt != 0) {
			return nil, fmt.Errorf("no recording in progress")
		}

		if action == "start" {
			recState.ID = model.NewId()
			recState.CreatorID = userID
			recState.InitAt = time.Now().UnixMilli()
			state.Call.Recording = &recState
			postID = state.Call.PostID
		} else if action == "stop" {
			recState = *state.Call.Recording
			recState.EndAt = time.Now().UnixMilli()
			state.Call.Recording = nil
		}

		return state, nil
	}); err != nil {
		res.Err = err.Error()
		res.Code = http.StatusForbidden
		return
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

	if action == "start" {
		// Sending the event prior to making the API call to the job service
		// since it could take a few seconds to complete and we want clients
		// to get their local state updated as soon as it changes on the server.
		p.publishWebSocketEvent(wsEventCallRecordingState, map[string]interface{}{
			"callID":   callID,
			"recState": recState.getClientState().toMap(),
		}, &model.WebsocketBroadcast{ChannelId: callID, ReliableClusterSend: true})
		recJobID, err := p.jobService.RunRecordingJob(callID, postID, p.botSession.Token)
		if err != nil {
			// resetting state in case the job failed to run
			if err := p.kvSetAtomicChannelState(callID, func(state *channelState) (*channelState, error) {
				if state == nil || state.Call == nil || state.Call.Recording == nil {
					return nil, fmt.Errorf("missing state")
				}
				state.Call.Recording = nil
				return state, nil
			}); err != nil {
				p.LogError(err.Error())
			}
			res.Err = "failed to create recording job: " + err.Error()
			res.Code = http.StatusInternalServerError
			return
		}

		if err := p.kvSetAtomicChannelState(callID, func(state *channelState) (*channelState, error) {
			recState, err := state.getRecording()
			if err != nil {
				return nil, err
			}
			if recState.JobID != "" {
				return nil, fmt.Errorf("recording job already in progress")
			}
			recState.JobID = recJobID

			return state, nil
		}); err != nil {
			res.Err = err.Error()
			res.Code = http.StatusForbidden
			return
		}

		p.publishWebSocketEvent(wsEventCallRecordingState, map[string]interface{}{
			"callID":   callID,
			"recState": recState.getClientState().toMap(),
		}, &model.WebsocketBroadcast{ChannelId: callID, ReliableClusterSend: true})

		go p.recJobTimeoutChecker(callID, recJobID)
	} else if action == "stop" {
		// Sending the event prior to making the API call to the job service
		// since it could take a few seconds to complete but we want clients
		// to get their local state updated as soon as it changes on the server.
		p.publishWebSocketEvent(wsEventCallRecordingState, map[string]interface{}{
			"callID":   callID,
			"recState": recState.getClientState().toMap(),
		}, &model.WebsocketBroadcast{ChannelId: callID, ReliableClusterSend: true})

		if err := p.jobService.StopJob(recState.JobID); err != nil {
			res.Err = "failed to stop recording job: " + err.Error()
			res.Code = http.StatusInternalServerError
			return
		}
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(recState.getClientState()); err != nil {
		p.LogError(err.Error())
	}
}
