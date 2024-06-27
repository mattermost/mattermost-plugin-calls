package main

import (
	"testing"
	"time"

	"github.com/mattermost/mattermost-plugin-calls/server/public"

	serverMocks "github.com/mattermost/mattermost-plugin-calls/server/mocks/github.com/mattermost/mattermost-plugin-calls/server/interfaces"
	pluginMocks "github.com/mattermost/mattermost-plugin-calls/server/mocks/github.com/mattermost/mattermost/server/public/plugin"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/plugin"

	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
)

func TestShouldSendConcurrentSessionsWarning(t *testing.T) {
	mockAPI := &pluginMocks.MockAPI{}
	mockMetrics := &serverMocks.MockMetrics{}

	p := Plugin{
		MattermostPlugin: plugin.MattermostPlugin{
			API: mockAPI,
		},
		metrics: mockMetrics,
	}

	store, tearDown := NewTestStore(t)
	t.Cleanup(tearDown)
	p.store = store

	t.Run("rtcd in use", func(t *testing.T) {
		defer mockAPI.AssertExpectations(t)
		defer mockMetrics.AssertExpectations(t)

		p.rtcdManager = &rtcdClientManager{}

		t.Run("no sessions", func(t *testing.T) {
			ok, err := p.shouldSendConcurrentSessionsWarning(1, time.Second)
			require.NoError(t, err)
			require.False(t, ok)
		})

		t.Run("sessions above threshold", func(t *testing.T) {
			defer ResetTestStore(t, p.store)

			call := &public.Call{
				ID:        model.NewId(),
				CreateAt:  time.Now().UnixMilli(),
				ChannelID: model.NewId(),
				StartAt:   time.Now().UnixMilli(),
				PostID:    model.NewId(),
				ThreadID:  model.NewId(),
				OwnerID:   model.NewId(),
			}
			err := p.store.CreateCall(call)
			require.NoError(t, err)

			err = p.store.CreateCallSession(&public.CallSession{
				ID:     "connA",
				CallID: call.ID,
				UserID: "userA",
				JoinAt: time.Now().UnixMilli(),
			})
			require.NoError(t, err)

			err = p.store.CreateCallSession(&public.CallSession{
				ID:     "connB",
				CallID: call.ID,
				UserID: "userB",
				JoinAt: time.Now().UnixMilli(),
			})
			require.NoError(t, err)

			ok, err := p.shouldSendConcurrentSessionsWarning(1, time.Second)
			require.NoError(t, err)
			require.False(t, ok)
		})
	})

	t.Run("no rtcd", func(t *testing.T) {
		defer mockAPI.AssertExpectations(t)
		defer mockMetrics.AssertExpectations(t)

		p.rtcdManager = nil

		t.Run("no sessions", func(t *testing.T) {
			ok, err := p.shouldSendConcurrentSessionsWarning(1, time.Second)
			require.NoError(t, err)
			require.False(t, ok)
		})

		t.Run("sessions above threshold", func(t *testing.T) {
			defer ResetTestStore(t, p.store)

			mockAPI.On("KVSetWithOptions", "concurrent_sessions_warning", mock.Anything, mock.Anything).Return(true, nil).Once()

			call := &public.Call{
				ID:        model.NewId(),
				CreateAt:  time.Now().UnixMilli(),
				ChannelID: model.NewId(),
				StartAt:   time.Now().UnixMilli(),
				PostID:    model.NewId(),
				ThreadID:  model.NewId(),
				OwnerID:   model.NewId(),
			}
			err := p.store.CreateCall(call)
			require.NoError(t, err)

			err = p.store.CreateCallSession(&public.CallSession{
				ID:     "connA",
				CallID: call.ID,
				UserID: "userA",
				JoinAt: time.Now().UnixMilli(),
			})
			require.NoError(t, err)

			err = p.store.CreateCallSession(&public.CallSession{
				ID:     "connB",
				CallID: call.ID,
				UserID: "userB",
				JoinAt: time.Now().UnixMilli(),
			})
			require.NoError(t, err)

			ok, err := p.shouldSendConcurrentSessionsWarning(1, time.Second)
			require.NoError(t, err)
			require.True(t, ok)
		})

		t.Run("backoff", func(t *testing.T) {
			defer ResetTestStore(t, p.store)

			mockAPI.On("KVSetWithOptions", "concurrent_sessions_warning", mock.Anything, mock.Anything).Return(false, nil).Once()

			call := &public.Call{
				ID:        model.NewId(),
				CreateAt:  time.Now().UnixMilli(),
				ChannelID: model.NewId(),
				StartAt:   time.Now().UnixMilli(),
				PostID:    model.NewId(),
				ThreadID:  model.NewId(),
				OwnerID:   model.NewId(),
			}
			err := p.store.CreateCall(call)
			require.NoError(t, err)

			err = p.store.CreateCallSession(&public.CallSession{
				ID:     "connA",
				CallID: call.ID,
				UserID: "userA",
				JoinAt: time.Now().UnixMilli(),
			})
			require.NoError(t, err)

			ok, err := p.shouldSendConcurrentSessionsWarning(1, time.Second)
			require.NoError(t, err)
			require.False(t, ok)
		})
	})
}

func TestSendConcurrentSessionsWarning(t *testing.T) {
	mockAPI := &pluginMocks.MockAPI{}
	mockMetrics := &serverMocks.MockMetrics{}

	p := Plugin{
		MattermostPlugin: plugin.MattermostPlugin{
			API: mockAPI,
		},
		metrics: mockMetrics,
		botSession: &model.Session{
			UserId: "botID",
		},
	}

	mockAPI.On("LogWarn",
		"The number of active call sessions is high. Consider deploying a dedicated RTCD service.",
		mock.Anything, mock.Anything)

	t.Run("cloud", func(t *testing.T) {
		defer mockAPI.AssertExpectations(t)
		defer mockMetrics.AssertExpectations(t)

		mockAPI.On("GetLicense").Return(&model.License{
			Features: &model.Features{
				Cloud: model.NewBool(true),
			},
		}, nil).Once()

		mockAPI.On("LogWarn",
			"unexpected Cloud license",
			mock.Anything, mock.Anything)

		err := p.sendConcurrentSessionsWarning()
		require.NoError(t, err)
	})

	t.Run("team", func(t *testing.T) {
		defer mockAPI.AssertExpectations(t)
		defer mockMetrics.AssertExpectations(t)

		mockAPI.On("GetLicense").Return(nil).Once()

		mockAPI.On("GetUsers", mock.AnythingOfType("*model.UserGetOptions")).Return([]*model.User{
			{
				Id:     "adminID",
				Locale: "it",
			},
		}, nil).Once()

		mockAPI.On("GetDirectChannel", "adminID", "botID").Return(&model.Channel{
			Id: "channelID",
		}, nil).Once()

		mockAPI.On("IsEnterpriseReady").Return(false).Once()

		mockAPI.On("CreatePost", &model.Post{
			UserId:    "botID",
			ChannelId: "channelID",
			Message:   ":warning: app.admin.concurrent_sessions_warning.intro\r\n\r\napp.admin.concurrent_sessions_warning.team",
		}).Return(&model.Post{Id: "postID"}, nil).Once()

		err := p.sendConcurrentSessionsWarning()
		require.NoError(t, err)
	})

	t.Run("e0", func(t *testing.T) {
		defer mockAPI.AssertExpectations(t)
		defer mockMetrics.AssertExpectations(t)

		mockAPI.On("GetLicense").Return(nil).Once()

		mockAPI.On("GetUsers", mock.AnythingOfType("*model.UserGetOptions")).Return([]*model.User{
			{
				Id:     "adminID",
				Locale: "it",
			},
		}, nil).Once()

		mockAPI.On("GetDirectChannel", "adminID", "botID").Return(&model.Channel{
			Id: "channelID",
		}, nil).Once()

		mockAPI.On("IsEnterpriseReady").Return(true).Once()

		mockAPI.On("CreatePost", &model.Post{
			UserId:    "botID",
			ChannelId: "channelID",
			Message:   ":warning: app.admin.concurrent_sessions_warning.intro\r\n\r\napp.admin.concurrent_sessions_warning.pro_or_e0",
		}).Return(&model.Post{Id: "postID"}, nil).Once()

		err := p.sendConcurrentSessionsWarning()
		require.NoError(t, err)
	})

	t.Run("professional", func(t *testing.T) {
		defer mockAPI.AssertExpectations(t)
		defer mockMetrics.AssertExpectations(t)

		mockAPI.On("GetLicense").Return(&model.License{
			SkuShortName: model.LicenseShortSkuProfessional,
		}, nil).Once()

		mockAPI.On("GetUsers", mock.AnythingOfType("*model.UserGetOptions")).Return([]*model.User{
			{
				Id:     "adminID",
				Locale: "it",
			},
		}, nil).Once()

		mockAPI.On("GetDirectChannel", "adminID", "botID").Return(&model.Channel{
			Id: "channelID",
		}, nil).Once()

		mockAPI.On("CreatePost", &model.Post{
			UserId:    "botID",
			ChannelId: "channelID",
			Message:   ":warning: app.admin.concurrent_sessions_warning.intro\r\n\r\napp.admin.concurrent_sessions_warning.pro_or_e0",
		}).Return(&model.Post{Id: "postID"}, nil).Once()

		err := p.sendConcurrentSessionsWarning()
		require.NoError(t, err)
	})

	t.Run("enterprise", func(t *testing.T) {
		defer mockAPI.AssertExpectations(t)
		defer mockMetrics.AssertExpectations(t)

		mockAPI.On("GetLicense").Return(&model.License{
			SkuShortName: model.LicenseShortSkuEnterprise,
		}, nil).Once()

		mockAPI.On("GetUsers", mock.AnythingOfType("*model.UserGetOptions")).Return([]*model.User{
			{
				Id:     "adminID",
				Locale: "it",
			},
		}, nil).Once()

		mockAPI.On("GetDirectChannel", "adminID", "botID").Return(&model.Channel{
			Id: "channelID",
		}, nil).Once()

		mockAPI.On("CreatePost", &model.Post{
			UserId:    "botID",
			ChannelId: "channelID",
			Message:   ":warning: app.admin.concurrent_sessions_warning.intro\r\n\r\napp.admin.concurrent_sessions_warning.enterprise",
		}).Return(&model.Post{Id: "postID"}, nil).Once()

		err := p.sendConcurrentSessionsWarning()
		require.NoError(t, err)
	})

	t.Run("multiple admins", func(t *testing.T) {
		defer mockAPI.AssertExpectations(t)
		defer mockMetrics.AssertExpectations(t)

		mockAPI.On("GetLicense").Return(nil).Once()

		mockAPI.On("GetUsers", mock.AnythingOfType("*model.UserGetOptions")).Return([]*model.User{
			{
				Id:     "adminIDA",
				Locale: "it",
			},
			{
				Id:     "adminIDB",
				Locale: "it",
			},
		}, nil).Once()

		mockAPI.On("GetDirectChannel", "adminIDA", "botID").Return(&model.Channel{
			Id: "channelIDA",
		}, nil).Once()

		mockAPI.On("GetDirectChannel", "adminIDB", "botID").Return(&model.Channel{
			Id: "channelIDB",
		}, nil).Once()

		mockAPI.On("IsEnterpriseReady").Return(false).Twice()

		mockAPI.On("CreatePost", &model.Post{
			UserId:    "botID",
			ChannelId: "channelIDA",
			Message:   ":warning: app.admin.concurrent_sessions_warning.intro\r\n\r\napp.admin.concurrent_sessions_warning.team",
		}).Return(&model.Post{Id: "postID"}, nil).Once()

		mockAPI.On("CreatePost", &model.Post{
			UserId:    "botID",
			ChannelId: "channelIDB",
			Message:   ":warning: app.admin.concurrent_sessions_warning.intro\r\n\r\napp.admin.concurrent_sessions_warning.team",
		}).Return(&model.Post{Id: "postID"}, nil).Once()

		err := p.sendConcurrentSessionsWarning()
		require.NoError(t, err)
	})
}
