// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"testing"

	"github.com/mattermost/mattermost-plugin-calls/server/cluster"
	serverMocks "github.com/mattermost/mattermost-plugin-calls/server/mocks/github.com/mattermost/mattermost-plugin-calls/server/interfaces"
	pluginMocks "github.com/mattermost/mattermost-plugin-calls/server/mocks/github.com/mattermost/mattermost/server/public/plugin"
	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/plugin"

	"github.com/mattermost/calls-offloader/public/job"

	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
)

func TestJobServiceStopJob(t *testing.T) {
	mockAPI := &pluginMocks.MockAPI{}
	mockMetrics := &serverMocks.MockMetrics{}

	p := &Plugin{
		MattermostPlugin: plugin.MattermostPlugin{
			API: mockAPI,
		},
		callsClusterLocks: map[string]*cluster.Mutex{},
		metrics:           mockMetrics,
	}

	p.jobService = &jobService{
		ctx: p,
	}

	t.Run("missing channelID", func(t *testing.T) {
		err := p.jobService.StopJob("", "jobID", "botUserID", "botConnID")
		require.EqualError(t, err, "channelID should not be empty")
		mockAPI.AssertNotCalled(t, "PublishWebSocketEvent")
	})

	t.Run("missing jobID", func(t *testing.T) {
		err := p.jobService.StopJob("callChannelID", "", "botUserID", "botConnID")
		require.EqualError(t, err, "jobID should not be empty")
		mockAPI.AssertNotCalled(t, "PublishWebSocketEvent")
	})

	t.Run("missing botUserID", func(t *testing.T) {
		err := p.jobService.StopJob("callChannelID", "jobID", "", "botConnID")
		require.EqualError(t, err, "botUserID should not be empty")
		mockAPI.AssertNotCalled(t, "PublishWebSocketEvent")
	})

	t.Run("missing botConnID", func(t *testing.T) {
		defer mockAPI.AssertExpectations(t)
		defer mockMetrics.AssertExpectations(t)

		mockAPI.On("LogDebug", "stopping job with empty connID", "origin", mock.AnythingOfType("string"),
			"channelID", "callChannelID").Once()
		mockMetrics.On("IncWebSocketEvent", "out", wsEventJobStop).Once()
		mockAPI.On("PublishWebSocketEvent", wsEventJobStop, map[string]any{
			"job_id": "jobID",
		}, &model.WebsocketBroadcast{
			UserId:              "botUserID",
			ReliableClusterSend: true,
		}).Once()

		err := p.jobService.StopJob("callChannelID", "jobID", "botUserID", "")
		require.NoError(t, err)
	})

	t.Run("sending events", func(t *testing.T) {
		defer mockAPI.AssertExpectations(t)
		defer mockMetrics.AssertExpectations(t)

		mockMetrics.On("IncWebSocketEvent", "out", wsEventJobStop).Once()

		mockAPI.On("PublishWebSocketEvent", wsEventJobStop, map[string]any{
			"job_id": "jobID",
		}, &model.WebsocketBroadcast{
			UserId:              "botUserID",
			ReliableClusterSend: true,
		}).Once()

		err := p.jobService.StopJob("callChannelID", "jobID", "botUserID", "botConnID")
		require.NoError(t, err)
	})
}

func TestJobServiceApplyEnvOverrides(t *testing.T) {
	t.Run("matching prefix is applied", func(t *testing.T) {
		t.Setenv("MM_CALLS_RECORDER_TLS_CA_CERT_FILE", "/certs/ca.pem")
		data := job.InputData{}
		applyEnvOverrides(data, "MM_CALLS_RECORDER_")
		require.Equal(t, "/certs/ca.pem", data["tls_ca_cert_file"])
	})

	t.Run("non-matching prefix is ignored", func(t *testing.T) {
		t.Setenv("MM_CALLS_TRANSCRIBER_TLS_CA_CERT_FILE", "/certs/ca.pem")
		data := job.InputData{}
		applyEnvOverrides(data, "MM_CALLS_RECORDER_")
		require.Empty(t, data)
	})

	t.Run("key collision: env overrides existing entry", func(t *testing.T) {
		t.Setenv("MM_CALLS_RECORDER_SITE_URL", "https://override.example.com")
		data := job.InputData{"site_url": "https://original.example.com"}
		applyEnvOverrides(data, "MM_CALLS_RECORDER_")
		require.Equal(t, "https://override.example.com", data["site_url"])
	})

	t.Run("equals sign in value is preserved", func(t *testing.T) {
		t.Setenv("MM_CALLS_RECORDER_EXTRA_CHROMIUM_ARGS", "--proxy-server=http://proxy:8080")
		data := job.InputData{}
		applyEnvOverrides(data, "MM_CALLS_RECORDER_")
		require.Equal(t, "--proxy-server=http://proxy:8080", data["extra_chromium_args"])
	})

	t.Run("multiple matching vars all applied", func(t *testing.T) {
		t.Setenv("MM_CALLS_RECORDER_TLS_CA_CERT_FILE", "/certs/ca.pem")
		t.Setenv("MM_CALLS_RECORDER_TLS_INSECURE_SKIP_VERIFY", "true")
		data := job.InputData{}
		applyEnvOverrides(data, "MM_CALLS_RECORDER_")
		require.Equal(t, "/certs/ca.pem", data["tls_ca_cert_file"])
		require.Equal(t, "true", data["tls_insecure_skip_verify"])
	})

	t.Run("key is lowercased", func(t *testing.T) {
		t.Setenv("MM_CALLS_RECORDER_SITE_URL", "http://localhost:8065")
		data := job.InputData{}
		applyEnvOverrides(data, "MM_CALLS_RECORDER_")
		require.Contains(t, data, "site_url")
		require.NotContains(t, data, "SITE_URL")
	})
}
