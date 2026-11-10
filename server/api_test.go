// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	pluginMocks "github.com/mattermost/mattermost-plugin-calls/server/mocks/github.com/mattermost/mattermost/server/public/plugin"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/plugin"

	"github.com/stretchr/testify/require"
)

func TestHandleEnv(t *testing.T) {
	mockAPI := &pluginMocks.MockAPI{}
	defer mockAPI.AssertExpectations(t)

	p := &Plugin{
		MattermostPlugin: plugin.MattermostPlugin{
			API: mockAPI,
		},
		configEnvOverrides: map[string]string{
			"RTCDServiceURL":              "http://rtcd.example.com:8045",
			"TURNStaticAuthSecret":        "turn-secret",
			"TranscribeAPIAzureSpeechKey": "",
		},
	}

	t.Run("forbidden for non-admins", func(t *testing.T) {
		mockAPI.On("HasPermissionTo", "userID", model.PermissionManageSystem).Return(false).Once()

		w := httptest.NewRecorder()
		r := httptest.NewRequest("GET", "/env", nil)
		r.Header.Set("Mattermost-User-Id", "userID")
		require.NoError(t, p.handleEnv(w, r))
		require.Equal(t, http.StatusForbidden, w.Result().StatusCode)
	})

	t.Run("secrets are masked", func(t *testing.T) {
		mockAPI.On("HasPermissionTo", "adminID", model.PermissionManageSystem).Return(true).Once()

		w := httptest.NewRecorder()
		r := httptest.NewRequest("GET", "/env", nil)
		r.Header.Set("Mattermost-User-Id", "adminID")
		require.NoError(t, p.handleEnv(w, r))
		require.Equal(t, http.StatusOK, w.Result().StatusCode)

		var overrides map[string]string
		require.NoError(t, json.NewDecoder(w.Body).Decode(&overrides))
		require.Equal(t, map[string]string{
			"RTCDServiceURL":              "http://rtcd.example.com:8045",
			"TURNStaticAuthSecret":        model.FakeSetting,
			"TranscribeAPIAzureSpeechKey": "",
		}, overrides)
		require.Equal(t, "turn-secret", p.configEnvOverrides["TURNStaticAuthSecret"])
	})
}
