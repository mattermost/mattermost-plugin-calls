// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"golang.org/x/time/rate"

	"github.com/mattermost/mattermost-plugin-calls/server/cluster"
	"github.com/mattermost/mattermost-plugin-calls/server/enterprise"
	"github.com/mattermost/mattermost-plugin-calls/server/public"

	serverMocks "github.com/mattermost/mattermost-plugin-calls/server/mocks/github.com/mattermost/mattermost-plugin-calls/server/interfaces"
	pluginMocks "github.com/mattermost/mattermost-plugin-calls/server/mocks/github.com/mattermost/mattermost/server/public/plugin"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/plugin"

	"github.com/livekit/protocol/auth"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
)

func TestHandleGetLiveKitToken(t *testing.T) {
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
		}
		p.licenseChecker = enterprise.NewLicenseChecker(p.API)

		mockMetrics.On("Handler").Return(nil).Once()
		mockMetrics.On("ObserveAppHandlersTime", mock.AnythingOfType("string"), mock.AnythingOfType("float64")).Maybe()
		mockAPI.On("GetConfig").Return(&model.Config{}, nil)
		mockAPI.On("GetLicense").Return(&model.License{SkuShortName: "enterprise"}, nil)

		// Audit log.
		mockAPI.On("LogDebug", "handleGetLiveKitToken",
			"origin", mock.AnythingOfType("string"), mock.Anything, mock.Anything, mock.Anything,
			mock.Anything, mock.Anything, mock.Anything, mock.Anything,
			mock.Anything, mock.Anything, mock.Anything, mock.Anything,
			mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything).Maybe()

		return p, mockAPI, mockMetrics
	}

	// createActiveCall persists an active calls row in the given channel and
	// returns its ID, which callers can wire into a calls_sessions row.
	createActiveCall := func(t *testing.T, p *Plugin, channelID string) string {
		t.Helper()
		callID := model.NewId()
		postID := model.NewId()
		createPost(t, p.store, postID, model.NewId(), channelID)
		require.NoError(t, p.store.CreateCall(&public.Call{
			ID:        callID,
			CreateAt:  time.Now().UnixMilli(),
			StartAt:   time.Now().UnixMilli(),
			ChannelID: channelID,
			PostID:    postID,
			ThreadID:  model.NewId(),
			OwnerID:   model.NewId(),
			Props:     public.CallProps{NodeID: "test-node"},
		}))
		return callID
	}

	// createCallSession persists a calls_sessions row. The row's ID is the
	// originalConnID — exactly what the LiveKit client sends as session_id.
	createCallSession := func(t *testing.T, p *Plugin, sessionID, userID, callID string) {
		t.Helper()
		if callID == "" {
			callID = model.NewId()
		}
		require.NoError(t, p.store.CreateCallSession(&public.CallSession{
			ID:     sessionID,
			CallID: callID,
			UserID: userID,
			JoinAt: time.Now().UnixMilli(),
		}))
	}

	setLiveKitConfig := func(p *Plugin) {
		cfg := &configuration{}
		cfg.SetDefaults()
		cfg.LiveKitURL = "wss://lk.example.com"
		cfg.LiveKitAPIKey = "testkey"
		cfg.LiveKitAPISecret = "testsecret"
		p.configuration = cfg
	}

	t.Run("missing channel_id", func(t *testing.T) {
		p, _, _ := setupPlugin(t)
		apiRouter := p.newAPIRouter()

		userID := model.NewId()

		w := httptest.NewRecorder()
		r := httptest.NewRequest("GET", "/livekit-token", nil)
		r.Header.Set("Mattermost-User-Id", userID)

		apiRouter.ServeHTTP(w, r)

		resp := w.Result()
		require.Equal(t, http.StatusBadRequest, resp.StatusCode)
		var res httpResponse
		require.NoError(t, json.NewDecoder(resp.Body).Decode(&res))
		require.Equal(t, "channel_id is required", res.Msg)
	})

	t.Run("missing session_id", func(t *testing.T) {
		p, _, _ := setupPlugin(t)
		apiRouter := p.newAPIRouter()

		userID := model.NewId()
		channelID := model.NewId()

		w := httptest.NewRecorder()
		r := httptest.NewRequest("GET", fmt.Sprintf("/livekit-token?channel_id=%s", channelID), nil)
		r.Header.Set("Mattermost-User-Id", userID)

		apiRouter.ServeHTTP(w, r)

		resp := w.Result()
		require.Equal(t, http.StatusBadRequest, resp.StatusCode)
		var res httpResponse
		require.NoError(t, json.NewDecoder(resp.Body).Decode(&res))
		require.Equal(t, "session_id is required", res.Msg)
	})

	t.Run("no channel permission", func(t *testing.T) {
		p, mockAPI, _ := setupPlugin(t)
		apiRouter := p.newAPIRouter()

		userID := model.NewId()
		channelID := model.NewId()
		sessionID := model.NewId()

		mockAPI.On("HasPermissionToChannel", userID, channelID, model.PermissionReadChannel).Return(false).Once()

		w := httptest.NewRecorder()
		r := httptest.NewRequest("GET", fmt.Sprintf("/livekit-token?channel_id=%s&session_id=%s", channelID, sessionID), nil)
		r.Header.Set("Mattermost-User-Id", userID)

		apiRouter.ServeHTTP(w, r)

		resp := w.Result()
		require.Equal(t, http.StatusForbidden, resp.StatusCode)
		var res httpResponse
		require.NoError(t, json.NewDecoder(resp.Body).Decode(&res))
		require.Equal(t, "Forbidden", res.Msg)
	})

	t.Run("session_id not found", func(t *testing.T) {
		p, mockAPI, _ := setupPlugin(t)
		apiRouter := p.newAPIRouter()

		userID := model.NewId()
		channelID := model.NewId()
		sessionID := model.NewId()

		mockAPI.On("HasPermissionToChannel", userID, channelID, model.PermissionReadChannel).Return(true).Once()

		w := httptest.NewRecorder()
		r := httptest.NewRequest("GET", fmt.Sprintf("/livekit-token?channel_id=%s&session_id=%s", channelID, sessionID), nil)
		r.Header.Set("Mattermost-User-Id", userID)

		apiRouter.ServeHTTP(w, r)

		resp := w.Result()
		require.Equal(t, http.StatusForbidden, resp.StatusCode)
		var res httpResponse
		require.NoError(t, json.NewDecoder(resp.Body).Decode(&res))
		require.Equal(t, "Forbidden", res.Msg)
	})

	t.Run("session_id owned by different user", func(t *testing.T) {
		p, mockAPI, _ := setupPlugin(t)
		apiRouter := p.newAPIRouter()

		userID := model.NewId()
		otherUserID := model.NewId()
		channelID := model.NewId()
		sessionID := model.NewId()

		createCallSession(t, p, sessionID, otherUserID, "")

		mockAPI.On("HasPermissionToChannel", userID, channelID, model.PermissionReadChannel).Return(true).Once()

		w := httptest.NewRecorder()
		r := httptest.NewRequest("GET", fmt.Sprintf("/livekit-token?channel_id=%s&session_id=%s", channelID, sessionID), nil)
		r.Header.Set("Mattermost-User-Id", userID)

		apiRouter.ServeHTTP(w, r)

		resp := w.Result()
		require.Equal(t, http.StatusForbidden, resp.StatusCode)
		var res httpResponse
		require.NoError(t, json.NewDecoder(resp.Body).Decode(&res))
		require.Equal(t, "Forbidden", res.Msg)
	})

	t.Run("session belongs to a different channel's call", func(t *testing.T) {
		p, mockAPI, _ := setupPlugin(t)
		apiRouter := p.newAPIRouter()

		userID := model.NewId()
		requestedChannelID := model.NewId()
		otherChannelID := model.NewId()
		sessionID := model.NewId()

		// The session belongs to a call in otherChannelID, but the client is
		// asking for a token scoped to requestedChannelID.
		otherCallID := createActiveCall(t, p, otherChannelID)
		_ = createActiveCall(t, p, requestedChannelID)
		createCallSession(t, p, sessionID, userID, otherCallID)

		mockAPI.On("HasPermissionToChannel", userID, requestedChannelID, model.PermissionReadChannel).Return(true).Once()

		w := httptest.NewRecorder()
		r := httptest.NewRequest("GET", fmt.Sprintf("/livekit-token?channel_id=%s&session_id=%s", requestedChannelID, sessionID), nil)
		r.Header.Set("Mattermost-User-Id", userID)

		apiRouter.ServeHTTP(w, r)

		resp := w.Result()
		require.Equal(t, http.StatusForbidden, resp.StatusCode)
		var res httpResponse
		require.NoError(t, json.NewDecoder(resp.Body).Decode(&res))
		require.Equal(t, "Forbidden", res.Msg)
	})

	t.Run("no active call in channel", func(t *testing.T) {
		p, mockAPI, _ := setupPlugin(t)
		apiRouter := p.newAPIRouter()

		userID := model.NewId()
		channelID := model.NewId()
		sessionID := model.NewId()

		createCallSession(t, p, sessionID, userID, "")

		mockAPI.On("HasPermissionToChannel", userID, channelID, model.PermissionReadChannel).Return(true).Once()

		w := httptest.NewRecorder()
		r := httptest.NewRequest("GET", fmt.Sprintf("/livekit-token?channel_id=%s&session_id=%s", channelID, sessionID), nil)
		r.Header.Set("Mattermost-User-Id", userID)

		apiRouter.ServeHTTP(w, r)

		resp := w.Result()
		require.Equal(t, http.StatusForbidden, resp.StatusCode)
		var res httpResponse
		require.NoError(t, json.NewDecoder(resp.Body).Decode(&res))
		require.Equal(t, "Forbidden", res.Msg)
	})

	t.Run("db error returns 500", func(t *testing.T) {
		p, mockAPI, _ := setupPlugin(t)
		apiRouter := p.newAPIRouter()

		userID := model.NewId()
		channelID := model.NewId()
		sessionID := model.NewId()

		// Close the store to force a DB error on lookup. This is distinct
		// from a missing session (ErrNotFound) and must surface as 500.
		require.NoError(t, p.store.Close())

		mockAPI.On("HasPermissionToChannel", userID, channelID, model.PermissionReadChannel).Return(true).Once()
		mockAPI.On("LogError", "failed to get call session",
			mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything).Maybe()

		w := httptest.NewRecorder()
		r := httptest.NewRequest("GET", fmt.Sprintf("/livekit-token?channel_id=%s&session_id=%s", channelID, sessionID), nil)
		r.Header.Set("Mattermost-User-Id", userID)

		apiRouter.ServeHTTP(w, r)

		resp := w.Result()
		require.Equal(t, http.StatusInternalServerError, resp.StatusCode)
		var res httpResponse
		require.NoError(t, json.NewDecoder(resp.Body).Decode(&res))
		require.Equal(t, "Internal server error", res.Msg)
	})

	t.Run("livekit not configured", func(t *testing.T) {
		p, mockAPI, _ := setupPlugin(t)
		apiRouter := p.newAPIRouter()

		userID := model.NewId()
		channelID := model.NewId()
		sessionID := model.NewId()

		callID := createActiveCall(t, p, channelID)
		createCallSession(t, p, sessionID, userID, callID)

		mockAPI.On("HasPermissionToChannel", userID, channelID, model.PermissionReadChannel).Return(true).Once()
		mockAPI.On("LoadPluginConfiguration", mock.AnythingOfType("*main.configuration")).Return(nil).Once()

		w := httptest.NewRecorder()
		r := httptest.NewRequest("GET", fmt.Sprintf("/livekit-token?channel_id=%s&session_id=%s", channelID, sessionID), nil)
		r.Header.Set("Mattermost-User-Id", userID)

		apiRouter.ServeHTTP(w, r)

		resp := w.Result()
		require.Equal(t, http.StatusInternalServerError, resp.StatusCode)
		var res httpResponse
		require.NoError(t, json.NewDecoder(resp.Body).Decode(&res))
		require.Equal(t, "LiveKit is not configured", res.Msg)
	})

	t.Run("get user error", func(t *testing.T) {
		p, mockAPI, _ := setupPlugin(t)
		apiRouter := p.newAPIRouter()

		userID := model.NewId()
		channelID := model.NewId()
		sessionID := model.NewId()

		setLiveKitConfig(p)
		callID := createActiveCall(t, p, channelID)
		createCallSession(t, p, sessionID, userID, callID)

		mockAPI.On("HasPermissionToChannel", userID, channelID, model.PermissionReadChannel).Return(true).Once()
		mockAPI.On("GetUser", userID).Return(nil, &model.AppError{Message: "user not found"}).Once()

		w := httptest.NewRecorder()
		r := httptest.NewRequest("GET", fmt.Sprintf("/livekit-token?channel_id=%s&session_id=%s", channelID, sessionID), nil)
		r.Header.Set("Mattermost-User-Id", userID)

		apiRouter.ServeHTTP(w, r)

		resp := w.Result()
		require.Equal(t, http.StatusInternalServerError, resp.StatusCode)
		var res httpResponse
		require.NoError(t, json.NewDecoder(resp.Body).Decode(&res))
		require.Contains(t, res.Msg, "user not found")
	})

	t.Run("success", func(t *testing.T) {
		p, mockAPI, _ := setupPlugin(t)
		apiRouter := p.newAPIRouter()

		userID := model.NewId()
		channelID := model.NewId()
		sessionID := model.NewId()

		setLiveKitConfig(p)
		callID := createActiveCall(t, p, channelID)
		createCallSession(t, p, sessionID, userID, callID)

		user := &model.User{
			Id:        userID,
			Username:  "testuser",
			FirstName: "Test",
			LastName:  "User",
		}

		mockAPI.On("HasPermissionToChannel", userID, channelID, model.PermissionReadChannel).Return(true).Once()
		mockAPI.On("GetUser", userID).Return(user, nil).Once()

		w := httptest.NewRecorder()
		r := httptest.NewRequest("GET", fmt.Sprintf("/livekit-token?channel_id=%s&session_id=%s", channelID, sessionID), nil)
		r.Header.Set("Mattermost-User-Id", userID)

		apiRouter.ServeHTTP(w, r)

		resp := w.Result()
		require.Equal(t, http.StatusOK, resp.StatusCode)

		var tokenResp map[string]string
		require.NoError(t, json.NewDecoder(resp.Body).Decode(&tokenResp))
		require.Equal(t, "wss://lk.example.com", tokenResp["url"])
		require.NotEmpty(t, tokenResp["token"])

		verifier, err := auth.ParseAPIToken(tokenResp["token"])
		require.NoError(t, err)
		require.Equal(t, "testkey", verifier.APIKey())
		require.Equal(t, userID+"___"+sessionID, verifier.Identity())

		_, claims, err := verifier.Verify("testsecret")
		require.NoError(t, err)
		require.Equal(t, userID, claims.Name)
		require.NotNil(t, claims.Video)
		require.True(t, claims.Video.RoomJoin)
		require.Equal(t, channelID, claims.Video.Room)
		require.True(t, claims.Video.GetCanUpdateOwnMetadata())
		require.Empty(t, claims.Metadata)
	})

	t.Run("unauthenticated", func(t *testing.T) {
		p, _, _ := setupPlugin(t)
		apiRouter := p.newAPIRouter()

		channelID := model.NewId()

		w := httptest.NewRecorder()
		r := httptest.NewRequest("GET", fmt.Sprintf("/livekit-token?channel_id=%s", channelID), nil)

		apiRouter.ServeHTTP(w, r)

		resp := w.Result()
		require.Equal(t, http.StatusUnauthorized, resp.StatusCode)
	})
}

func TestHandlePhoneCall(t *testing.T) {
	setupPlugin := func(t *testing.T) (*Plugin, *pluginMocks.MockAPI) {
		t.Helper()
		mockAPI := &pluginMocks.MockAPI{}
		mockMetrics := &serverMocks.MockMetrics{}

		p := &Plugin{
			MattermostPlugin:  plugin.MattermostPlugin{API: mockAPI},
			metrics:           mockMetrics,
			apiLimiters:       map[string]*rate.Limiter{},
			callsClusterLocks: map[string]*cluster.Mutex{},
			sessions:          map[string]*session{},
		}
		p.licenseChecker = enterprise.NewLicenseChecker(p.API)

		mockMetrics.On("Handler").Return(nil)
		mockMetrics.On("ObserveAppHandlersTime", mock.AnythingOfType("string"), mock.AnythingOfType("float64")).Maybe()
		mockAPI.On("GetConfig").Return(&model.Config{}, nil)
		mockAPI.On("LogDebug", "handlePhoneCall",
			"origin", mock.AnythingOfType("string"), mock.Anything, mock.Anything, mock.Anything,
			mock.Anything, mock.Anything, mock.Anything, mock.Anything,
			mock.Anything, mock.Anything, mock.Anything, mock.Anything,
			mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything).Maybe()

		return p, mockAPI
	}

	doRequest := func(t *testing.T, p *Plugin, number string) *http.Response {
		t.Helper()
		apiRouter := p.newAPIRouter()
		body, err := json.Marshal(map[string]string{"number": number})
		require.NoError(t, err)
		w := httptest.NewRecorder()
		r := httptest.NewRequest("POST", "/phone-call", bytes.NewReader(body))
		r.Header.Set("Mattermost-User-Id", model.NewId())
		apiRouter.ServeHTTP(w, r)
		return w.Result()
	}

	t.Run("number required", func(t *testing.T) {
		p, _ := setupPlugin(t)
		cfg := &configuration{}
		cfg.SetDefaults()
		cfg.EnableSIPOutbound = model.NewPointer(true)
		cfg.LiveKitSIPOutboundTrunkID = "ST_test"
		p.configuration = cfg

		resp := doRequest(t, p, "")
		require.Equal(t, http.StatusBadRequest, resp.StatusCode)
		var res httpResponse
		require.NoError(t, json.NewDecoder(resp.Body).Decode(&res))
		require.Equal(t, "number is required", res.Msg)
	})

	t.Run("disabled toggle rejects even with trunk configured", func(t *testing.T) {
		p, _ := setupPlugin(t)
		cfg := &configuration{}
		cfg.SetDefaults() // EnableSIPOutbound defaults to false
		cfg.LiveKitSIPOutboundTrunkID = "ST_test"
		p.configuration = cfg

		resp := doRequest(t, p, "+14155551234")
		require.Equal(t, http.StatusBadRequest, resp.StatusCode)
		var res httpResponse
		require.NoError(t, json.NewDecoder(resp.Body).Decode(&res))
		require.Equal(t, "outbound dialing is disabled. Enable it in the admin console.", res.Msg)
	})

	t.Run("enabled but no trunk configured", func(t *testing.T) {
		p, _ := setupPlugin(t)
		cfg := &configuration{}
		cfg.SetDefaults()
		cfg.EnableSIPOutbound = model.NewPointer(true) // trunk left empty
		p.configuration = cfg

		resp := doRequest(t, p, "+14155551234")
		require.Equal(t, http.StatusBadRequest, resp.StatusCode)
		var res httpResponse
		require.NoError(t, json.NewDecoder(resp.Body).Decode(&res))
		require.Equal(t, "outbound dialing is not configured. Set the SIP Outbound Trunk ID in the admin console.", res.Msg)
	})
}
