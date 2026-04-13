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

func TestGenerateSecret(t *testing.T) {
	s1, err := generateSecret()
	require.NoError(t, err)
	require.NotEmpty(t, s1)
	require.Len(t, s1, 43) // 32 bytes base64url no padding = 43 chars

	s2, err := generateSecret()
	require.NoError(t, err)
	require.NotEqual(t, s1, s2)
}
