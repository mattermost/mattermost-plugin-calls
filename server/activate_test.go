// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"testing"
	"time"

	pluginMocks "github.com/mattermost/mattermost-plugin-calls/server/mocks/github.com/mattermost/mattermost/server/public/plugin"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/plugin"

	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
)

func TestCreateJobSession(t *testing.T) {
	botUserID := model.NewId()

	t.Run("success", func(t *testing.T) {
		mockAPI := &pluginMocks.MockAPI{}
		p := Plugin{
			MattermostPlugin: plugin.MattermostPlugin{API: mockAPI},
			botSession:       &model.Session{UserId: botUserID},
		}

		returnedSession := &model.Session{
			Id:        model.NewId(),
			UserId:    botUserID,
			Token:     model.NewId(),
			ExpiresAt: time.Now().Add(jobSessionTTL).UnixMilli(),
		}

		mockAPI.On("CreateSession", mock.MatchedBy(func(s *model.Session) bool {
			minExpiry := time.Now().Add(jobSessionTTL - time.Minute).UnixMilli()
			return s.UserId == botUserID && s.ExpiresAt >= minExpiry
		})).Return(returnedSession, nil).Once()

		session, err := p.createJobSession()
		require.NoError(t, err)
		require.NotNil(t, session)
		require.Equal(t, botUserID, session.UserId)
		require.Greater(t, session.ExpiresAt, int64(0))

		mockAPI.AssertExpectations(t)
	})

	t.Run("api error propagated", func(t *testing.T) {
		mockAPI := &pluginMocks.MockAPI{}
		p := Plugin{
			MattermostPlugin: plugin.MattermostPlugin{API: mockAPI},
			botSession:       &model.Session{UserId: botUserID},
		}

		appErr := model.NewAppError("CreateSession", "api.session.create.error", nil, "", 500)
		mockAPI.On("CreateSession", mock.Anything).Return(nil, appErr).Once()

		session, err := p.createJobSession()
		require.Error(t, err)
		require.Nil(t, session)

		mockAPI.AssertExpectations(t)
	})
}
