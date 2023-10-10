// Copyright (c) 2022-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"fmt"
	"time"

	"github.com/mattermost/calls-offloader/public/job"

	"github.com/mattermost/mattermost/server/public/model"
)

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

		if state.Call.Recording != nil && state.Call.Recording.EndAt == 0 {
			if _, _, err := p.stopRecordingJob(state, callID); err != nil {
				p.LogError("failed to stop recording job", "callID", callID, "err", err.Error())
			}
		}

		p.publishWebSocketEvent(wsEventCallTranscriptionState, map[string]interface{}{
			"callID":  callID,
			"trState": clientState.toMap(),
		}, &model.WebsocketBroadcast{ChannelId: callID, ReliableClusterSend: true})
	}
}

func (p *Plugin) startTranscribingJob(state *channelState, callID, userID, trID string) (rerr error) {
	if state.Call.Transcription != nil && state.Call.Transcription.EndAt == 0 {
		return fmt.Errorf("transcription already in progress")
	}

	trState := new(jobState)
	trState.ID = trID
	trState.CreatorID = userID
	trState.InitAt = time.Now().UnixMilli()
	state.Call.Transcription = trState

	if err := p.kvSetChannelState(callID, state); err != nil {
		return fmt.Errorf("failed to set channel state: %w", err)
	}

	defer func() {
		// In case of any error we relay it to the client.
		if rerr != nil && trState != nil {
			trState.EndAt = time.Now().UnixMilli()
			trState.Err = rerr.Error()
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
		return fmt.Errorf("failed to lock call: %w", err)
	}

	trState, err = state.getTranscription()
	if err != nil {
		return fmt.Errorf("failed to get transcription state: %w", err)
	}

	if jobErr != nil {
		state.Call.Transcription = nil
		if err := p.kvSetChannelState(callID, state); err != nil {
			return fmt.Errorf("failed to set channel state: %w", err)
		}
		return fmt.Errorf("failed to create transcription job: %w", jobErr)
	}

	if trState.JobID != "" {
		return fmt.Errorf("transcription job already in progress")
	}
	trState.JobID = trJobID
	if err := p.kvSetChannelState(callID, state); err != nil {
		return fmt.Errorf("failed to set channel state: %w", err)
	}

	p.LogDebug("transcription job started successfully", "jobID", trJobID, "callID", callID)

	p.publishWebSocketEvent(wsEventCallTranscriptionState, map[string]interface{}{
		"callID":  callID,
		"trState": trState.getClientState().toMap(),
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

	if err := p.kvSetChannelState(callID, state); err != nil {
		return fmt.Errorf("failed to set channel state: %w", err)
	}

	defer func() {
		// In case of any error we relay it to the client.
		if rerr != nil {
			trState.Err = rerr.Error()
			p.publishWebSocketEvent(wsEventCallTranscriptionState, map[string]interface{}{
				"callID":  callID,
				"trState": trState.getClientState().toMap(),
			}, &model.WebsocketBroadcast{ChannelId: callID, ReliableClusterSend: true})
		}
	}()

	if err := p.getJobService().StopJob(callID, trState.BotConnID); err != nil {
		return fmt.Errorf("failed to stop transcription job: %w", err)
	}

	if state.Call.Recording != nil && state.Call.Recording.EndAt == 0 {
		if _, _, err := p.stopRecordingJob(state, callID); err != nil {
			p.LogError("failed to stop recording job", "callID", callID, "err", err.Error())
		}
	}

	p.publishWebSocketEvent(wsEventCallTranscriptionState, map[string]interface{}{
		"callID":  callID,
		"trState": trState.getClientState().toMap(),
	}, &model.WebsocketBroadcast{ChannelId: callID, ReliableClusterSend: true})

	return nil
}
