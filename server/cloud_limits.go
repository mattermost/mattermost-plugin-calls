package main

import (
	"encoding/json"
	"fmt"
	"github.com/mattermost/mattermost-server/v6/model"
	"net/http"
)

const cloudMaxParticipants = 8

// JoinAllowed returns true if the user is allowed to join the call, taking into
// account cloud limits
func (p *Plugin) joinAllowed(channelID string, state *channelState) (bool, error) {
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

// handleCloudInfo returns license information that isn't exposed to clients yet
func (p *Plugin) handleCloudInfo(w http.ResponseWriter) {
	license := p.pluginAPI.System.GetLicense()
	if license == nil {
		http.Error(w, "no license", http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	info := map[string]interface{}{
		"sku_short_name": license.SkuShortName,
	}
	if err := json.NewEncoder(w).Encode(info); err != nil {
		p.LogError(err.Error())
		http.Error(w, "error encoding, see internal logs", http.StatusInternalServerError)
	}
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
