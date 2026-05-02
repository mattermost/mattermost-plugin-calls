// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/plugin"
	"github.com/mattermost/rtcd/service/rtc"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
	"golang.org/x/time/rate"

	pluginMocks "github.com/mattermost/mattermost-plugin-calls/server/mocks/github.com/mattermost/mattermost/server/public/plugin"
)

func TestHandleGetTURNCredentials(t *testing.T) {
	mockAPI := &pluginMocks.MockAPI{}

	userID := model.NewId()

	p := &Plugin{
		MattermostPlugin: plugin.MattermostPlugin{
			API: mockAPI,
		},
		apiLimiters: map[string]*rate.Limiter{},
	}
	_ = p.getConfiguration()

	// Audit log
	mockAPI.On("LogDebug", "handleGetTURNCredentials",
		"origin", mock.AnythingOfType("string"), mock.Anything, mock.Anything, mock.Anything,
		mock.Anything, mock.Anything, mock.Anything, mock.Anything,
		mock.Anything, mock.Anything, mock.Anything, mock.Anything,
		mock.Anything, mock.Anything, mock.Anything).Maybe()
	mockAPI.On("LogDebug", "handleGetTURNCredentials",
		"origin", mock.AnythingOfType("string"), mock.Anything, mock.Anything, mock.Anything,
		mock.Anything, mock.Anything, mock.Anything, mock.Anything,
		mock.Anything, mock.Anything, mock.Anything, mock.Anything,
		mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything).Maybe()

	apiRouter := p.newAPIRouter()

	t.Run("no TURN configured returns 404", func(t *testing.T) {
		defer mockAPI.AssertExpectations(t)

		p.configuration.ICEServersConfigs = ICEServersConfigs{
			{URLs: []string{"stun:stun.example.com:3478"}},
		}
		p.configuration.TURNStaticAuthSecret = ""

		w := httptest.NewRecorder()
		r := httptest.NewRequest("GET", "/turn-credentials", nil)
		r.Header.Set("Mattermost-User-Id", userID)

		apiRouter.ServeHTTP(w, r)

		resp := w.Result()
		require.Equal(t, http.StatusNotFound, resp.StatusCode)
		var res httpResponse
		err := json.NewDecoder(resp.Body).Decode(&res)
		require.NoError(t, err)
		require.Equal(t, "No TURN server was configured", res.Msg)
		require.Equal(t, http.StatusNotFound, res.Code)
	})

	t.Run("dynamic TURN without TURNStaticAuthSecret returns 500", func(t *testing.T) {
		defer mockAPI.AssertExpectations(t)

		p.configuration.ICEServersConfigs = ICEServersConfigs{
			{URLs: []string{"turn:dynamic.example.com:3478"}},
		}
		p.configuration.TURNStaticAuthSecret = ""

		w := httptest.NewRecorder()
		r := httptest.NewRequest("GET", "/turn-credentials", nil)
		r.Header.Set("Mattermost-User-Id", userID)

		apiRouter.ServeHTTP(w, r)

		resp := w.Result()
		require.Equal(t, http.StatusInternalServerError, resp.StatusCode)
		var res httpResponse
		err := json.NewDecoder(resp.Body).Decode(&res)
		require.NoError(t, err)
		require.Equal(t, "TURNStaticAuthSecret should be set", res.Msg)
		require.Equal(t, http.StatusInternalServerError, res.Code)
	})

	t.Run("static TURN only passes through without TURNStaticAuthSecret", func(t *testing.T) {
		defer mockAPI.AssertExpectations(t)

		p.configuration.ICEServersConfigs = ICEServersConfigs{
			{URLs: []string{"stun:stun.example.com:3478"}},
			{URLs: []string{"turn:static.example.com:3478"}, Username: "webrtc", Credential: "my-secret"},
		}
		p.configuration.TURNStaticAuthSecret = ""

		w := httptest.NewRecorder()
		r := httptest.NewRequest("GET", "/turn-credentials", nil)
		r.Header.Set("Mattermost-User-Id", userID)

		apiRouter.ServeHTTP(w, r)

		resp := w.Result()
		require.Equal(t, http.StatusOK, resp.StatusCode)

		var out []rtc.ICEServerConfig
		require.NoError(t, json.NewDecoder(resp.Body).Decode(&out))
		require.Len(t, out, 1)
		require.Equal(t, []string{"turn:static.example.com:3478"}, out[0].URLs)
		require.Equal(t, "webrtc", out[0].Username)
		require.Equal(t, "my-secret", out[0].Credential)
	})

	t.Run("static + dynamic TURN returns both", func(t *testing.T) {
		defer mockAPI.AssertExpectations(t)

		p.configuration.ICEServersConfigs = ICEServersConfigs{
			{URLs: []string{"turn:static.example.com:3478"}, Username: "webrtc", Credential: "my-secret"},
			{URLs: []string{"turn:dynamic.example.com:3478"}},
		}
		p.configuration.TURNStaticAuthSecret = "super-secret"
		p.configuration.TURNCredentialsExpirationMinutes = model.NewPointer(240)

		mockAPI.On("GetUser", userID).Return(&model.User{Username: "testuser"}, (*model.AppError)(nil)).Once()

		w := httptest.NewRecorder()
		r := httptest.NewRequest("GET", "/turn-credentials", nil)
		r.Header.Set("Mattermost-User-Id", userID)

		apiRouter.ServeHTTP(w, r)

		resp := w.Result()
		require.Equal(t, http.StatusOK, resp.StatusCode)

		var out []rtc.ICEServerConfig
		require.NoError(t, json.NewDecoder(resp.Body).Decode(&out))
		require.Len(t, out, 2)

		require.Equal(t, []string{"turn:static.example.com:3478"}, out[0].URLs)
		require.Equal(t, "webrtc", out[0].Username)
		require.Equal(t, "my-secret", out[0].Credential)

		require.Equal(t, []string{"turn:dynamic.example.com:3478"}, out[1].URLs)
		require.NotEmpty(t, out[1].Username)
		require.NotEmpty(t, out[1].Credential)
		require.NotEqual(t, "webrtc", out[1].Username)
	})
}
