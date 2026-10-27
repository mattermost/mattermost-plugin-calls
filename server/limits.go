// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"fmt"
	"net/http"

	"github.com/pkg/errors"

	"github.com/mattermost/mattermost-plugin-calls/server/license"

	"github.com/mattermost/mattermost/server/public/model"
)

// cloudStarterMaxParticipantsDefault is set to 8.
// The value used can be overridden by setting the MM_CALLS_MAX_PARTICIPANTS env variable.

const (
	cloudStarterMaxParticipantsDefault = 8
	cloudPaidMaxParticipantsDefault    = 200
	maxAdminsToQueryForNotification    = 25
)

// handleCloudNotifyAdmins notifies the user's admin about upgrading for calls
func (p *Plugin) handleCloudNotifyAdmins(w http.ResponseWriter, r *http.Request) error {
	if !license.IsCloud(p.API.GetLicense()) {
		p.handleErrorWithCode(w, http.StatusBadRequest, "not a cloud server",
			errors.New("not a cloud server, will not notify admins"))
		return nil
	}

	userID := r.Header.Get("Mattermost-User-Id")

	author, err := p.API.GetUser(userID)
	if err != nil {
		return errors.Wrap(err, "unable to find author user")
	}

	admins, err := p.API.GetUsers(&model.UserGetOptions{
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

	maxParticipants := cloudStarterMaxParticipantsDefault
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

	systemBotID, botErr := p.getSystemBotID()
	if botErr != nil {
		return botErr
	}

	for _, admin := range admins {
		channel, err := p.API.GetDirectChannel(admin.Id, systemBotID)
		if err != nil {
			p.LogWarn("failed to get Direct Message channel between user and bot", "user ID", admin.Id, "bot ID", systemBotID, "error", err)
			continue
		}

		post := &model.Post{
			Message:   message,
			UserId:    systemBotID,
			ChannelId: channel.Id,
			Type:      postType,
		}
		model.ParseSlackAttachment(post, attachments)
		if _, err := p.API.CreatePost(post); err != nil {
			p.LogWarn("failed to send a DM to user", "user ID", admin.Id, "error", err)
		}
	}

	w.WriteHeader(http.StatusOK)
	return nil
}

func (p *Plugin) getSystemBotID() (string, error) {
	botID, err := p.API.EnsureBotUser(&model.Bot{
		Username:    model.BotSystemBotUsername,
		DisplayName: "System",
	})
	if err != nil {
		return "", errors.New("failed to ensure system bot")
	}

	return botID, nil
}
