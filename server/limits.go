// Copyright (c) 2022-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"fmt"
	"net/http"
	"os"
	"strconv"
	"time"

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

	// The value of concurrent sessions (globally) that will trigger a warning if the plugin is not using
	// a dedicated rtcd service.
	concurrentSessionsThresholdDefault          = 50
	concurrentSessionsWarningBackoffTimeDefault = 24 * 7 * time.Hour // 1 week
)

func getConcurrentSessionsThreshold() int64 {
	val, err := strconv.Atoi(os.Getenv("MM_CALLS_CONCURRENT_SESSIONS_THRESHOLD"))
	if err != nil {
		return int64(concurrentSessionsThresholdDefault)
	}
	return int64(val)
}

func getConcurrentSessionsWarningBackoffTime() time.Duration {
	val, err := time.ParseDuration(os.Getenv("MM_CALLS_CONCURRENT_SESSIONS_WARNING_BACKOFF_TIME"))
	if err != nil {
		return concurrentSessionsWarningBackoffTimeDefault
	}
	return val
}

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

	p.track(evCallNotifyAdmin, map[string]interface{}{
		"ActualUserID": userID,
		"MessageType":  postType,
	})

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

func (p *Plugin) shouldSendConcurrentSessionsWarning(threshold int64, backoff time.Duration) (bool, error) {
	// Nothing to do if rtcd is being used.
	if p.rtcdManager != nil {
		return false, nil
	}

	// Get the global number of active call sessions.
	count, err := p.store.GetTotalActiveSessions()
	if err != nil {
		return false, fmt.Errorf("failed to get total active sessions: %w", err)
	}

	// We return early if the value is not at or above threshold.
	if count < threshold {
		return false, nil
	}

	// We use the native ExpireAt functionality on KV store to implement a simple backoff mechanism.
	// If this is the first insert or the time has expired we'll be able to perform the set operation.
	// This also ensures only one node will be sending the warning at any given time.
	ok, appErr := p.API.KVSetWithOptions("concurrent_sessions_warning", []byte{1}, model.PluginKVSetOptions{
		Atomic:          true,
		OldValue:        nil,
		ExpireInSeconds: int64(backoff.Seconds()),
	})
	if appErr != nil {
		return false, fmt.Errorf("failed to set kv: %w", appErr)
	}

	if ok {
		return true, nil
	}

	return false, nil
}

func (p *Plugin) sendConcurrentSessionsWarning() error {
	p.LogWarn("The number of active call sessions is high. Consider deploying a dedicated RTCD service.")

	l := p.API.GetLicense()

	// This shouldn't happen since Cloud instances should always be using RTCD.
	if license.IsCloud(l) {
		p.LogWarn("unexpected Cloud license")
		return nil
	}

	admins, appErr := p.API.GetUsers(&model.UserGetOptions{
		Role:    model.SystemAdminRoleId,
		Page:    0,
		PerPage: maxAdminsToQueryForNotification,
	})
	if appErr != nil {
		return fmt.Errorf("failed to get admin users: %w", appErr)
	} else if len(admins) == 0 {
		return fmt.Errorf("no admin user found")
	}

	p.track(evCallConcurrentSessionsWarning, nil)

	botID := p.getBotID()

	for _, admin := range admins {
		dm, appErr := p.API.GetDirectChannel(admin.Id, botID)
		if appErr != nil {
			p.LogError("failed to get dm between admin and bot",
				"userID", admin.Id, "botID", botID, "err", appErr.Error())
			continue
		}

		T := p.getTranslationFunc(admin.Locale)

		msg := T("app.admin.concurrent_sessions_warning.intro")
		msg += "\r\n\r\n"

		if license.IsEnterprise(l) {
			// Enterprise
			msg += T("app.admin.concurrent_sessions_warning.enterprise")
		} else if license.IsProfessional(l) || p.API.IsEnterpriseReady() {
			// Professional or E0
			msg += T("app.admin.concurrent_sessions_warning.pro_or_e0")
		} else {
			// Team edition
			msg += T("app.admin.concurrent_sessions_warning.team")
		}

		post := &model.Post{
			Message:   ":warning: " + msg,
			UserId:    botID,
			ChannelId: dm.Id,
		}

		if _, appErr := p.API.CreatePost(post); appErr != nil {
			p.LogError("failed to create warning post",
				"userID", admin.Id, "botID", botID, "err", appErr.Error())
		}
	}

	return nil
}
