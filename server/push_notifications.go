package main

import (
	"errors"
	"fmt"

	"github.com/mattermost/mattermost-plugin-calls/server/db"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/shared/i18n"
)

func (p *Plugin) NotificationWillBePushed(notification *model.PushNotification, userID string) (*model.PushNotification, string) {
	// If the user is in a call we suppress notifications for replies to the call thread.
	call, err := p.store.GetActiveCallByChannelID(notification.ChannelId, db.GetCallOpts{})
	if err == nil && call.ThreadID == notification.RootId {
		isUserInCall, err := p.store.IsUserInCall(userID, call.ID, db.GetCallSessionOpts{})
		if err != nil {
			p.LogError("store.IsUserInCall failed", "err", err.Error())
		} else if isUserInCall {
			msg := "calls: suppressing notification on call thread for connected user"
			p.LogDebug(msg, "userID", userID, "channelID", notification.ChannelId, "threadID", call.ThreadID, "callID", call.ID)
			return nil, msg
		}
	} else if err != nil && !errors.Is(err, db.ErrNotFound) {
		p.LogError("store.GetActiveCallByChannelID failed", "err", err.Error())
	}

	// We will use our own notifications if:
	// 1. This is a call start post
	// 2. We have enabled ringing
	// 3. The channel is a DM or GM
	if notification.PostType != callStartPostType || !*p.getConfiguration().EnableRinging {
		return nil, ""
	}

	if notification.ChannelType == model.ChannelTypeDirect || notification.ChannelType == model.ChannelTypeGroup {
		return nil, "calls plugin will handle this notification"
	}

	receiver, appErr := p.API.GetUser(userID)
	if appErr != nil {
		p.LogError("failed to get receiver user", "error", appErr.Error())
		return nil, ""
	}

	// If it's a regular channel, then the user must have notifications set to all.
	// In that case, make the notification nicer.
	if notification.IsIdLoaded {
		notification.Message = buildGenericPushNotificationMessage(receiver.Locale)
		return notification, ""
	}

	nameFormat := p.getNotificationNameFormat(userID)
	sender, appErr := p.API.GetUser(notification.SenderId)
	if appErr != nil {
		p.LogError("failed to get sender user", "error", appErr.Error())
		return nil, ""
	}
	senderName := sender.GetDisplayName(nameFormat)
	notification.Message = buildPushNotificationMessage(senderName, receiver.Locale)

	return notification, ""
}

func (p *Plugin) sendPushNotifications(channelID, createdPostID, threadID string, sender *model.User, config *model.Config) {
	if err := p.canSendPushNotifications(config, p.API.GetLicense()); err != nil {
		return
	}

	channel, appErr := p.API.GetChannel(channelID)
	if appErr != nil {
		p.LogError("failed to get channel", "error", appErr.Error())
		return
	}

	if channel.Type != model.ChannelTypeDirect && channel.Type != model.ChannelTypeGroup {
		return
	}

	members, appErr := p.API.GetUsersInChannel(channelID, model.ChannelSortByUsername, 0, 8)
	if appErr != nil {
		p.LogError("failed to get channel users", "error", appErr.Error())
		return
	}

	for _, member := range members {
		if member.Id == sender.Id {
			continue
		}

		receiver, appErr := p.API.GetUser(member.Id)
		if appErr != nil {
			p.LogError("failed to get receiver user", "error", appErr.Error())
			continue
		}

		msg := &model.PushNotification{
			Version:     model.PushMessageV2,
			Type:        model.PushTypeMessage,
			SubType:     model.PushSubTypeCalls,
			TeamId:      channel.TeamId,
			ChannelId:   channelID,
			PostId:      createdPostID,
			RootId:      threadID,
			SenderId:    sender.Id,
			ChannelType: channel.Type,
			Message:     buildGenericPushNotificationMessage(receiver.Locale),
		}

		// This is ugly because it's a little complicated. We need to special case IdLoaded notifications (don't expose
		// any details of the push notification on the wire). Otherwise, we can send more information, unless the server
		// has set GenericNoChannel.
		if *config.EmailSettings.PushNotificationContents == model.IdLoadedNotification {
			msg.IsIdLoaded = p.checkLicenseForIDLoaded()
		} else {
			nameFormat := p.getNotificationNameFormat(member.Id)
			channelName := getChannelNameForNotification(channel, sender, members, nameFormat, member.Id)
			senderName := sender.GetDisplayName(nameFormat)
			msg.SenderName = senderName
			msg.ChannelName = channelName

			if *config.EmailSettings.PushNotificationContents == model.GenericNoChannelNotification && channel.Type != model.ChannelTypeDirect {
				msg.ChannelName = ""
			}
			if *config.EmailSettings.PushNotificationContents == model.FullNotification {
				msg.Message = buildPushNotificationMessage(senderName, receiver.Locale)
			}
		}

		if err := p.API.SendPushNotification(msg, member.Id); err != nil {
			p.LogError(fmt.Sprintf("failed to send push notification for userID: %s", member.Id), "error", err.Error())
		}
	}
}

func (p *Plugin) checkLicenseForIDLoaded() bool {
	licence := p.API.GetLicense()
	if licence == nil || licence.Features == nil || licence.Features.IDLoadedPushNotifications == nil {
		return false
	}
	return *licence.Features.IDLoadedPushNotifications
}

func buildPushNotificationMessage(senderName, locale string) string {
	T := i18n.GetUserTranslations(locale)
	return fmt.Sprintf("\u200b%s", T("app.push_notification.inviting_message", map[string]any{"SenderName": senderName}))
}

func buildGenericPushNotificationMessage(locale string) string {
	T := i18n.GetUserTranslations(locale)
	return T("app.push_notification.generic_message")
}
