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
	var threadID string
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
		if action == "start" && state.Call.Recording != nil {
			return nil, fmt.Errorf("recording already in progress")
		}
		if action == "stop" && state.Call.Recording == nil {
			return nil, fmt.Errorf("no recording in progress")
		}

		if action == "start" {
			recState.ID = model.NewId()
			recState.CreatorID = userID
			recState.InitAt = time.Now().UnixMilli()
			state.Call.Recording = &recState
			threadID = state.Call.ThreadID
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

	if action == "start" {
		recJobID, err := p.jobService.RunRecordingJob(callID, threadID, p.botSession.Token)
		if err != nil {
			res.Err = "failed to create recording job: " + err.Error()
			res.Code = http.StatusInternalServerError
			return
		}

		if err := p.kvSetAtomicChannelState(callID, func(state *channelState) (*channelState, error) {
			if state == nil {
				return nil, fmt.Errorf("channel state is missing from store")
			}
			if state.Call == nil {
				return nil, fmt.Errorf("no call ongoing")
			}
			if state.Call.Recording == nil {
				return nil, fmt.Errorf("no recording ongoing")
			}
			if state.Call.Recording.JobID != "" {
				return nil, fmt.Errorf("recording job already in progress")
			}
			state.Call.Recording.JobID = recJobID

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
	} else if action == "stop" {
		if err := p.jobService.StopJob(recState.JobID); err != nil {
			res.Err = "failed to create recording job: " + err.Error()
			res.Code = http.StatusInternalServerError
			return
		}

		p.publishWebSocketEvent(wsEventCallRecordingState, map[string]interface{}{
			"callID":   callID,
			"recState": recState.getClientState().toMap(),
		}, &model.WebsocketBroadcast{ChannelId: callID, ReliableClusterSend: true})
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(recState.getClientState()); err != nil {
		p.LogError(err.Error())
	}
}
