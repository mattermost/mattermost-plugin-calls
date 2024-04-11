package main

import (
	"fmt"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/pkg/errors"
)

func (p *Plugin) changeHost(requesterID, channelID, newHostID string) error {
	state, err := p.lockCallReturnState(channelID)
	if err != nil {
		return fmt.Errorf("failed to lock call: %w", err)
	}
	defer p.unlockCall(channelID)

	if state == nil {
		return errors.New("no call ongoing")
	}

	if requesterID != state.Call.GetHostID() {
		if isAdmin := p.API.HasPermissionTo(requesterID, model.PermissionManageSystem); !isAdmin {
			return errors.New("no permissions to change host")
		}
	}

	if newHostID == p.getBotID() {
		return errors.New("cannot assign the bot to be host")
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
		return errors.New("user is not in the call")
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
