package main

import (
	"fmt"
	"github.com/mattermost/mattermost-server/v6/model"
	"github.com/pkg/errors"
	"net/http"
)

// cloudMaxParticipantsDefault is set to 8.
// The value used can be overridden by setting the MM_CLOUD_MAX_PARTICIPANTS env variable.

const (
	cloudMaxParticipantsDefault     = 8
	maxAdminsToQueryForNotification = 25
)

// handleCloudNotifyAdmins notifies the user's admin about upgrading for calls
func (p *Plugin) handleCloudNotifyAdmins(w http.ResponseWriter, r *http.Request) error {
	license := p.pluginAPI.System.GetLicense()
	if !isCloud(license) {
		p.handleErrorWithCode(w, http.StatusBadRequest, "not a cloud server",
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

	maxParticipants := cloudMaxParticipantsDefault
	cfg := p.getConfiguration()
	if cfg != nil && cfg.MaxCallParticipants != nil {
		maxParticipants = *cfg.MaxCallParticipants
	}

	separator := "\n\n---\n\n"
	postType := "custom_cloud_trial_req"
	message := fmt.Sprintf("@%s requested access to a free trial for Calls.", author.Username)
	title := "Make calls in channels"
	text := fmt.Sprintf("Start a call in a channel. You can include up to %d participants per call.%s[Upgrade now](https://customers.mattermost.com).",
		maxParticipants, separator)

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
		channel, err := p.pluginAPI.Channel.GetDirect(admin.Id, systemBotID)
		if err != nil {
			p.pluginAPI.Log.Warn("failed to get Direct Message channel between user and bot", "user ID", admin.Id, "bot ID", systemBotID, "error", err)
			continue
		}

		post := &model.Post{
			Message:   message,
			UserId:    systemBotID,
			ChannelId: channel.Id,
			Type:      postType,
		}
		model.ParseSlackAttachment(post, attachments)
		if err := p.pluginAPI.Post.CreatePost(post); err != nil {
			p.pluginAPI.Log.Warn("failed to send a DM to user", "user ID", admin.Id, "error", err)
		}
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
