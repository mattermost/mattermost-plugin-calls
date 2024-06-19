// Copyright (c) 2022-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/mattermost/mattermost-plugin-calls/server/public"

	"github.com/mattermost/mattermost/server/public/model"

	"github.com/gorilla/mux"
)

func (p *Plugin) getBotID() string {
	if p.botSession != nil {
		return p.botSession.UserId
	}
	return ""
}

func (p *Plugin) isBot(userID string) bool {
	if userID != "" && userID == p.getBotID() {
		return true
	}
	return false
}

func (p *Plugin) isBotSession(r *http.Request) bool {
	return p.isBot(r.Header.Get("Mattermost-User-Id"))
}

func (p *Plugin) handleBotGetChannel(w http.ResponseWriter, r *http.Request) {
	channelID := mux.Vars(r)["channel_id"]

	channel, appErr := p.API.GetChannel(channelID)
	if appErr != nil {
		p.LogError(appErr.Error())
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(channel); err != nil {
		p.LogError(err.Error())
	}
}

func (p *Plugin) handleBotGetUserImage(w http.ResponseWriter, r *http.Request) {
	userID := mux.Vars(r)["user_id"]

	data, appErr := p.API.GetProfileImage(userID)
	if appErr != nil {
		p.LogError(appErr.Error())
		http.NotFound(w, r)
	}

	http.ServeContent(w, r, userID, time.Now(), bytes.NewReader(data))
}

func (p *Plugin) handleBotGetUpload(w http.ResponseWriter, r *http.Request) {
	var res httpResponse
	defer p.httpResponseHandler(&res, w)

	uploadID := mux.Vars(r)["upload_id"]

	us, err := p.API.GetUploadSession(uploadID)
	if err != nil {
		res.Err = err.Error()
		appErr, ok := err.(*model.AppError)
		if ok {
			res.Code = appErr.StatusCode
		} else {
			res.Code = http.StatusInternalServerError
		}
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(us); err != nil {
		p.LogError(err.Error())
	}
}

func (p *Plugin) handleBotUploadData(w http.ResponseWriter, r *http.Request) {
	var res httpResponse
	defer p.httpAudit("handleBotUploadData", &res, w, r)

	uploadID := mux.Vars(r)["upload_id"]

	us, err := p.API.GetUploadSession(uploadID)
	if err != nil {
		res.Err = err.Error()
		appErr, ok := err.(*model.AppError)
		if ok {
			res.Code = appErr.StatusCode
		} else {
			res.Code = http.StatusInternalServerError
		}
		return
	}

	serverCfg := p.API.GetConfig()
	if serverCfg == nil {
		res.Err = "failed to get server configuration"
		res.Code = http.StatusInternalServerError
		return
	}

	// We use FileSettings.MaxFileSize to keep the request body size bounded to
	// a sensible value to avoid abuse. This doesn't limit the amount of data we
	// can upload overall.
	fi, err := p.API.UploadData(us, http.MaxBytesReader(w, r.Body, *serverCfg.FileSettings.MaxFileSize))
	if err != nil {
		res.Err = err.Error()
		appErr, ok := err.(*model.AppError)
		if ok {
			res.Code = appErr.StatusCode
		} else {
			res.Code = http.StatusInternalServerError
		}
		return
	}

	// Upload is incomplete.
	if fi == nil {
		res.Code = http.StatusNoContent
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(fi); err != nil {
		p.LogError(err.Error())
	}
}

func (p *Plugin) handleBotCreateUpload(w http.ResponseWriter, r *http.Request) {
	var res httpResponse
	defer p.httpAudit("handleBotCreateUpload", &res, w, r)

	var us *model.UploadSession
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, requestBodyMaxSizeBytes)).Decode(&us); err != nil {
		res.Err = "failed to decode request body: " + err.Error()
		res.Code = http.StatusBadRequest
		return
	}

	us.Id = model.NewId()
	us.Type = model.UploadTypeAttachment
	us.UserId = p.getBotID()

	us, err := p.API.CreateUploadSession(us)
	if err != nil {
		res.Err = err.Error()
		appErr, ok := err.(*model.AppError)
		if ok {
			res.Code = appErr.StatusCode
		} else {
			res.Code = http.StatusInternalServerError
		}
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(us); err != nil {
		p.LogError(err.Error())
	}
}

func (p *Plugin) handleBotPostRecordings(w http.ResponseWriter, r *http.Request) {
	var res httpResponse
	defer p.httpAudit("handleBotPostRecordings", &res, w, r)

	callID := mux.Vars(r)["call_id"]

	var info public.RecordingJobInfo
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, requestBodyMaxSizeBytes)).Decode(&info); err != nil {
		res.Err = "failed to decode request body: " + err.Error()
		res.Code = http.StatusBadRequest
		return
	}

	if err := info.IsValid(); err != nil {
		res.Err = err.Error()
		res.Code = http.StatusBadRequest
		return
	}

	// Here we need to lock since we'll be reading and updating the call
	// post, potentially concurrently with other events (e.g. call ending,
	// transcribing job completing).
	_, err := p.lockCallReturnState(callID)
	if err != nil {
		res.Err = fmt.Errorf("failed to lock call: %w", err).Error()
		res.Code = http.StatusInternalServerError
		return
	}
	defer p.unlockCall(callID)

	// Update call post
	post, err := p.store.GetPost(info.PostID)
	if err != nil {
		res.Err = "failed to get call post: " + err.Error()
		res.Code = http.StatusInternalServerError
		return
	}

	threadID := post.Id

	// Post in thread
	if post.RootId != "" {
		threadID = post.RootId
	}

	// TODO: consider deprecating this in favour of the new recordings metadata
	// object.
	recordingFiles, ok := post.GetProp("recording_files").([]interface{})
	if !ok {
		recordingFiles = []interface{}{
			info.FileIDs[0],
		}
	} else {
		recordingFiles = append(recordingFiles, info.FileIDs[0])
	}
	post.AddProp("recording_files", recordingFiles)

	T := p.getTranslationFunc("")

	startAt, _ := post.GetProp("start_at").(int64)
	postMsg := T("app.call.new_recording_message")
	if cfg := p.getConfiguration(); cfg.transcriptionsEnabled() {
		postMsg = T("app.call.new_recording_and_transcription_message")
	}

	if title, _ := post.GetProp("title").(string); title != "" {
		postMsg = fmt.Sprintf("%s of %s at %s UTC", postMsg, title, time.UnixMilli(startAt).Format("3:04PM"))
	}
	recPost := &model.Post{
		UserId:    p.getBotID(),
		ChannelId: callID,
		Message:   postMsg,
		Type:      callRecordingPostType,
		RootId:    threadID,
		FileIds:   []string{info.FileIDs[0]},
	}
	recPost.AddProp("recording_id", info.JobID)
	recPost.AddProp("call_post_id", info.PostID)

	recPost, appErr := p.API.CreatePost(recPost)
	if appErr != nil {
		res.Err = "failed to create post: " + appErr.Error()
		res.Code = http.StatusInternalServerError
		return
	}

	// We update the metadata with the file and post IDs for the recording.
	recordings, ok := post.GetProp("recordings").(map[string]any)
	if ok {
		var rm jobMetadata
		rm.fromMap(recordings[info.JobID])
		rm.FileID = info.FileIDs[0]
		rm.PostID = recPost.Id
		recordings[info.JobID] = rm.toMap()
		post.AddProp("recordings", recordings)
	} else {
		p.LogError("unexpected data found in recordings post prop", "recID", info.JobID)
	}

	_, appErr = p.API.UpdatePost(post)
	if appErr != nil {
		res.Err = "failed to update call thread: " + appErr.Error()
		res.Code = http.StatusInternalServerError
		return
	}

	res.Code = http.StatusOK
	res.Msg = "success"
}

func (p *Plugin) handleBotPostTranscriptions(w http.ResponseWriter, r *http.Request) {
	var res httpResponse
	defer p.httpAudit("handleBotPostTranscription", &res, w, r)

	callID := mux.Vars(r)["call_id"]

	var info public.TranscribingJobInfo
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, requestBodyMaxSizeBytes)).Decode(&info); err != nil {
		res.Err = "failed to decode request body: " + err.Error()
		res.Code = http.StatusBadRequest
		return
	}

	if err := info.IsValid(); err != nil {
		res.Err = err.Error()
		res.Code = http.StatusBadRequest
		return
	}

	// Here we need to lock since we'll be reading and updating the call
	// post, potentially concurrently with other events (e.g. call ending,
	// recording job completing).
	_, err := p.lockCallReturnState(callID)
	if err != nil {
		res.Err = fmt.Errorf("failed to lock call: %w", err).Error()
		res.Code = http.StatusInternalServerError
		return
	}
	defer p.unlockCall(callID)

	// Update call post
	post, err := p.store.GetPost(info.PostID)
	if err != nil {
		res.Err = "failed to get call post: " + err.Error()
		res.Code = http.StatusInternalServerError
		return
	}

	threadID := post.Id

	// Post in thread
	if post.RootId != "" {
		threadID = post.RootId
	}

	// This is a bit hacky but the permissions system doesn't
	// allow non admin users to access files that are not attached to
	// a post, even if the channel id is set.
	// Updating the file to point to the existing call post solves this problem
	// without requiring us to expose a dedicated API nor attach the file which
	// we don't want to show.
	if err := p.store.UpdateFileInfoPostID(info.Transcriptions[0].FileIDs[0], callID, info.PostID); err != nil {
		res.Err = "failed to update fileinfo post and channel ids: " + err.Error()
		res.Code = http.StatusInternalServerError
	}

	T := p.getTranslationFunc("")

	startAt, _ := post.GetProp("start_at").(int64)
	postMsg := T("app.call.new_transcription_message")
	if title, _ := post.GetProp("title").(string); title != "" {
		postMsg = fmt.Sprintf("%s of %s at %s UTC", postMsg, title, time.UnixMilli(startAt).Format("3:04PM"))
	}
	transcriptionPost := &model.Post{
		UserId:    p.getBotID(),
		ChannelId: callID,
		Message:   postMsg,
		Type:      callTranscriptionType,
		RootId:    threadID,
		FileIds:   []string{info.Transcriptions[0].FileIDs[1]},
	}
	transcriptionPost.AddProp("call_post_id", info.PostID)
	transcriptionPost.AddProp("transcription_id", info.JobID)
	transcriptionPost.AddProp("captions", info.Transcriptions.ToClientCaptions())
	trPost, appErr := p.API.CreatePost(transcriptionPost)
	if appErr != nil {
		res.Err = "failed to create post: " + appErr.Error()
		res.Code = http.StatusInternalServerError
		return
	}

	// We update the metadata with the file and post IDs for the transcription.
	transcriptions, ok := post.GetProp("transcriptions").(map[string]any)
	if !ok {
		res.Err = "unexpected data found in transcriptions post prop"
		res.Code = http.StatusInternalServerError
		p.LogError(res.Err, "trID", info.JobID)
		return
	}

	var tm jobMetadata
	tm.fromMap(transcriptions[info.JobID])
	tm.FileID = info.Transcriptions[0].FileIDs[0]
	tm.PostID = trPost.Id
	transcriptions[info.JobID] = tm.toMap()
	post.AddProp("transcriptions", transcriptions)

	// We retrieve the related recording info (if any) so that we can save the file id
	// for the VTT captions in the props of the recording post that will
	// eventually render them on top of the video player.
	recordings, ok := post.GetProp("recordings").(map[string]any)
	if !ok {
		res.Err = "unexpected data found in recordings post prop"
		res.Code = http.StatusInternalServerError
		p.LogError(res.Err, "trID", info.JobID)
		return
	}
	var rm jobMetadata
	rm.fromMap(recordings[tm.RecID])
	if rm.PostID != "" {
		recPost, err := p.store.GetPost(rm.PostID)
		if err != nil {
			res.Err = "failed to get recording post: " + err.Error()
			res.Code = http.StatusInternalServerError
			p.LogError(res.Err, "trID", info.JobID)
			return
		}
		recPost.AddProp("captions", info.Transcriptions.ToClientCaptions())
		if _, appErr := p.API.UpdatePost(recPost); appErr != nil {
			res.Err = "failed to update recording post: " + appErr.Error()
			res.Code = http.StatusInternalServerError
			p.LogError(res.Err, "trID", info.JobID)
			return
		}
	} else {
		p.LogWarn("unexpected missing recording post ID", "trID", info.JobID)
	}

	_, appErr = p.API.UpdatePost(post)
	if appErr != nil {
		res.Err = "failed to update call thread: " + appErr.Error()
		res.Code = http.StatusInternalServerError
		return
	}

	res.Code = http.StatusOK
	res.Msg = "success"
}

func (p *Plugin) handleBotPostJobsStatus(w http.ResponseWriter, r *http.Request) {
	var res httpResponse
	defer p.httpAudit("handleBotPostJobsStatus", &res, w, r)

	callID := mux.Vars(r)["call_id"]
	jobID := mux.Vars(r)["job_id"]

	var status public.JobStatus
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, requestBodyMaxSizeBytes)).Decode(&status); err != nil {
		res.Err = "failed to decode request body: " + err.Error()
		res.Code = http.StatusBadRequest
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
		res.Code = http.StatusBadRequest
		return
	}

	var jb, lcState *public.CallJob
	switch status.JobType {
	case public.JobTypeRecording:
		jb = state.Recording
	case public.JobTypeTranscribing:
		jb = state.Transcription
		if cfg := p.getConfiguration(); cfg != nil && cfg.liveCaptionsEnabled() {
			if lcState, err = state.getLiveCaptions(); err != nil {
				p.LogError("failed to get live captions job", "callID", callID,
					"error", err.Error())
			}
		}
	default:
		res.Err = "invalid job type"
		res.Code = http.StatusBadRequest
		return
	}

	if jb == nil {
		res.Err = "no job ongoing"
		res.Code = http.StatusBadRequest
		return
	}

	if jb.ID != jobID {
		res.Err = "invalid job ID"
		res.Code = http.StatusBadRequest
		return
	}

	if status.Status != public.JobStatusTypeFailed && jb.EndAt > 0 {
		res.Err = "job has ended"
		res.Code = http.StatusBadRequest
		return
	}

	if status.Status == public.JobStatusTypeFailed {
		p.LogDebug("job has failed", "jobID", jobID, "jobType", status.JobType)
		jb.EndAt = time.Now().UnixMilli()
		jb.Props.Err = status.Error

		if status.JobType == public.JobTypeRecording && state.Transcription != nil {
			if err := p.stopTranscribingJob(state, callID); err != nil {
				p.LogError("failed to stop transcribing job", "callID", callID, "err", err.Error())
			}
		} else if status.JobType == public.JobTypeTranscribing && state.Recording != nil {
			if _, _, err := p.stopRecordingJob(state, callID); err != nil {
				p.LogError("failed to stop recording job", "callID", callID, "err", err.Error())
			}
		}
	} else if status.Status == public.JobStatusTypeStarted {
		if jb.StartAt > 0 {
			res.Err = "job has already started"
			res.Code = http.StatusBadRequest
			return
		}
		p.LogDebug("job has started", "jobID", jobID)
		jb.StartAt = time.Now().UnixMilli()

		if lcState != nil {
			// For now we are assuming that if transcriptions are on and live captions are enabled,
			// then the live captioning has started. This can change in the future; if it does, we will
			// only need to change the backend.
			lcState.StartAt = time.Now().UnixMilli()
			if err := p.store.UpdateCallJob(lcState); err != nil {
				res.Err = fmt.Errorf("failed to update call job: %w", err).Error()
				res.Code = http.StatusInternalServerError
				return
			}
		}
	} else {
		res.Err = "unsupported status type"
		res.Code = http.StatusBadRequest
		return
	}

	if err := p.store.UpdateCallJob(jb); err != nil {
		res.Err = fmt.Errorf("failed to update call job: %w", err).Error()
		res.Code = http.StatusInternalServerError
		return
	}

	if status.JobType == public.JobTypeRecording {
		p.publishWebSocketEvent(wsEventCallJobState, map[string]interface{}{
			"callID":   callID,
			"jobState": getClientStateFromCallJob(state.Recording).toMap(),
		}, &WebSocketBroadcast{
			ChannelID:           callID,
			ReliableClusterSend: true,
			UserIDs:             getUserIDsFromSessions(state.sessions),
		})

		// MM-57224: deprecated, remove when not needed by mobile pre 2.14.0
		p.publishWebSocketEvent(wsEventCallRecordingState, map[string]interface{}{
			"callID":   callID,
			"recState": getClientStateFromCallJob(state.Recording).toMap(),
		}, &WebSocketBroadcast{
			ChannelID:           callID,
			ReliableClusterSend: true,
			UserIDs:             getUserIDsFromSessions(state.sessions),
		})
	} else {
		p.publishWebSocketEvent(wsEventCallJobState, map[string]interface{}{
			"callID":   callID,
			"jobState": getClientStateFromCallJob(state.Transcription).toMap(),
		}, &WebSocketBroadcast{
			ChannelID:           callID,
			ReliableClusterSend: true,
			UserIDs:             getUserIDsFromSessions(state.sessions),
		})

		if lcState != nil {
			p.publishWebSocketEvent(wsEventCallJobState, map[string]interface{}{
				"callID":   callID,
				"jobState": getClientStateFromCallJob(state.LiveCaptions).toMap(),
			}, &WebSocketBroadcast{
				ChannelID:           callID,
				ReliableClusterSend: true,
				UserIDs:             getUserIDsFromSessions(state.sessions),
			})
		}
	}

	res.Code = http.StatusOK
	res.Msg = "success"
}

func (p *Plugin) handleBotGetProfileForSession(w http.ResponseWriter, r *http.Request) {
	var res httpResponse
	defer p.httpResponseHandler(&res, w)

	callID := mux.Vars(r)["call_id"]
	sessionID := mux.Vars(r)["session_id"]

	state, err := p.lockCallReturnState(callID)
	if err != nil {
		p.LogError("handleBotGetProfileForSession: failed to lock call", "err", err.Error())
		res.Code = http.StatusInternalServerError
		res.Err = err.Error()
		return
	}
	defer p.unlockCall(callID)

	if state == nil {
		res.Code = http.StatusBadRequest
		res.Err = "no call ongoing"
		return
	}

	ust := state.sessions[sessionID]
	if ust.UserID == "" {
		res.Code = http.StatusNotFound
		res.Err = "not found"
		return
	}

	user, appErr := p.API.GetUser(ust.UserID)
	if appErr != nil {
		res.Code = http.StatusInternalServerError
		res.Err = appErr.Error()
		return
	}

	user.Sanitize(nil)

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(user); err != nil {
		p.LogError(err.Error())
	}
}

func (p *Plugin) handleBotGetFilenameForCall(w http.ResponseWriter, r *http.Request) {
	var res httpResponse
	defer p.httpResponseHandler(&res, w)

	callID := mux.Vars(r)["call_id"]

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(map[string]string{
		"filename": p.genFilenameForCall(callID),
	}); err != nil {
		p.LogError(err.Error())
	}
}
