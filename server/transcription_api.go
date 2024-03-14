// Copyright (c) 2022-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"fmt"
	"time"

	"github.com/mattermost/calls-offloader/public/job"

	"github.com/mattermost/mattermost/server/public/model"
)

const transcriptionJobStartTimeout = time.Minute

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
		p.LogWarn("failed to get transcription state", "err", err.Error(), "callID", callID, "jobID", jobID)
		return
	}

	var lcState *jobState
	if cfg := p.getConfiguration(); cfg != nil && cfg.liveCaptionsEnabled() {
		var err error
		if lcState, err = state.getLiveCaptions(); err != nil {
			p.LogError("failed to get live captions state", "error", err.Error())
			// Note: not returning because we still want to finish ending the transcriber
		}
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
		if lcState != nil {
			state.Call.LiveCaptions = nil
		}
		if err := p.kvSetChannelState(callID, state); err != nil {
			p.LogError("failed to set channel state", "err", err.Error())
			return
		}

		clientState := trState.getClientState()
		clientState.Err = "failed to start transcriber job: timed out waiting for bot to join call"
		clientState.EndAt = time.Now().UnixMilli()

		if state.Call.Recording != nil && state.Call.Recording.EndAt == 0 {
			recClientState := state.Call.Recording.getClientState()
			if _, _, err := p.stopRecordingJob(state, callID); err != nil {
				p.LogError("failed to stop recording job", "err", err.Error(), "callID", callID, "jobID", jobID)
			}

			// This is needed as we don't yet handle wsEventCallTranscriptionState on
			// the client since jobs are coupled.
			recClientState.Err = "failed to start transcriber job: timed out waiting for bot to join call"
			p.publishWebSocketEvent(wsEventCallJobState, map[string]interface{}{
				"callID":   callID,
				"jobState": recClientState.toMap(),
			}, &model.WebsocketBroadcast{ChannelId: callID, ReliableClusterSend: true})

			// MM-57224: deprecated, remove when not needed by mobile pre 2.14.0
			p.publishWebSocketEvent(wsEventCallRecordingState, map[string]interface{}{
				"callID":   callID,
				"recState": recClientState.toMap(),
			}, &model.WebsocketBroadcast{ChannelId: callID, ReliableClusterSend: true})
		}

		// We need to send it as a "recording" because we don't handle the "transcription" type on the client.
		// MM-57265: However, we don't show this message yet.
		jobState := clientState.toMap()
		jobState["type"] = JobStateTranscription
		p.publishWebSocketEvent(wsEventCallJobState, map[string]interface{}{
			"callID":   callID,
			"jobState": jobState,
		}, &model.WebsocketBroadcast{ChannelId: callID, ReliableClusterSend: true})
	}
}

func (p *Plugin) startTranscribingJob(state *channelState, callID, userID, trID string) (rerr error) {
	if state.Call.Transcription != nil && state.Call.Transcription.EndAt == 0 {
		return fmt.Errorf("transcription already in progress")
	}

	if trID == "" {
		return fmt.Errorf("trID should not be empty")
	}

	trState := new(jobState)
	trState.Type = JobStateTranscription
	trState.ID = trID
	trState.CreatorID = userID
	trState.InitAt = time.Now().UnixMilli()
	state.Call.Transcription = trState

	liveCaptionsOn := false
	if cfg := p.getConfiguration(); cfg != nil && cfg.liveCaptionsEnabled() {
		liveCaptionsOn = true
		lcState := new(jobState)
		lcState.Type = JobStateLiveCaptions
		lcState.ID = trID
		lcState.CreatorID = userID
		lcState.InitAt = time.Now().UnixMilli()
		state.Call.LiveCaptions = lcState
	}

	if err := p.kvSetChannelState(callID, state); err != nil {
		return fmt.Errorf("failed to set channel state: %w", err)
	}

	defer func() {
		// In case of any error we relay it to the client.
		if rerr != nil && trState != nil {
			trState.EndAt = time.Now().UnixMilli()
			trState.Err = rerr.Error()
			p.publishWebSocketEvent(wsEventCallJobState, map[string]interface{}{
				"callID":   callID,
				"jobState": trState.getClientState().toMap(),
			}, &model.WebsocketBroadcast{ChannelId: callID, ReliableClusterSend: true})
		}
	}()

	// Sending the event prior to making the API call to the job service
	// since it could take a few seconds to complete and we want clients
	// to get their local state updated as soon as it changes on the server.
	p.publishWebSocketEvent(wsEventCallJobState, map[string]interface{}{
		"callID":   callID,
		"jobState": trState.getClientState().toMap(),
	}, &model.WebsocketBroadcast{ChannelId: callID, ReliableClusterSend: true})

	// Note: We don't need to send the live captions event until we get the StartAt in the
	// bot_api handleBotPostJobsStatus

	// We don't want to keep the lock while making the API call to the service since it
	// could take a while to return. We lock again as soon as this returns.
	p.unlockCall(callID)
	trJobID, jobErr := p.getJobService().RunJob(job.TypeTranscribing, callID, state.Call.PostID, trState.ID, p.botSession.Token)
	state, err := p.lockCall(callID)
	if err != nil {
		return fmt.Errorf("failed to lock call: %w", err)
	}

	trState, err = state.getTranscription()
	if err != nil {
		return fmt.Errorf("failed to get transcription state: %w", err)
	}
	var lcState *jobState
	if liveCaptionsOn {
		lcState, err = state.getLiveCaptions()
		if err != nil {
			p.LogError("failed to get live captions state", "callID", callID,
				"error", err)
		}
	}

	if jobErr != nil {
		state.Call.Transcription = nil
		if lcState != nil {
			state.Call.LiveCaptions = nil
		}
		if err := p.kvSetChannelState(callID, state); err != nil {
			return fmt.Errorf("failed to set channel state: %w", err)
		}
		return fmt.Errorf("failed to create transcription job: %w", jobErr)
	}

	if trState.JobID != "" {
		return fmt.Errorf("transcription job already in progress")
	}
	trState.JobID = trJobID
	if lcState != nil {
		lcState.JobID = trJobID
	}
	if err := p.kvSetChannelState(callID, state); err != nil {
		return fmt.Errorf("failed to set channel state: %w", err)
	}

	p.LogDebug("transcription job started successfully", "jobID", trJobID, "callID", callID)

	p.publishWebSocketEvent(wsEventCallJobState, map[string]interface{}{
		"callID":   callID,
		"jobState": trState.getClientState().toMap(),
	}, &model.WebsocketBroadcast{ChannelId: callID, ReliableClusterSend: true})

	go p.transcriptionJobTimeoutChecker(callID, trJobID)

	return nil
}

func (p *Plugin) stopTranscribingJob(state *channelState, callID string) (rerr error) {
	p.LogDebug("stopping transcribing job", "callID", callID)

	if state.Call.Transcription == nil || state.Call.Transcription.EndAt != 0 {
		return fmt.Errorf("no transcription in progress")
	}

	trState, err := state.getTranscription()
	if err != nil {
		return fmt.Errorf("failed to get transcription state: %w", err)
	}
	trState.EndAt = time.Now().UnixMilli()
	state.Call.Transcription = nil

	lcState, err := state.getLiveCaptions()
	if err == nil {
		lcState.EndAt = time.Now().UnixMilli()
		state.Call.LiveCaptions = nil
	}

	if err := p.kvSetChannelState(callID, state); err != nil {
		return fmt.Errorf("failed to set channel state: %w", err)
	}

	defer func() {
		// In case of any error we relay it to the client.
		if rerr != nil {
			trState.Err = rerr.Error()
			p.publishWebSocketEvent(wsEventCallJobState, map[string]interface{}{
				"callID":   callID,
				"jobState": trState.getClientState().toMap(),
			}, &model.WebsocketBroadcast{ChannelId: callID, ReliableClusterSend: true})
		}
	}()

	if err := p.getJobService().StopJob(callID, trState.ID, p.getBotID(), trState.BotConnID); err != nil {
		return fmt.Errorf("failed to stop transcription job: %w", err)
	}

	if state.Call.Recording != nil && state.Call.Recording.EndAt == 0 {
		if _, _, err := p.stopRecordingJob(state, callID); err != nil {
			p.LogError("failed to stop recording job", "callID", callID, "err", err.Error())
		}
	}

	p.publishWebSocketEvent(wsEventCallJobState, map[string]interface{}{
		"callID":   callID,
		"jobState": trState.getClientState().toMap(),
	}, &model.WebsocketBroadcast{ChannelId: callID, ReliableClusterSend: true})

	if lcState != nil {
		p.publishWebSocketEvent(wsEventCallJobState, map[string]interface{}{
			"callID":   callID,
			"jobState": lcState.getClientState().toMap(),
		}, &model.WebsocketBroadcast{ChannelId: callID, ReliableClusterSend: true})
	}

	return nil
}
