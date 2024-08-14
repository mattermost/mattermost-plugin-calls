package main

import (
	"testing"
	"time"

	"github.com/mattermost/mattermost-plugin-calls/server/public"

	pluginMocks "github.com/mattermost/mattermost-plugin-calls/server/mocks/github.com/mattermost/mattermost/server/public/plugin"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/plugin"

	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
)

func TestNotificationWillBePushed(t *testing.T) {
	mockAPI := &pluginMocks.MockAPI{}

	store, tearDown := NewTestStore(t)
	t.Cleanup(tearDown)

	p := Plugin{
		MattermostPlugin: plugin.MattermostPlugin{
			API: mockAPI,
		},
		store: store,
	}

	t.Run("not a call post", func(t *testing.T) {
		res, msg := p.NotificationWillBePushed(&model.PushNotification{}, "userID")
		require.Nil(t, res)
		require.Empty(t, msg)
	})

	t.Run("user not in call", func(t *testing.T) {
		channelID := model.NewId()
		threadID := model.NewId()

		err := p.store.CreateCall(&public.Call{
			ID:        model.NewId(),
			CreateAt:  time.Now().UnixMilli(),
			ChannelID: channelID,
			StartAt:   time.Now().UnixMilli(),
			PostID:    model.NewId(),
			ThreadID:  threadID,
			OwnerID:   model.NewId(),
		})
		require.NoError(t, err)

		res, msg := p.NotificationWillBePushed(&model.PushNotification{
			ChannelId: channelID,
			RootId:    threadID,
		}, "userID")
		require.Nil(t, res)
		require.Empty(t, msg)
	})

	t.Run("user in call", func(t *testing.T) {
		defer mockAPI.AssertExpectations(t)

		channelID := model.NewId()
		threadID := model.NewId()
		userID := model.NewId()
		callID := model.NewId()

		err := p.store.CreateCall(&public.Call{
			ID:        callID,
			CreateAt:  time.Now().UnixMilli(),
			ChannelID: channelID,
			StartAt:   time.Now().UnixMilli(),
			PostID:    model.NewId(),
			ThreadID:  threadID,
			OwnerID:   model.NewId(),
		})
		require.NoError(t, err)

		err = p.store.CreateCallSession(&public.CallSession{
			ID:     model.NewId(),
			CallID: callID,
			UserID: userID,
			JoinAt: time.Now().UnixMilli(),
		})
		require.NoError(t, err)

		mockAPI.On("LogDebug", "calls: suppressing notification on call thread for connected user",
			"origin", mock.AnythingOfType("string"),
			"userID", userID, "channelID", channelID, "threadID", threadID, "callID", callID).Once()

		res, msg := p.NotificationWillBePushed(&model.PushNotification{
			ChannelId: channelID,
			RootId:    threadID,
		}, userID)
		require.Nil(t, res)
		require.Equal(t, "calls: suppressing notification on call thread for connected user", msg)
	})

	t.Run("DM/GM ringing", func(t *testing.T) {
		defer mockAPI.AssertExpectations(t)
		var cfg configuration
		cfg.SetDefaults()

		mockAPI.On("GetLicense").Return(&model.License{}, nil).Times(2)
		*cfg.EnableRinging = true
		err := p.setConfiguration(cfg.Clone())
		require.NoError(t, err)
		require.True(t, *p.getConfiguration().EnableRinging)

		t.Run("not a call post", func(t *testing.T) {
			res, msg := p.NotificationWillBePushed(&model.PushNotification{}, "userID")
			require.Nil(t, res)
			require.Empty(t, msg)
		})

		t.Run("call post but ringing disabled", func(t *testing.T) {
			*cfg.EnableRinging = false
			err := p.setConfiguration(cfg.Clone())
			require.NoError(t, err)
			require.False(t, *p.getConfiguration().EnableRinging)

			res, msg := p.NotificationWillBePushed(&model.PushNotification{
				PostType: callStartPostType,
			}, "userID")
			require.Nil(t, res)
			require.Empty(t, msg)
		})

		t.Run("custom notification for DMs/GMs", func(t *testing.T) {
			*cfg.EnableRinging = true
			err := p.setConfiguration(cfg.Clone())
			require.NoError(t, err)
			require.True(t, *p.getConfiguration().EnableRinging)

			res, msg := p.NotificationWillBePushed(&model.PushNotification{
				PostType:    callStartPostType,
				ChannelType: model.ChannelTypeDirect,
			}, "userID")
			require.Nil(t, res)
			require.Equal(t, "calls plugin will handle this notification", msg)

			res, msg = p.NotificationWillBePushed(&model.PushNotification{
				PostType:    callStartPostType,
				ChannelType: model.ChannelTypeGroup,
			}, "userID")
			require.Nil(t, res)
			require.Equal(t, "calls plugin will handle this notification", msg)
		})

		t.Run("regular channel", func(t *testing.T) {
			mockAPI.On("GetUser", "receiverID").Return(&model.User{
				FirstName: "Firstname",
				LastName:  "Lastname",
			}, nil).Twice()

			var serverConfig model.Config
			serverConfig.SetDefaults()
			mockAPI.On("GetConfig").Return(&serverConfig).Once()

			mockAPI.On("GetPreferencesForUser", "receiverID").Return([]model.Preference{}, nil).Once()

			mockAPI.On("GetUser", "senderID").Return(&model.User{
				FirstName: "Sender Firstname",
				LastName:  "Sender Lastname",
			}, nil).Once()

			res, msg := p.NotificationWillBePushed(&model.PushNotification{
				PostType:    callStartPostType,
				ChannelType: model.ChannelTypeOpen,
				SenderId:    "senderID",
			}, "receiverID")
			require.Equal(t, &model.PushNotification{
				PostType:    callStartPostType,
				ChannelType: model.ChannelTypeOpen,
				SenderId:    "senderID",
				Message:     "\u200bapp.push_notification.inviting_message",
			}, res)
			require.Empty(t, msg)

			t.Run("id loaded", func(t *testing.T) {
				res, msg := p.NotificationWillBePushed(&model.PushNotification{
					PostType:    callStartPostType,
					ChannelType: model.ChannelTypeOpen,
					SenderId:    "senderID",
					IsIdLoaded:  true,
				}, "receiverID")
				require.Equal(t, &model.PushNotification{
					PostType:    callStartPostType,
					ChannelType: model.ChannelTypeOpen,
					SenderId:    "senderID",
					IsIdLoaded:  true,
					Message:     "app.push_notification.generic_message",
				}, res)
				require.Empty(t, msg)
			})
		})
	})
}
