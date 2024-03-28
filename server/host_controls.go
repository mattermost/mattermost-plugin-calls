package main

import (
	"fmt"
	"github.com/mattermost/mattermost/server/public/model"
	"github.com/pkg/errors"
)

func (p *Plugin) changeHost(requesterID, channelID, newHostID string) error {
	if isAdmin := p.API.HasPermissionTo(requesterID, model.PermissionManageSystem); !isAdmin {
		return errors.New("no permissions to change host")
	}

	if newHostID == p.getBotID() {
		return errors.New("cannot assign the bot to be host")
	}

	state, err := p.lockCall(channelID)
	if err != nil {
		return fmt.Errorf("failed to lock call: %w", err)
	}
	defer p.unlockCall(channelID)

	if state == nil || state.Call == nil {
		return errors.New("no call ongoing")
	}

	if state.Call.HostID == newHostID {
		// Host is same, but do we need to host lock?
		if state.Call.HostLockedUserID == "" {
			state.Call.HostLockedUserID = newHostID
			if err := p.kvSetChannelState(channelID, state); err != nil {
				return fmt.Errorf("failed to set channel state: %w", err)
			}
		}
		return nil
	}

	if !state.Call.isUserIDInCall(newHostID) {
		return errors.New("user is not in the call")
	}

	state.Call.HostID = newHostID
	state.Call.HostLockedUserID = newHostID

	if err := p.kvSetChannelState(channelID, state); err != nil {
		return fmt.Errorf("failed to set channel state: %w", err)
	}

	p.publishWebSocketEvent(wsEventCallHostChanged, map[string]interface{}{
		"hostID": newHostID,
	}, &model.WebsocketBroadcast{ChannelId: channelID, ReliableClusterSend: true})

	return nil
}
