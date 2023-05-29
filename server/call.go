// Copyright (c) 2022-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"fmt"
	"time"

	"github.com/mattermost/mattermost-server/v6/model"
)

type CallStartRequest struct {
	ChannelID string `json:"channel_id"`
	Title     string `json:"title,omitempty"`
	ThreadID  string `json:"thread_id,omitempty"`
}

func (r CallStartRequest) IsValid() error {
	if r.ChannelID == "" {
		return fmt.Errorf("ChannelID should not be empty")
	}

	return nil
}

func (p *Plugin) getChannelForCall(userID string, req CallStartRequest) (*model.Channel, error) {
	// We should go through only if the user has permissions to the requested channel
	// or if the user is the Calls bot.
	if !(p.isBot(userID) || p.API.HasPermissionToChannel(userID, req.ChannelID, model.PermissionCreatePost)) {
		return nil, fmt.Errorf("forbidden")
	}
	channel, appErr := p.API.GetChannel(req.ChannelID)
	if appErr != nil {
		return nil, appErr
	}
	if channel.DeleteAt > 0 {
		return nil, fmt.Errorf("cannot join call in archived channel")
	}

	if req.ThreadID != "" {
		post, appErr := p.API.GetPost(req.ThreadID)
		if appErr != nil {
			return nil, appErr
		}

		if post.ChannelId != req.ChannelID {
			return nil, fmt.Errorf("forbidden")
		}

		if post.DeleteAt > 0 {
			return nil, fmt.Errorf("cannot attach call to deleted thread")
		}

		if post.RootId != "" {
			return nil, fmt.Errorf("thread is not a root post")
		}
	}

	return channel, nil
}

func (p *Plugin) startCall(userID string, req CallStartRequest) error {
	if err := req.IsValid(); err != nil {
		return fmt.Errorf("failed to validate call start request: %w", err)
	}

	channel, err := p.getChannelForCall(userID, req)
	if err != nil {
		return fmt.Errorf("failed to get channel for call: %w", err)
	}

	var call *callState
	err = p.kvSetAtomicChannelState(req.ChannelID, func(state *channelState) (*channelState, error) {
		if state == nil {
			state = &channelState{}
		} else if !p.userCanStartOrJoin(userID, state) {
			return nil, fmt.Errorf("calls are not enabled")
		}

		if state.Call != nil {
			return nil, fmt.Errorf("call already ongoing")
		}

		call = &callState{
			ID:       model.NewId(),
			ThreadID: req.ThreadID,
			StartAt:  time.Now().UnixMilli(),
			Users:    make(map[string]*userState),
			Sessions: make(map[string]struct{}),
			OwnerID:  userID,
		}
		state.Call = call
		state.NodeID = p.nodeID

		if p.rtcdManager != nil {
			host, err := p.rtcdManager.GetHostForNewCall()
			if err != nil {
				return nil, fmt.Errorf("failed to get rtcd host: %w", err)
			}
			p.LogDebug("rtcd host has been assigned to call", "host", host)
			state.Call.RTCDHost = host
		}

		return state, nil
	})
	if err != nil {
		return fmt.Errorf("failed to start call: %w", err)
	}

	if err := p.handleCallStarted(call, req, channel); err != nil {
		p.LogError(err.Error())
	}

	return nil
}

func (p *Plugin) handleCallStarted(call *callState, req CallStartRequest, channel *model.Channel) error {
	p.track(evCallStarted, map[string]interface{}{
		"OwnerID":     call.OwnerID,
		"CallID":      call.ID,
		"ChannelID":   channel.Id,
		"ChannelType": channel.Type,
	})

	// new call has started
	// If this is TestMode (DefaultEnabled=false) and sysadmin, send an ephemeral message
	cfg := p.getConfiguration()
	if cfg.DefaultEnabled != nil && !*cfg.DefaultEnabled &&
		p.API.HasPermissionTo(call.OwnerID, model.PermissionManageSystem) {
		p.pluginAPI.Post.SendEphemeralPost(
			call.OwnerID,
			&model.Post{
				UserId:    p.botSession.UserId,
				ChannelId: channel.Id,
				Message:   "Currently calls are not enabled for non-admin users. You can change the setting through the system console",
			},
		)
	}

	postID, threadID, err := p.startNewCallPost(call.OwnerID, channel.Id, call.StartAt, req.Title, req.ThreadID)
	if err != nil {
		return err
	}

	// TODO: send all the info attached to a call.
	p.publishWebSocketEvent(wsEventCallStart, map[string]interface{}{
		"channelID": channel.Id,
		"start_at":  call.StartAt,
		"thread_id": threadID,
		"post_id":   postID,
		"owner_id":  call.OwnerID,
		"host_id":   call.HostID,
	}, &model.WebsocketBroadcast{ChannelId: channel.Id, ReliableClusterSend: true})

	return nil
}

func (p *Plugin) endCall(userID, channelID string) error {
	state, err := p.kvGetChannelState(channelID)
	if err != nil {
		return fmt.Errorf("failed to get state: %w", err)
	}

	if state == nil || state.Call == nil {
		return fmt.Errorf("no call ongoing")
	}

	isAdmin := p.API.HasPermissionTo(userID, model.PermissionManageSystem)
	if !isAdmin && state.Call.OwnerID != userID {
		return fmt.Errorf("no permissions to end the call")
	}

	var hasEnded bool
	callID := state.Call.ID

	if err := p.kvSetAtomicChannelState(channelID, func(state *channelState) (*channelState, error) {
		if state == nil || state.Call == nil {
			return nil, nil
		}

		if state.Call.ID != callID {
			return nil, fmt.Errorf("previous call has ended and new one has started")
		}

		if state.Call.EndAt == 0 {
			state.Call.EndAt = time.Now().UnixMilli()
		}

		if len(state.Call.Users) == 0 {
			state.Call = nil
			hasEnded = true
		}

		return state, nil
	}); err != nil {
		return fmt.Errorf("failed to set state: %w", err)
	}

	if _, err := p.updateCallPostEnded(state.Call.PostID); err != nil {
		p.LogError(err.Error())
	}
	p.publishWebSocketEvent(wsEventCallEnd, map[string]interface{}{}, &model.WebsocketBroadcast{ChannelId: channelID, ReliableClusterSend: true})

	if hasEnded {
		return nil
	}

	go func() {
		// We wait a few seconds for the call to end cleanly. If this doesn't
		// happen we force end it.
		time.Sleep(5 * time.Second)

		state, err := p.kvGetChannelState(channelID)
		if err != nil {
			p.LogError(err.Error())
			return
		}
		if state == nil || state.Call == nil || state.Call.ID != callID {
			return
		}

		p.LogInfo("call state is still in store, force ending it", "channelID", channelID)

		if state.Call.Recording != nil && state.Call.Recording.EndAt == 0 {
			p.LogInfo("recording is in progress, force ending it", "channelID", channelID, "jobID", state.Call.Recording.JobID)

			if err := p.jobService.StopJob(state.Call.Recording.JobID); err != nil {
				p.LogError("failed to stop recording job", "error", err.Error(), "channelID", channelID, "jobID", state.Call.Recording.JobID)
			}
		}

		for connID := range state.Call.Sessions {
			if err := p.closeRTCSession(userID, connID, channelID, state.NodeID); err != nil {
				p.LogError(err.Error())
			}
		}

		if err := p.cleanCallState(channelID); err != nil {
			p.LogError(err.Error())
		}
	}()

	return nil
}
