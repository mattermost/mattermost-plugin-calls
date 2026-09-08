// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"golang.org/x/time/rate"

	"github.com/mattermost/mattermost-plugin-calls/server/cluster"
	"github.com/mattermost/mattermost-plugin-calls/server/db"
	"github.com/mattermost/mattermost-plugin-calls/server/enterprise"

	serverMocks "github.com/mattermost/mattermost-plugin-calls/server/mocks/github.com/mattermost/mattermost-plugin-calls/server/interfaces"
	pluginMocks "github.com/mattermost/mattermost-plugin-calls/server/mocks/github.com/mattermost/mattermost/server/public/plugin"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/plugin"

	"github.com/livekit/protocol/auth"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
)

func TestHandleCreateLiveKitSession(t *testing.T) {
	setupPlugin := func(t *testing.T) (*Plugin, *pluginMocks.MockAPI, *serverMocks.MockMetrics) {
		t.Helper()

		mockAPI := &pluginMocks.MockAPI{}
		mockMetrics := &serverMocks.MockMetrics{}

		store, tearDown := NewTestStore(t)
		t.Cleanup(tearDown)

		p := &Plugin{
			MattermostPlugin:  plugin.MattermostPlugin{API: mockAPI},
			metrics:           mockMetrics,
			apiLimiters:       map[string]*rate.Limiter{},
			callsClusterLocks: map[string]*cluster.Mutex{},
			sessions:          map[string]*session{},
			store:             store,
			nodeID:            "test-node",
		}
		p.licenseChecker = enterprise.NewLicenseChecker(p.API)

		cfg := &configuration{}
		cfg.SetDefaults()
		cfg.DefaultEnabled = model.NewPointer(true)
		cfg.LiveKitURL = "wss://lk.example.com"
		cfg.LiveKitAPIKey = "testkey"
		cfg.LiveKitAPISecret = "testsecret"
		p.configuration = cfg

		mockMetrics.On("Handler").Return(nil).Once()
		mockMetrics.On("IncWebSocketEvent", mock.Anything, mock.Anything).Maybe()
		mockMetrics.On("ObserveAppHandlersTime", mock.AnythingOfType("string"), mock.AnythingOfType("float64")).Maybe()
		mockMetrics.On("ObserveClusterMutexGrabTime", mock.Anything, mock.AnythingOfType("float64")).Maybe()
		mockMetrics.On("ObserveClusterMutexLockedTime", mock.Anything, mock.AnythingOfType("float64")).Maybe()
		mockAPI.On("GetConfig").Return(&model.Config{}, nil).Maybe()
		mockAPI.On("GetLicense").Return(&model.License{SkuShortName: "enterprise"}, nil).Maybe()
		// The log helper appends an "origin" pair, so mock every arity these
		// handlers actually use; testify matches on exact argument count.
		for _, method := range []string{"LogDebug", "LogInfo", "LogError", "LogWarn"} {
			for n := 1; n <= 20; n++ {
				args := make([]any, n)
				for i := range args {
					args[i] = mock.Anything
				}
				mockAPI.On(method, args...).Maybe()
			}
		}
		mockAPI.On("PublishWebSocketEvent", mock.AnythingOfType("string"), mock.Anything,
			mock.AnythingOfType("*model.WebsocketBroadcast")).Maybe()
		mockAPI.On("KVSetWithOptions", mock.Anything, mock.Anything, mock.Anything).Return(true, nil).Maybe()
		mockAPI.On("KVDelete", mock.Anything).Return(nil).Maybe()

		// Built last: newAPIRouter calls into the metrics mock.
		p.apiRouter = p.newAPIRouter()

		return p, mockAPI, mockMetrics
	}

	postSession := func(t *testing.T, p *Plugin, userID, authSessionID string, body map[string]string) *httptest.ResponseRecorder {
		t.Helper()
		payload, err := json.Marshal(body)
		require.NoError(t, err)

		r := httptest.NewRequest("POST", "/livekit-token", bytes.NewReader(payload))
		r.Header.Set("Mattermost-User-Id", userID)
		w := httptest.NewRecorder()

		// Go through ServeHTTP rather than the router directly so the auth session
		// id is carried across from plugin.Context, as it is in production.
		p.ServeHTTP(&plugin.Context{SessionId: authSessionID}, w, r)
		return w
	}

	t.Run("missing channel_id", func(t *testing.T) {
		p, _, _ := setupPlugin(t)
		defer ResetTestStore(t, p.store)

		w := postSession(t, p, model.NewId(), model.NewId(), map[string]string{})
		require.Equal(t, http.StatusBadRequest, w.Result().StatusCode)
	})

	t.Run("no channel permission", func(t *testing.T) {
		p, mockAPI, _ := setupPlugin(t)
		defer ResetTestStore(t, p.store)

		userID := model.NewId()
		channelID := model.NewId()
		mockAPI.On("HasPermissionToChannel", userID, channelID, model.PermissionCreatePost).Return(false).Once()

		w := postSession(t, p, userID, model.NewId(), map[string]string{"channel_id": channelID})
		require.Equal(t, http.StatusForbidden, w.Result().StatusCode)
	})

	t.Run("archived channel", func(t *testing.T) {
		p, mockAPI, _ := setupPlugin(t)
		defer ResetTestStore(t, p.store)

		userID := model.NewId()
		channelID := model.NewId()
		mockAPI.On("HasPermissionToChannel", userID, channelID, model.PermissionCreatePost).Return(true).Once()
		mockAPI.On("GetChannel", channelID).Return(&model.Channel{
			Id: channelID, Type: model.ChannelTypeOpen, DeleteAt: 100,
		}, nil).Once()

		w := postSession(t, p, userID, model.NewId(), map[string]string{"channel_id": channelID})
		require.Equal(t, http.StatusBadRequest, w.Result().StatusCode)
	})

	t.Run("creates pending session and call", func(t *testing.T) {
		p, mockAPI, _ := setupPlugin(t)
		defer ResetTestStore(t, p.store)

		userID := model.NewId()
		channelID := model.NewId()
		authSessionID := model.NewId()

		mockAPI.On("HasPermissionToChannel", userID, channelID, model.PermissionCreatePost).Return(true).Once()
		mockAPI.On("GetChannel", channelID).Return(&model.Channel{
			Id: channelID, Type: model.ChannelTypeOpen,
		}, nil).Once()
		mockAPI.On("GetUser", userID).Return(&model.User{Id: userID}, nil).Once()

		w := postSession(t, p, userID, authSessionID, map[string]string{"channel_id": channelID})
		require.Equal(t, http.StatusOK, w.Result().StatusCode)

		var res livekitSessionResponse
		require.NoError(t, json.NewDecoder(w.Result().Body).Decode(&res))
		require.NotEmpty(t, res.SessionID)
		require.NotEmpty(t, res.Token)
		require.Equal(t, "wss://lk.example.com", res.URL)
		require.NotNil(t, res.CallState)

		// The token identity ties the user to the freshly minted session id.
		verifier, err := auth.ParseAPIToken(res.Token)
		require.NoError(t, err)
		require.Equal(t, userID+"___"+res.SessionID, verifier.Identity())

		// The row exists but is unconfirmed: no LiveKit participant yet.
		callSession, err := p.store.GetCallSession(res.SessionID, db.GetCallSessionOpts{FromWriter: true})
		require.NoError(t, err)
		require.Equal(t, userID, callSession.UserID)
		require.Zero(t, callSession.ConfirmedAt)
		require.Empty(t, callSession.SID)
		require.Equal(t, authSessionID, callSession.AuthSessionID)

		// First joiner creates the call.
		call, err := p.store.GetActiveCallByChannelID(channelID, db.GetCallOpts{FromWriter: true})
		require.NoError(t, err)
		require.Equal(t, callSession.CallID, call.ID)
	})
}
