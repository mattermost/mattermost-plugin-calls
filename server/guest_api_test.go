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

	"github.com/mattermost/mattermost-plugin-calls/server/db"
	"github.com/mattermost/mattermost-plugin-calls/server/enterprise"
	"github.com/mattermost/mattermost-plugin-calls/server/public"
	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/plugin"

	serverMocks "github.com/mattermost/mattermost-plugin-calls/server/mocks/github.com/mattermost/mattermost-plugin-calls/server/interfaces"
	pluginMocks "github.com/mattermost/mattermost-plugin-calls/server/mocks/github.com/mattermost/mattermost/server/public/plugin"

	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
)

func setupGuestTestPlugin(t *testing.T) (*Plugin, *pluginMocks.MockAPI, *httptest.Server) {
	t.Helper()

	mockAPI := &pluginMocks.MockAPI{}
	mockMetrics := &serverMocks.MockMetrics{}

	p := &Plugin{
		MattermostPlugin: plugin.MattermostPlugin{
			API: mockAPI,
		},
		metrics: mockMetrics,
		configuration: &configuration{
			LiveKitURL:       "ws://localhost:7880",
			LiveKitAPIKey:    "devkey",
			LiveKitAPISecret: "secret",
		},
	}
	p.configuration.SetDefaults()
	p.configuration.GuestAccessEnabled = model.NewPointer(true)
	p.licenseChecker = enterprise.NewLicenseChecker(p.API)

	store, tearDown := NewTestStore(t)
	t.Cleanup(tearDown)
	p.store = store

	mockMetrics.On("ObserveAppHandlersTime", mock.AnythingOfType("string"), mock.AnythingOfType("float64"))
	mockMetrics.On("Handler").Return(nil)
	mockAPI.On("GetLicense").Return(&model.License{SkuShortName: "enterprise"})
	mockAPI.On("GetConfig").Return(&model.Config{
		ServiceSettings: model.ServiceSettings{
			SiteURL: model.NewPointer("http://localhost:8065"),
		},
	})

	apiRouter := p.newAPIRouter()
	ts := httptest.NewServer(apiRouter)
	t.Cleanup(ts.Close)

	return p, mockAPI, ts
}

func TestHandleCreateGuestLink(t *testing.T) {
	p, mockAPI, _ := setupGuestTestPlugin(t)

	userID := model.NewId()
	channelID := model.NewId()

	apiRouter := p.newAPIRouter()

	t.Run("guest access disabled", func(t *testing.T) {
		p.configuration.GuestAccessEnabled = model.NewPointer(false)
		defer func() { p.configuration.GuestAccessEnabled = model.NewPointer(true) }()

		body, _ := json.Marshal(createGuestLinkRequest{ChannelID: channelID})
		w := httptest.NewRecorder()
		r := httptest.NewRequest("POST", "/guest-links", bytes.NewReader(body))
		r.Header.Set("Mattermost-User-Id", userID)

		mockAPI.On("LogDebug", mock.Anything, mock.Anything, mock.Anything, mock.Anything,
			mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything,
			mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything).Maybe()

		apiRouter.ServeHTTP(w, r)
		require.Equal(t, http.StatusForbidden, w.Code)
	})

	t.Run("missing channel_id", func(t *testing.T) {
		body, _ := json.Marshal(createGuestLinkRequest{})
		w := httptest.NewRecorder()
		r := httptest.NewRequest("POST", "/guest-links", bytes.NewReader(body))
		r.Header.Set("Mattermost-User-Id", userID)

		mockAPI.On("LogDebug", mock.Anything, mock.Anything, mock.Anything, mock.Anything,
			mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything,
			mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything).Maybe()

		apiRouter.ServeHTTP(w, r)
		require.Equal(t, http.StatusBadRequest, w.Code)
	})

	t.Run("no permission", func(t *testing.T) {
		mockAPI.On("HasPermissionToChannel", userID, channelID, model.PermissionCreatePost).Return(false).Once()
		mockAPI.On("LogDebug", mock.Anything, mock.Anything, mock.Anything, mock.Anything,
			mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything,
			mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything).Maybe()

		body, _ := json.Marshal(createGuestLinkRequest{ChannelID: channelID})
		w := httptest.NewRecorder()
		r := httptest.NewRequest("POST", "/guest-links", bytes.NewReader(body))
		r.Header.Set("Mattermost-User-Id", userID)

		apiRouter.ServeHTTP(w, r)
		require.Equal(t, http.StatusForbidden, w.Code)
	})

	t.Run("success", func(t *testing.T) {
		mockAPI.On("HasPermissionToChannel", userID, channelID, model.PermissionCreatePost).Return(true).Once()
		mockAPI.On("LogDebug", mock.Anything, mock.Anything, mock.Anything, mock.Anything,
			mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything,
			mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything).Maybe()

		body, _ := json.Marshal(createGuestLinkRequest{ChannelID: channelID})
		w := httptest.NewRecorder()
		r := httptest.NewRequest("POST", "/guest-links", bytes.NewReader(body))
		r.Header.Set("Mattermost-User-Id", userID)

		apiRouter.ServeHTTP(w, r)
		require.Equal(t, http.StatusCreated, w.Code)

		var resp guestLinkResponse
		err := json.NewDecoder(w.Body).Decode(&resp)
		require.NoError(t, err)
		require.Equal(t, channelID, resp.ChannelID)
		require.Equal(t, public.GuestLinkTypeURL, resp.Type)
		require.NotEmpty(t, resp.URL)
		require.NotEmpty(t, resp.ID)
	})

	t.Run("success single use", func(t *testing.T) {
		mockAPI.On("HasPermissionToChannel", userID, channelID, model.PermissionCreatePost).Return(true).Once()
		mockAPI.On("LogDebug", mock.Anything, mock.Anything, mock.Anything, mock.Anything,
			mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything,
			mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything).Maybe()

		body, _ := json.Marshal(createGuestLinkRequest{ChannelID: channelID, MaxUses: 1})
		w := httptest.NewRecorder()
		r := httptest.NewRequest("POST", "/guest-links", bytes.NewReader(body))
		r.Header.Set("Mattermost-User-Id", userID)

		apiRouter.ServeHTTP(w, r)
		require.Equal(t, http.StatusCreated, w.Code)

		var resp guestLinkResponse
		err := json.NewDecoder(w.Body).Decode(&resp)
		require.NoError(t, err)
		require.Equal(t, 1, resp.MaxUses)
	})
}

func TestHandleGetGuestLinks(t *testing.T) {
	p, mockAPI, _ := setupGuestTestPlugin(t)

	userID := model.NewId()
	channelID := model.NewId()

	apiRouter := p.newAPIRouter()

	// Create a link first.
	mockAPI.On("HasPermissionToChannel", userID, channelID, model.PermissionCreatePost).Return(true)
	mockAPI.On("LogDebug", mock.Anything, mock.Anything, mock.Anything, mock.Anything,
		mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything,
		mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything).Maybe()

	body, _ := json.Marshal(createGuestLinkRequest{ChannelID: channelID})
	w := httptest.NewRecorder()
	r := httptest.NewRequest("POST", "/guest-links", bytes.NewReader(body))
	r.Header.Set("Mattermost-User-Id", userID)
	apiRouter.ServeHTTP(w, r)
	require.Equal(t, http.StatusCreated, w.Code)

	t.Run("list links", func(t *testing.T) {
		mockAPI.On("HasPermissionToChannel", userID, channelID, model.PermissionReadChannel).Return(true).Once()

		w := httptest.NewRecorder()
		r := httptest.NewRequest("GET", fmt.Sprintf("/guest-links/%s", channelID), nil)
		r.Header.Set("Mattermost-User-Id", userID)

		apiRouter.ServeHTTP(w, r)
		require.Equal(t, http.StatusOK, w.Code)

		var links []guestLinkResponse
		err := json.NewDecoder(w.Body).Decode(&links)
		require.NoError(t, err)
		require.Len(t, links, 1)
		require.Equal(t, channelID, links[0].ChannelID)
	})
}

func TestHandleRevokeGuestLink(t *testing.T) {
	p, mockAPI, _ := setupGuestTestPlugin(t)

	userID := model.NewId()
	channelID := model.NewId()

	apiRouter := p.newAPIRouter()

	mockAPI.On("HasPermissionToChannel", userID, channelID, model.PermissionCreatePost).Return(true)
	mockAPI.On("LogDebug", mock.Anything, mock.Anything, mock.Anything, mock.Anything,
		mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything,
		mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything).Maybe()

	// Create a link.
	body, _ := json.Marshal(createGuestLinkRequest{ChannelID: channelID})
	w := httptest.NewRecorder()
	r := httptest.NewRequest("POST", "/guest-links", bytes.NewReader(body))
	r.Header.Set("Mattermost-User-Id", userID)
	apiRouter.ServeHTTP(w, r)
	require.Equal(t, http.StatusCreated, w.Code)

	var created guestLinkResponse
	err := json.NewDecoder(w.Body).Decode(&created)
	require.NoError(t, err)

	t.Run("revoke own link", func(t *testing.T) {
		w := httptest.NewRecorder()
		r := httptest.NewRequest("DELETE", fmt.Sprintf("/guest-links/%s", created.ID), nil)
		r.Header.Set("Mattermost-User-Id", userID)

		apiRouter.ServeHTTP(w, r)
		require.Equal(t, http.StatusOK, w.Code)
	})

	t.Run("revoke nonexistent", func(t *testing.T) {
		w := httptest.NewRecorder()
		r := httptest.NewRequest("DELETE", fmt.Sprintf("/guest-links/%s", model.NewId()), nil)
		r.Header.Set("Mattermost-User-Id", userID)

		apiRouter.ServeHTTP(w, r)
		require.Equal(t, http.StatusNotFound, w.Code)
	})
}

func TestHandleGuestJoin(t *testing.T) {
	p, mockAPI, _ := setupGuestTestPlugin(t)

	userID := model.NewId()
	channelID := model.NewId()

	apiRouter := p.newAPIRouter()

	mockAPI.On("HasPermissionToChannel", userID, channelID, model.PermissionCreatePost).Return(true)
	mockAPI.On("LogDebug", mock.Anything, mock.Anything, mock.Anything, mock.Anything,
		mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything,
		mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything).Maybe()
	mockAPI.On("LogError", mock.Anything, mock.Anything, mock.Anything).Maybe()
	mockAPI.On("GetChannel", channelID).Return(&model.Channel{
		Id:          channelID,
		DisplayName: "Test Channel",
	}, nil).Maybe()

	// Create a guest link.
	body, _ := json.Marshal(createGuestLinkRequest{ChannelID: channelID})
	w := httptest.NewRecorder()
	r := httptest.NewRequest("POST", "/guest-links", bytes.NewReader(body))
	r.Header.Set("Mattermost-User-Id", userID)
	apiRouter.ServeHTTP(w, r)
	require.Equal(t, http.StatusCreated, w.Code)

	var created guestLinkResponse
	err := json.NewDecoder(w.Body).Decode(&created)
	require.NoError(t, err)

	// Get the secret from the DB since the response doesn't include it.
	link, err := p.store.GetGuestLink(created.ID, db.GetGuestLinkOpts{FromWriter: true})
	require.NoError(t, err)
	secret := link.Secret

	t.Run("no active call", func(t *testing.T) {
		body, _ := json.Marshal(guestJoinRequest{Secret: secret, DisplayName: "Guest User"})
		w := httptest.NewRecorder()
		r := httptest.NewRequest("POST", "/guest/join", bytes.NewReader(body))
		apiRouter.ServeHTTP(w, r)
		require.Equal(t, http.StatusConflict, w.Code)
	})

	// Create an active call.
	err = p.store.CreateCall(&public.Call{
		ID:        model.NewId(),
		ChannelID: channelID,
		StartAt:   time.Now().UnixMilli(),
		CreateAt:  time.Now().UnixMilli(),
		OwnerID:   userID,
	})
	require.NoError(t, err)

	t.Run("success", func(t *testing.T) {
		body, _ := json.Marshal(guestJoinRequest{Secret: secret, DisplayName: "Jane from Acme"})
		w := httptest.NewRecorder()
		r := httptest.NewRequest("POST", "/guest/join", bytes.NewReader(body))
		apiRouter.ServeHTTP(w, r)
		require.Equal(t, http.StatusOK, w.Code)

		var resp guestJoinResponse
		err := json.NewDecoder(w.Body).Decode(&resp)
		require.NoError(t, err)
		require.NotEmpty(t, resp.LiveKitToken)
		require.NotEmpty(t, resp.LiveKitURL)
		require.NotEmpty(t, resp.SessionID)
		require.Equal(t, "Test Channel", resp.CallTitle)
	})

	t.Run("invalid secret", func(t *testing.T) {
		body, _ := json.Marshal(guestJoinRequest{Secret: "nonexistent", DisplayName: "Guest"})
		w := httptest.NewRecorder()
		r := httptest.NewRequest("POST", "/guest/join", bytes.NewReader(body))
		apiRouter.ServeHTTP(w, r)
		require.Equal(t, http.StatusNotFound, w.Code)
	})

	t.Run("missing display_name", func(t *testing.T) {
		body, _ := json.Marshal(guestJoinRequest{Secret: secret})
		w := httptest.NewRecorder()
		r := httptest.NewRequest("POST", "/guest/join", bytes.NewReader(body))
		apiRouter.ServeHTTP(w, r)
		require.Equal(t, http.StatusBadRequest, w.Code)
	})

	t.Run("revoked link", func(t *testing.T) {
		// Create and revoke a link.
		body, _ := json.Marshal(createGuestLinkRequest{ChannelID: channelID})
		w := httptest.NewRecorder()
		r := httptest.NewRequest("POST", "/guest-links", bytes.NewReader(body))
		r.Header.Set("Mattermost-User-Id", userID)
		apiRouter.ServeHTTP(w, r)
		require.Equal(t, http.StatusCreated, w.Code)

		var revokeTarget guestLinkResponse
		json.NewDecoder(w.Body).Decode(&revokeTarget)

		revokedLink, _ := p.store.GetGuestLink(revokeTarget.ID, db.GetGuestLinkOpts{FromWriter: true})
		err := p.store.DeleteGuestLink(revokeTarget.ID)
		require.NoError(t, err)

		body, _ = json.Marshal(guestJoinRequest{Secret: revokedLink.Secret, DisplayName: "Guest"})
		w = httptest.NewRecorder()
		r = httptest.NewRequest("POST", "/guest/join", bytes.NewReader(body))
		apiRouter.ServeHTTP(w, r)
		require.Equal(t, http.StatusGone, w.Code)
	})

	t.Run("single-use link exhausted", func(t *testing.T) {
		// Create a single-use link.
		body, _ := json.Marshal(createGuestLinkRequest{ChannelID: channelID, MaxUses: 1})
		w := httptest.NewRecorder()
		r := httptest.NewRequest("POST", "/guest-links", bytes.NewReader(body))
		r.Header.Set("Mattermost-User-Id", userID)
		apiRouter.ServeHTTP(w, r)
		require.Equal(t, http.StatusCreated, w.Code)

		var singleUse guestLinkResponse
		json.NewDecoder(w.Body).Decode(&singleUse)

		singleUseLink, _ := p.store.GetGuestLink(singleUse.ID, db.GetGuestLinkOpts{FromWriter: true})

		// First use should succeed.
		body, _ = json.Marshal(guestJoinRequest{Secret: singleUseLink.Secret, DisplayName: "Guest 1"})
		w = httptest.NewRecorder()
		r = httptest.NewRequest("POST", "/guest/join", bytes.NewReader(body))
		apiRouter.ServeHTTP(w, r)
		require.Equal(t, http.StatusOK, w.Code)

		// Second use should fail.
		body, _ = json.Marshal(guestJoinRequest{Secret: singleUseLink.Secret, DisplayName: "Guest 2"})
		w = httptest.NewRecorder()
		r = httptest.NewRequest("POST", "/guest/join", bytes.NewReader(body))
		apiRouter.ServeHTTP(w, r)
		require.Equal(t, http.StatusGone, w.Code)
	})

	t.Run("guest access disabled", func(t *testing.T) {
		p.configuration.GuestAccessEnabled = model.NewPointer(false)
		defer func() { p.configuration.GuestAccessEnabled = model.NewPointer(true) }()

		body, _ := json.Marshal(guestJoinRequest{Secret: secret, DisplayName: "Guest"})
		w := httptest.NewRecorder()
		r := httptest.NewRequest("POST", "/guest/join", bytes.NewReader(body))
		apiRouter.ServeHTTP(w, r)
		require.Equal(t, http.StatusForbidden, w.Code)
	})
}

func TestClientIP(t *testing.T) {
	t.Run("X-Forwarded-For single", func(t *testing.T) {
		r := httptest.NewRequest("GET", "/", nil)
		r.Header.Set("X-Forwarded-For", "1.2.3.4")
		require.Equal(t, "1.2.3.4", clientIP(r))
	})

	t.Run("X-Forwarded-For chain", func(t *testing.T) {
		r := httptest.NewRequest("GET", "/", nil)
		r.Header.Set("X-Forwarded-For", "1.2.3.4, 5.6.7.8")
		require.Equal(t, "1.2.3.4", clientIP(r))
	})

	t.Run("RemoteAddr fallback", func(t *testing.T) {
		r := httptest.NewRequest("GET", "/", nil)
		r.RemoteAddr = "10.0.0.1:12345"
		require.Equal(t, "10.0.0.1", clientIP(r))
	})
}

func TestGeneratePIN(t *testing.T) {
	t.Run("default length", func(t *testing.T) {
		pin, err := generatePIN(9)
		require.NoError(t, err)
		require.Len(t, pin, 9)
		for _, c := range pin {
			require.True(t, c >= '0' && c <= '9', "expected digit, got %c", c)
		}
	})

	t.Run("uniqueness", func(t *testing.T) {
		pin1, _ := generatePIN(9)
		pin2, _ := generatePIN(9)
		require.NotEqual(t, pin1, pin2)
	})

	t.Run("zero length defaults to 9", func(t *testing.T) {
		pin, err := generatePIN(0)
		require.NoError(t, err)
		require.Len(t, pin, 9)
	})
}

func TestFormatPIN(t *testing.T) {
	require.Equal(t, "123-456-789", formatPIN("123456789"))
	require.Equal(t, "123-45", formatPIN("12345"))
	require.Equal(t, "123", formatPIN("123"))
	require.Equal(t, "1", formatPIN("1"))
}

func TestGenerateSecret(t *testing.T) {
	s1, err := generateSecret()
	require.NoError(t, err)
	require.NotEmpty(t, s1)
	require.Len(t, s1, 43) // 32 bytes base64url no padding = 43 chars

	s2, err := generateSecret()
	require.NoError(t, err)
	require.NotEqual(t, s1, s2)
}
