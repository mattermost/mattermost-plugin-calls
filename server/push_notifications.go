package main

import (
	"fmt"
	"github.com/mattermost/mattermost/server/public/model"
)

func (p *Plugin) NotificationWillBePushed(notification *model.PushNotification, userID string) (*model.PushNotification, string) {
	// We will use our own notifications if:
	// 1. This is a call start post
	// 2. We have enabled ringing
	// 3. The channel is a DM or GM
	if notification.PostType != "custom_calls" || !*p.getConfiguration().EnableRinging {
		return nil, ""
	}

	channel, appErr := p.API.GetChannel(notification.ChannelId)
	if appErr != nil {
		return nil, ""
	}

	if channel.Type == model.ChannelTypeDirect || channel.Type == model.ChannelTypeGroup {
		return nil, "calls plugin will handle this notification"
	}

	// If it's a regular channel, then the user must have notifications set to all.
	// In that case, make the notification nicer.
	nameFormat := p.getNotificationNameFormat(userID)
	sender, appErr := p.API.GetUser(notification.SenderId)
	if appErr != nil {
		return nil, ""
	}
	senderName := sender.GetDisplayName(nameFormat)
	notification.Message = buildPushNotificationMessage(senderName)

	return notification, ""
}

func buildPushNotificationMessage(senderName string) string {
	// TODO: translations https://mattermost.atlassian.net/browse/MM-54256
	return fmt.Sprintf("\u200b%s is inviting you to a call", senderName)
}
