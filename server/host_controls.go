package main

import (
	"fmt"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/pkg/errors"
)

var (
	ErrNoCallOngoing = errors.New("no call ongoing")
	ErrNoPermissions = errors.New("no permissions")
	ErrNotInCall     = errors.New("requested session or user is not in the call")
	ErrNotAllowed    = errors.New("not allowed")
)

func (p *Plugin) changeHost(requesterID, channelID, newHostID string) error {
	state, err := p.lockCallReturnState(channelID)
	if err != nil {
		return fmt.Errorf("failed to lock call: %w", err)
	}
	defer p.unlockCall(channelID)

	if state == nil {
		return ErrNoCallOngoing
	}

	if requesterID != state.Call.GetHostID() {
		if isAdmin := p.API.HasPermissionTo(requesterID, model.PermissionManageSystem); !isAdmin {
			return ErrNoPermissions
		}
	}

	if newHostID == p.getBotID() {
		return errors.Wrap(ErrNotAllowed, "cannot assign the bot to be host")
	}

	if state.Call.GetHostID() == newHostID {
		// Host is same, but do we need to host lock?
		if state.Call.Props.HostLockedUserID == "" {
			state.Call.Props.HostLockedUserID = newHostID
			if err := p.store.UpdateCall(&state.Call); err != nil {
				return fmt.Errorf("failed to update call: %w", err)
			}
		}
		return nil
	}

	if !state.isUserIDInCall(newHostID) {
		return ErrNotInCall
	}

	state.Call.Props.Hosts = []string{newHostID}
	state.Call.Props.HostLockedUserID = newHostID

	if err := p.store.UpdateCall(&state.Call); err != nil {
		return fmt.Errorf("failed to update call: %w", err)
	}

	p.publishWebSocketEvent(wsEventCallHostChanged, map[string]interface{}{
		"hostID": newHostID,
	}, &model.WebsocketBroadcast{ChannelId: channelID, ReliableClusterSend: true})

	return nil
}

func (p *Plugin) muteSession(requesterID, channelID, sessionID string) error {
	state, err := p.getCallState(channelID, false)
	if err != nil {
		return err
	}

	if state == nil {
		return ErrNoCallOngoing
	}

	if requesterID != state.Call.GetHostID() {
		if isAdmin := p.API.HasPermissionTo(requesterID, model.PermissionManageSystem); !isAdmin {
			return ErrNoPermissions
		}
	}

	ust, ok := state.sessions[sessionID]
	if !ok {
		return ErrNotInCall
	}

	if !ust.Unmuted {
		return nil
	}

	p.publishWebSocketEvent(wsEventHostMute, map[string]interface{}{
		"channel_id": channelID,
		"session_id": sessionID,
	}, &model.WebsocketBroadcast{UserId: ust.UserID, ReliableClusterSend: true})

	return nil
}

func (p *Plugin) screenOff(requesterID, channelID, sessionID string) error {
	state, err := p.getCallState(channelID, false)
	if err != nil {
		return err
	}

	if state == nil {
		return ErrNoCallOngoing
	}

	if requesterID != state.Call.GetHostID() {
		if isAdmin := p.API.HasPermissionTo(requesterID, model.PermissionManageSystem); !isAdmin {
			return ErrNoPermissions
		}
	}

	if state.Props.ScreenSharingSessionID != sessionID {
		return nil
	}

	ust, ok := state.sessions[sessionID]
	if !ok {
		return ErrNotInCall
	}

	p.publishWebSocketEvent(wsEventHostScreenOff, map[string]interface{}{
		"channel_id": channelID,
		"session_id": sessionID,
	}, &model.WebsocketBroadcast{UserId: ust.UserID, ReliableClusterSend: true})

	return nil
}

func (p *Plugin) lowerHand(requesterID, channelID, sessionID string) error {
	state, err := p.getCallState(channelID, false)
	if err != nil {
		return err
	}

	if state == nil {
		return ErrNoCallOngoing
	}

	if requesterID != state.Call.GetHostID() {
		if isAdmin := p.API.HasPermissionTo(requesterID, model.PermissionManageSystem); !isAdmin {
			return ErrNoPermissions
		}
	}

	ust, ok := state.sessions[sessionID]
	if !ok {
		return ErrNotInCall
	}

	if ust.RaisedHand == 0 {
		return nil
	}

	p.publishWebSocketEvent(wsEventHostLowerHand, map[string]interface{}{
		"call_id":    state.Call.ID,
		"channel_id": channelID,
		"session_id": sessionID,
		"host_id":    requesterID,
	}, &model.WebsocketBroadcast{UserId: ust.UserID, ReliableClusterSend: true})

	return nil
}

func (p *Plugin) hostRemoveSession(requesterID, channelID, sessionID string) error {
	state, err := p.getCallState(channelID, false)
	if err != nil {
		return err
	}

	if state == nil {
		return ErrNoCallOngoing
	}

	if requesterID != state.Call.GetHostID() {
		if isAdmin := p.API.HasPermissionTo(requesterID, model.PermissionManageSystem); !isAdmin {
			return ErrNoPermissions
		}
	}

	ust, ok := state.sessions[sessionID]
	if !ok {
		return ErrNotInCall
	}

	handlerID, err := p.getHandlerID()
	if err != nil {
		p.LogError(err.Error())
		handlerID = state.Call.Props.NodeID
	}

	if err := p.closeRTCSession(ust.UserID, sessionID, channelID, handlerID, state.Call.ID); err != nil {
		p.LogError(err.Error())
	}

	p.publishWebSocketEvent(wsEventHostRemoved, map[string]interface{}{
		"call_id":    state.Call.ID,
		"channel_id": channelID,
		"session_id": sessionID,
	}, &model.WebsocketBroadcast{UserId: ust.UserID, ReliableClusterSend: true})

	return nil
}
