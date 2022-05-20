package main

import (
	"encoding/json"
	"fmt"
	"github.com/mattermost/mattermost-server/v6/model"
	"github.com/pkg/errors"
	"net/http"
)

const (
	cloudMaxParticipants            = 8
	maxAdminsToQueryForNotification = 1000
)

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
func (p *Plugin) handleCloudInfo(w http.ResponseWriter) error {
	license := p.pluginAPI.System.GetLicense()
	if license == nil {
		p.HandleErrorWithCode(w, http.StatusBadRequest, "no license",
			errors.New("no license found"))
		return nil
	}

	w.Header().Set("Content-Type", "application/json")
	info := map[string]interface{}{
		"sku_short_name": license.SkuShortName,
	}
	if err := json.NewEncoder(w).Encode(info); err != nil {
		return errors.Wrap(err, "error encoding cloud info")
	}

	return nil
}

// handleCloudNotifyAdmins notifies the user's admin about upgrading for calls
func (p *Plugin) handleCloudNotifyAdmins(w http.ResponseWriter, r *http.Request) error {
	license := p.pluginAPI.System.GetLicense()
	if !isCloud(license) {
		p.HandleErrorWithCode(w, http.StatusBadRequest, "not a cloud server",
			errors.New("not a cloud server, will not notify admins"))
		return nil
	}

	userID := r.Header.Get("Mattermost-User-Id")

	author, err := p.pluginAPI.User.Get(userID)
	if err != nil {
		return errors.Wrap(err, "unable to find author user")
	}

	admins, err := p.pluginAPI.User.List(&model.UserGetOptions{
		Role:    model.SystemAdminRoleId,
		Page:    0,
		PerPage: maxAdminsToQueryForNotification,
	})

	if err != nil {
		return errors.Wrap(err, "unable to find all admin users")
	}

	if len(admins) == 0 {
		return fmt.Errorf("no admins found")
	}

	separator := "\n\n---\n\n"
	postType := "custom_cloud_trial_req"
	message := fmt.Sprintf("@%s requested access to a free trial for Calls.", author.Username)
	title := "Make Calls in channels"
	text := "Make Calls in channels with up to 8 people. Make your boss proud. Look shnazzy in formal wear. Be attractive." + separator + "[Upgrade now](https://customers.mattermost.com)."

	attachments := []*model.SlackAttachment{
		{
			Title: title,
			Text:  separator + text,
		},
	}

	systemBotID, err := p.getSystemBotID()
	if err != nil {
		return err
	}

	for _, admin := range admins {
		go func(adminID string) {
			channel, err := p.pluginAPI.Channel.GetDirect(adminID, systemBotID)
			if err != nil {
				p.pluginAPI.Log.Warn("failed to get Direct Message channel between user and bot", "user ID", adminID, "bot ID", systemBotID, "error", err)
				return
			}

			post := &model.Post{
				Message:   message,
				UserId:    systemBotID,
				ChannelId: channel.Id,
				Type:      postType,
			}
			model.ParseSlackAttachment(post, attachments)
			if err := p.pluginAPI.Post.CreatePost(post); err != nil {
				p.pluginAPI.Log.Warn("failed to send a DM to user", "user ID", adminID, "error", err)
			}
		}(admin.Id)
	}

	p.track(evCallNotifyAdmin, map[string]interface{}{
		"ActualUserID": userID,
		"MessageType":  postType,
	})

	w.WriteHeader(http.StatusOK)
	return nil
}

func (p *Plugin) getSystemBotID() (string, error) {
	botID, err := p.pluginAPI.Bot.EnsureBot(&model.Bot{
		Username:    model.BotSystemBotUsername,
		DisplayName: "System",
	})

	if err != nil {
		return "", errors.New("failed to ensure system bot")
	}

	return botID, nil
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
