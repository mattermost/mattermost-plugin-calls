package main

import (
	"fmt"
	"github.com/mattermost/mattermost-server/v6/model"
)

const cloudMaxParticipants = 8

// JoinAllowed returns true if the user is allowed to join the call, taking into
// account cloud limits
func (p *Plugin) JoinAllowed(channelID string, state *channelState) (bool, error) {
	license := p.pluginAPI.System.GetLicense()

	// Rules are:
	// On-prem: no limits to calls
	// Cloud Starter: DMs 1-1 only
	// Cloud Professional & Cloud Enterprise: DMs 1-1, GMs and Channel calls limited to 8 people.

	if !isCloud(license) {
		return true, nil
	}

	channel, err := p.API.GetChannel(channelID)
	if err != nil {
		return false, fmt.Errorf("get channel failed: %w", err)
	}

	if isCloudStarter(license) {
		return channel.Type == model.ChannelTypeDirect, nil
	}

	// we are cloud paid (starter or enterprise)
	if len(state.Call.Users) >= cloudMaxParticipants {
		return false, nil
	}

	return true, nil
}

func isCloud(license *model.License) bool {
	if license == nil || license.Features == nil || license.Features.Cloud == nil {
		return false
	}

	return *license.Features.Cloud
}

func isCloudStarter(license *model.License) bool {
	return license != nil && license.SkuShortName == "starter"
}
