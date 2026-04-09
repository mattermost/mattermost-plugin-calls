// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"golang.org/x/time/rate"

	"github.com/mattermost/mattermost-plugin-calls/server/enterprise"
	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/plugin"

	serverMocks "github.com/mattermost/mattermost-plugin-calls/server/mocks/github.com/mattermost/mattermost-plugin-calls/server/interfaces"
	pluginMocks "github.com/mattermost/mattermost-plugin-calls/server/mocks/github.com/mattermost/mattermost/server/public/plugin"

	"github.com/livekit/protocol/auth"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
)

func TestHandleGetLiveKitToken(t *testing.T) {
	mockAPI := &pluginMocks.MockAPI{}
	mockMetrics := &serverMocks.MockMetrics{}

	p := Plugin{
		MattermostPlugin: plugin.MattermostPlugin{
			API: mockAPI,
		},
		metrics:     mockMetrics,
		apiLimiters: map[string]*rate.Limiter{},
	}

	p.licenseChecker = enterprise.NewLicenseChecker(p.API)

	mockMetrics.On("Handler").Return(nil).Once()
	mockMetrics.On("ObserveAppHandlersTime", mock.AnythingOfType("string"), mock.AnythingOfType("float64"))

	mockAPI.On("GetConfig").Return(&model.Config{}, nil)
	mockAPI.On("GetLicense").Return(&model.License{
		SkuShortName: "enterprise",
	}, nil)

	// Audit log
	mockAPI.On("LogDebug", "handleGetLiveKitToken",
		"origin", mock.AnythingOfType("string"), mock.Anything, mock.Anything, mock.Anything,
		mock.Anything, mock.Anything, mock.Anything, mock.Anything,
		mock.Anything, mock.Anything, mock.Anything, mock.Anything,
		mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything)

	apiRouter := p.newAPIRouter()

	t.Run("missing channel_id", func(t *testing.T) {
		userID := model.NewId()

		w := httptest.NewRecorder()
		r := httptest.NewRequest("GET", "/livekit-token", nil)
		r.Header.Set("Mattermost-User-Id", userID)

		apiRouter.ServeHTTP(w, r)

		resp := w.Result()
		require.Equal(t, http.StatusBadRequest, resp.StatusCode)
		var res httpResponse
		err := json.NewDecoder(resp.Body).Decode(&res)
		require.NoError(t, err)
		require.Equal(t, "channel_id is required", res.Msg)
	})

	t.Run("no channel permission", func(t *testing.T) {
		userID := model.NewId()
		channelID := model.NewId()

		mockAPI.On("HasPermissionToChannel", userID, channelID, model.PermissionReadChannel).Return(false).Once()

		w := httptest.NewRecorder()
		r := httptest.NewRequest("GET", fmt.Sprintf("/livekit-token?channel_id=%s", channelID), nil)
		r.Header.Set("Mattermost-User-Id", userID)

		apiRouter.ServeHTTP(w, r)

		resp := w.Result()
		require.Equal(t, http.StatusForbidden, resp.StatusCode)
		var res httpResponse
		err := json.NewDecoder(resp.Body).Decode(&res)
		require.NoError(t, err)
		require.Equal(t, "Forbidden", res.Msg)
	})

	t.Run("livekit not configured", func(t *testing.T) {
		userID := model.NewId()
		channelID := model.NewId()

		mockAPI.On("HasPermissionToChannel", userID, channelID, model.PermissionReadChannel).Return(true).Once()
		mockAPI.On("LoadPluginConfiguration", mock.AnythingOfType("*main.configuration")).Return(nil).Once()

		w := httptest.NewRecorder()
		r := httptest.NewRequest("GET", fmt.Sprintf("/livekit-token?channel_id=%s", channelID), nil)
		r.Header.Set("Mattermost-User-Id", userID)

		apiRouter.ServeHTTP(w, r)

		resp := w.Result()
		require.Equal(t, http.StatusInternalServerError, resp.StatusCode)
		var res httpResponse
		err := json.NewDecoder(resp.Body).Decode(&res)
		require.NoError(t, err)
		require.Equal(t, "LiveKit is not configured", res.Msg)
	})

	t.Run("get user error", func(t *testing.T) {
		userID := model.NewId()
		channelID := model.NewId()

		cfg := &configuration{}
		cfg.SetDefaults()
		cfg.LiveKitURL = "wss://lk.example.com"
		cfg.LiveKitAPIKey = "testkey"
		cfg.LiveKitAPISecret = "testsecret"
		p.configuration = cfg

		mockAPI.On("HasPermissionToChannel", userID, channelID, model.PermissionReadChannel).Return(true).Once()
		mockAPI.On("GetUser", userID).Return(nil, &model.AppError{
			Message: "user not found",
		}).Once()

		w := httptest.NewRecorder()
		r := httptest.NewRequest("GET", fmt.Sprintf("/livekit-token?channel_id=%s", channelID), nil)
		r.Header.Set("Mattermost-User-Id", userID)

		apiRouter.ServeHTTP(w, r)

		resp := w.Result()
		require.Equal(t, http.StatusInternalServerError, resp.StatusCode)
		var res httpResponse
		err := json.NewDecoder(resp.Body).Decode(&res)
		require.NoError(t, err)
		require.Contains(t, res.Msg, "user not found")
	})

	t.Run("success", func(t *testing.T) {
		userID := model.NewId()
		channelID := model.NewId()

		cfg := &configuration{}
		cfg.SetDefaults()
		cfg.LiveKitURL = "wss://lk.example.com"
		cfg.LiveKitAPIKey = "testkey"
		cfg.LiveKitAPISecret = "testsecret"
		p.configuration = cfg

		user := &model.User{
			Id:        userID,
			Username:  "testuser",
			FirstName: "Test",
			LastName:  "User",
		}

		mockAPI.On("HasPermissionToChannel", userID, channelID, model.PermissionReadChannel).Return(true).Once()
		mockAPI.On("GetUser", userID).Return(user, nil).Once()

		w := httptest.NewRecorder()
		r := httptest.NewRequest("GET", fmt.Sprintf("/livekit-token?channel_id=%s", channelID), nil)
		r.Header.Set("Mattermost-User-Id", userID)

		apiRouter.ServeHTTP(w, r)

		resp := w.Result()
		require.Equal(t, http.StatusOK, resp.StatusCode)

		var tokenResp map[string]string
		err := json.NewDecoder(resp.Body).Decode(&tokenResp)
		require.NoError(t, err)
		require.Equal(t, "wss://lk.example.com", tokenResp["url"])
		require.NotEmpty(t, tokenResp["token"])

		// Verify the JWT claims
		verifier, err := auth.ParseAPIToken(tokenResp["token"])
		require.NoError(t, err)
		require.Equal(t, "testkey", verifier.APIKey())
		require.Equal(t, userID, verifier.Identity())

		_, claims, err := verifier.Verify("testsecret")
		require.NoError(t, err)
		require.Equal(t, "Test User", claims.Name)
		require.NotNil(t, claims.Video)
		require.True(t, claims.Video.RoomJoin)
		require.Equal(t, channelID, claims.Video.Room)
	})

	t.Run("unauthenticated", func(t *testing.T) {
		channelID := model.NewId()

		w := httptest.NewRecorder()
		r := httptest.NewRequest("GET", fmt.Sprintf("/livekit-token?channel_id=%s", channelID), nil)

		apiRouter.ServeHTTP(w, r)

		resp := w.Result()
		require.Equal(t, http.StatusUnauthorized, resp.StatusCode)
	})
}
