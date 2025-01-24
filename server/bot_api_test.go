// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/mattermost/mattermost-plugin-calls/server/cluster"
	"github.com/mattermost/mattermost-plugin-calls/server/enterprise"
	"github.com/mattermost/mattermost-plugin-calls/server/public"
	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/plugin"

	serverMocks "github.com/mattermost/mattermost-plugin-calls/server/mocks/github.com/mattermost/mattermost-plugin-calls/server/interfaces"
	pluginMocks "github.com/mattermost/mattermost-plugin-calls/server/mocks/github.com/mattermost/mattermost/server/public/plugin"

	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
)

func TestHandleBotGetProfileForSession(t *testing.T) {
	mockAPI := &pluginMocks.MockAPI{}
	mockMetrics := &serverMocks.MockMetrics{}

	botUserID := model.NewId()

	p := Plugin{
		MattermostPlugin: plugin.MattermostPlugin{
			API: mockAPI,
		},
		metrics: mockMetrics,
		botSession: &model.Session{
			UserId: botUserID,
		},
		callsClusterLocks: map[string]*cluster.Mutex{},
	}

	p.licenseChecker = enterprise.NewLicenseChecker(p.API)

	store, tearDown := NewTestStore(t)
	t.Cleanup(tearDown)
	p.store = store

	mockAPI.On("KVSetWithOptions", mock.Anything, mock.Anything, mock.Anything).Return(true, nil)
	mockMetrics.On("ObserveClusterMutexGrabTime", "mutex_call", mock.AnythingOfType("float64"))
	mockMetrics.On("ObserveAppHandlersTime", mock.AnythingOfType("string"), mock.AnythingOfType("float64"))
	mockMetrics.On("ObserveClusterMutexLockedTime", "mutex_call", mock.AnythingOfType("float64"))
	mockMetrics.On("Handler").Return(nil).Once()

	mockAPI.On("GetConfig").Return(&model.Config{}, nil)
	mockAPI.On("GetLicense").Return(&model.License{
		SkuShortName: "enterprise",
	}, nil)

	apiRouter := p.newAPIRouter()

	t.Run("no call ongoing", func(t *testing.T) {
		defer mockAPI.AssertExpectations(t)
		defer mockMetrics.AssertExpectations(t)

		channelID := model.NewId()
		sessionID := model.NewId()

		mockAPI.On("LogDebug", "creating cluster mutex for call",
			"origin", mock.AnythingOfType("string"), "channelID", channelID).Once()
		mockAPI.On("KVDelete", "mutex_call_"+channelID).Return(nil).Once()

		w := httptest.NewRecorder()
		r := httptest.NewRequest("GET", fmt.Sprintf("/bot/calls/%s/sessions/%s/profile", channelID, sessionID), nil)
		r.Header.Set("Mattermost-User-Id", botUserID)

		apiRouter.ServeHTTP(w, r)

		resp := w.Result()
		require.Equal(t, http.StatusBadRequest, resp.StatusCode)
		var res httpResponse
		err := json.NewDecoder(resp.Body).Decode(&res)
		require.NoError(t, err)
		require.Equal(t, "no call ongoing", res.Msg)
		require.Equal(t, 400, res.Code)
	})

	t.Run("session not found", func(t *testing.T) {
		defer mockAPI.AssertExpectations(t)
		defer mockMetrics.AssertExpectations(t)

		channelID := model.NewId()
		sessionID := model.NewId()
		call := &public.Call{
			ID:        model.NewId(),
			ChannelID: channelID,
			CreateAt:  45,
			StartAt:   45,
			OwnerID:   botUserID,
		}
		err := store.CreateCall(call)
		require.NoError(t, err)

		w := httptest.NewRecorder()
		r := httptest.NewRequest("GET", fmt.Sprintf("/bot/calls/%s/sessions/%s/profile", channelID, sessionID), nil)

		mockAPI.On("LogDebug", "creating cluster mutex for call",
			"origin", mock.AnythingOfType("string"), "channelID", channelID).Once()
		mockAPI.On("KVDelete", "mutex_call_"+channelID).Return(nil).Once()

		r.Header.Set("Mattermost-User-Id", botUserID)
		apiRouter.ServeHTTP(w, r)

		resp := w.Result()
		require.Equal(t, http.StatusNotFound, resp.StatusCode)
		var res httpResponse
		err = json.NewDecoder(resp.Body).Decode(&res)
		require.NoError(t, err)
		require.Equal(t, "not found", res.Msg)
		require.Equal(t, 404, res.Code)
	})

	t.Run("get user error", func(t *testing.T) {
		channelID := model.NewId()
		userID := model.NewId()
		sessionID := model.NewId()
		call := &public.Call{
			ID:        model.NewId(),
			ChannelID: channelID,
			CreateAt:  45,
			StartAt:   45,
			OwnerID:   userID,
		}
		err := store.CreateCall(call)
		require.NoError(t, err)

		err = store.CreateCallSession(&public.CallSession{
			ID:     sessionID,
			CallID: call.ID,
			UserID: userID,
			JoinAt: 45,
		})
		require.NoError(t, err)

		mockAPI.On("GetUser", userID).Return(nil, &model.AppError{
			Message: "failed to get user",
		}).Once()

		w := httptest.NewRecorder()
		r := httptest.NewRequest("GET", "/bot/calls/"+channelID+"/sessions/"+sessionID+"/profile", nil)

		mockAPI.On("LogDebug", "creating cluster mutex for call",
			"origin", mock.AnythingOfType("string"), "channelID", channelID).Once()
		mockAPI.On("KVDelete", "mutex_call_"+channelID).Return(nil).Once()

		r.Header.Set("Mattermost-User-Id", botUserID)
		apiRouter.ServeHTTP(w, r)

		resp := w.Result()
		require.Equal(t, http.StatusInternalServerError, resp.StatusCode)

		var res httpResponse
		err = json.NewDecoder(resp.Body).Decode(&res)
		require.NoError(t, err)
		require.Equal(t, "failed to get user", res.Msg)
		require.Equal(t, 500, res.Code)
	})

	t.Run("success", func(t *testing.T) {
		channelID := model.NewId()
		userID := model.NewId()
		sessionID := model.NewId()
		call := &public.Call{
			ID:        model.NewId(),
			ChannelID: channelID,
			CreateAt:  45,
			StartAt:   45,
			OwnerID:   userID,
		}
		err := store.CreateCall(call)
		require.NoError(t, err)

		err = store.CreateCallSession(&public.CallSession{
			ID:     sessionID,
			CallID: call.ID,
			UserID: userID,
			JoinAt: 45,
		})
		require.NoError(t, err)

		user := &model.User{
			Id:       userID,
			Username: "testuser",
			Email:    "test@example.com",
		}
		mockAPI.On("GetUser", userID).Return(user, nil).Once()

		w := httptest.NewRecorder()
		r := httptest.NewRequest("GET", "/bot/calls/"+channelID+"/sessions/"+sessionID+"/profile", nil)

		mockAPI.On("LogDebug", "creating cluster mutex for call",
			"origin", mock.AnythingOfType("string"), "channelID", channelID).Once()
		mockAPI.On("KVDelete", "mutex_call_"+channelID).Return(nil).Once()

		r.Header.Set("Mattermost-User-Id", botUserID)
		apiRouter.ServeHTTP(w, r)

		resp := w.Result()
		require.Equal(t, http.StatusOK, resp.StatusCode)

		var respUser model.User
		err = json.NewDecoder(resp.Body).Decode(&respUser)
		require.NoError(t, err)
		require.Equal(t, userID, respUser.Id)
		require.Equal(t, user.Username, respUser.Username)
		require.Equal(t, user.Email, respUser.Email)
	})
}
