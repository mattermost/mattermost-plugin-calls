// Copyright (c) 2022-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"time"

	"github.com/mattermost/mattermost-plugin-calls/server/public"

	"github.com/mattermost/mattermost/server/public/model"
)

var (
	botChRE                = regexp.MustCompile(`^\/bot\/channels\/([a-z0-9]+)$`)
	botUserImageRE         = regexp.MustCompile(`^\/bot\/users\/([a-z0-9]+)\/image$`)
	botUploadsRE           = regexp.MustCompile(`^\/bot\/uploads\/?([a-z0-9]+)?$`)
	botRecordingsRE        = regexp.MustCompile(`^\/bot\/calls\/([a-z0-9]+)\/recordings$`)
	botJobsStatusRE        = regexp.MustCompile(`^\/bot\/calls\/([a-z0-9]+)\/jobs\/([a-z0-9]+)\/status$`)
	botProfileForSessionRE = regexp.MustCompile(`^\/bot\/calls\/([a-z0-9]+)\/sessions\/([a-z0-9]+)\/profile$`)
	botTranscriptionsRE    = regexp.MustCompile(`^\/bot\/calls\/([a-z0-9]+)\/transcriptions$`)
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

func (p *Plugin) handleBotGetChannel(w http.ResponseWriter, _ *http.Request, channelID string) {
	channel, appErr := p.API.GetChannel(channelID)
	if appErr != nil {
		p.LogError(appErr.Error())
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(channel); err != nil {
		p.LogError(err.Error())
	}
}

func (p *Plugin) handleBotGetUserImage(w http.ResponseWriter, r *http.Request, userID string) {
	data, appErr := p.API.GetProfileImage(userID)
	if appErr != nil {
		p.LogError(appErr.Error())
		http.NotFound(w, r)
	}

	http.ServeContent(w, r, userID, time.Now(), bytes.NewReader(data))
}

func (p *Plugin) handleBotGetUpload(w http.ResponseWriter, _ *http.Request, uploadID string) {
	var res httpResponse
	defer p.httpResponseHandler(&res, w)

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

func (p *Plugin) handleBotUploadData(w http.ResponseWriter, r *http.Request, uploadID string) {
	var res httpResponse
	defer p.httpAudit("handleBotUploadData", &res, w, r)

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

func (p *Plugin) handleBotPostRecordings(w http.ResponseWriter, r *http.Request, callID string) {
	var res httpResponse
	defer p.httpAudit("handleBotPostRecordings", &res, w, r)

	var info public.JobInfo
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

	// Update call post
	post, appErr := p.API.GetPost(info.PostID)
	if appErr != nil {
		res.Err = "failed to get call post: " + appErr.Error()
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
			info.FileID,
		}
	} else {
		recordingFiles = append(recordingFiles, info.FileID)
	}
	post.AddProp("recording_files", recordingFiles)

	startAt, _ := post.GetProp("start_at").(int64)
	postMsg := "Here's the call recording"
	if cfg := p.getConfiguration(); cfg.transcriptionsEnabled() {
		postMsg = "Here's the call recording. Transcription is processing and will be posted when ready."
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
		FileIds:   []string{info.FileID},
	}
	recPost.AddProp("recording_id", info.JobID)
	recPost.AddProp("call_post_id", info.PostID)

	recPost, appErr = p.API.CreatePost(recPost)
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
		rm.FileID = info.FileID
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

func (p *Plugin) handleBotPostTranscriptions(w http.ResponseWriter, r *http.Request, callID string) {
	var res httpResponse
	defer p.httpAudit("handleBotPostTranscription", &res, w, r)

	var info public.JobInfo
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

	// Update call post
	post, appErr := p.API.GetPost(info.PostID)
	if appErr != nil {
		res.Err = "failed to get call post: " + appErr.Error()
		res.Code = http.StatusInternalServerError
		return
	}

	threadID := post.Id

	// Post in thread
	if post.RootId != "" {
		threadID = post.RootId
	}

	// We update the metadata with the file ID for the transcription.
	transcriptions, ok := post.GetProp("transcriptions").(map[string]any)
	if ok {
		var tm jobMetadata
		tm.fromMap(transcriptions[info.JobID])
		tm.FileID = info.FileID
		transcriptions[info.JobID] = tm.toMap()
		post.AddProp("transcriptions", transcriptions)
	} else {
		p.LogError("unexpected data found in transcriptions post prop", "trID", info.JobID)
	}

	startAt, _ := post.GetProp("start_at").(int64)
	postMsg := "Here's the call transcription"
	if title, _ := post.GetProp("title").(string); title != "" {
		postMsg = fmt.Sprintf("%s of %s at %s UTC", postMsg, title, time.UnixMilli(startAt).Format("3:04PM"))
	}
	transcriptionPost := &model.Post{
		UserId:    p.getBotID(),
		ChannelId: callID,
		Message:   postMsg,
		Type:      "custom_calls_transcription",
		RootId:    threadID,
		FileIds:   []string{info.FileID},
	}
	transcriptionPost.AddProp("call_post_id", info.PostID)
	transcriptionPost.AddProp("transcription_id", info.JobID)
	_, appErr = p.API.CreatePost(transcriptionPost)
	if appErr != nil {
		res.Err = "failed to create post: " + appErr.Error()
		res.Code = http.StatusInternalServerError
		return
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

func (p *Plugin) handleBotPostJobsStatus(w http.ResponseWriter, r *http.Request, callID, jobID string) {
	var res httpResponse
	defer p.httpAudit("handleBotPostJobsStatus", &res, w, r)

	var status public.JobStatus
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, requestBodyMaxSizeBytes)).Decode(&status); err != nil {
		res.Err = "failed to decode request body: " + err.Error()
		res.Code = http.StatusBadRequest
		return
	}

	state, err := p.lockCall(callID)
	if err != nil {
		res.Err = fmt.Errorf("failed to lock call: %w", err).Error()
		res.Code = http.StatusInternalServerError
		return
	}
	defer p.unlockCall(callID)

	if state == nil || state.Call == nil {
		res.Err = "no call ongoing"
		res.Code = http.StatusBadRequest
		return
	}

	var jb *jobState
	switch status.JobType {
	case public.JobTypeRecording:
		jb = state.Call.Recording
	case public.JobTypeTranscribing:
		jb = state.Call.Transcription
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
		jb.Err = status.Error

		if status.JobType == public.JobTypeRecording && state.Call.Transcription != nil {
			if err := p.stopTranscribingJob(state, callID); err != nil {
				p.LogError("failed to stop transcribing job", "callID", callID, "err", err.Error())
			}
		} else if status.JobType == public.JobTypeTranscribing && state.Call.Recording != nil {
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
	} else {
		res.Err = "unsupported status type"
		res.Code = http.StatusBadRequest
		return
	}

	if err := p.kvSetChannelState(callID, state); err != nil {
		res.Err = fmt.Errorf("failed to set channel state: %w", err).Error()
		res.Code = http.StatusInternalServerError
		return
	}

	if status.JobType == public.JobTypeRecording {
		p.publishWebSocketEvent(wsEventCallRecordingState, map[string]interface{}{
			"callID":   callID,
			"recState": state.Call.Recording.getClientState().toMap(),
		}, &model.WebsocketBroadcast{ChannelId: callID, ReliableClusterSend: true})
	} else {
		p.publishWebSocketEvent(wsEventCallTranscriptionState, map[string]interface{}{
			"callID":  callID,
			"trState": state.Call.Transcription.getClientState().toMap(),
		}, &model.WebsocketBroadcast{ChannelId: callID, ReliableClusterSend: true})
	}

	res.Code = http.StatusOK
	res.Msg = "success"
}

func (p *Plugin) handleBotGetProfileForSession(w http.ResponseWriter, callID, sessionID string) {
	var res httpResponse
	defer p.httpResponseHandler(&res, w)

	state, err := p.lockCall(callID)
	if err != nil {
		p.LogError("handleBotGetProfileForSession: failed to lock call", "err", err.Error())
		res.Code = http.StatusInternalServerError
		res.Err = err.Error()
		return
	}
	defer p.unlockCall(callID)

	if state == nil || state.Call == nil {
		res.Code = http.StatusBadRequest
		res.Err = "no call ongoing"
		return
	}

	ust := state.Call.Sessions[sessionID]
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

func (p *Plugin) handleBotAPI(w http.ResponseWriter, r *http.Request) {
	if !p.licenseChecker.RecordingsAllowed() {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}

	if !p.isBotSession(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	if r.Method == http.MethodGet {
		if matches := botChRE.FindStringSubmatch(r.URL.Path); len(matches) == 2 {
			p.handleBotGetChannel(w, r, matches[1])
			return
		}

		if matches := botUserImageRE.FindStringSubmatch(r.URL.Path); len(matches) == 2 {
			p.handleBotGetUserImage(w, r, matches[1])
			return
		}

		if matches := botUploadsRE.FindStringSubmatch(r.URL.Path); len(matches) == 2 && matches[1] != "" {
			p.handleBotGetUpload(w, r, matches[1])
			return
		}

		if matches := botProfileForSessionRE.FindStringSubmatch(r.URL.Path); len(matches) == 3 {
			p.handleBotGetProfileForSession(w, matches[1], matches[2])
			return
		}
	}

	if r.Method == http.MethodPost {
		if r.URL.Path == "/bot/uploads" {
			p.handleBotCreateUpload(w, r)
			return
		} else if matches := botUploadsRE.FindStringSubmatch(r.URL.Path); len(matches) == 2 && matches[1] != "" {
			p.handleBotUploadData(w, r, matches[1])
			return
		}

		if matches := botRecordingsRE.FindStringSubmatch(r.URL.Path); len(matches) == 2 {
			p.handleBotPostRecordings(w, r, matches[1])
			return
		}

		if matches := botJobsStatusRE.FindStringSubmatch(r.URL.Path); len(matches) == 3 {
			p.handleBotPostJobsStatus(w, r, matches[1], matches[2])
			return
		}

		if matches := botTranscriptionsRE.FindStringSubmatch(r.URL.Path); len(matches) == 2 {
			p.handleBotPostTranscriptions(w, r, matches[1])
			return
		}
	}

	http.NotFound(w, r)
}
