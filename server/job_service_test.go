// Copyright (c) 2022-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"testing"

	"github.com/mattermost/mattermost-plugin-calls/server/cluster"
	serverMocks "github.com/mattermost/mattermost-plugin-calls/server/mocks/github.com/mattermost/mattermost-plugin-calls/server/interfaces"
	pluginMocks "github.com/mattermost/mattermost-plugin-calls/server/mocks/github.com/mattermost/mattermost/server/public/plugin"
	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/plugin"

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
		mockAPI.On("LogDebug", "stopping job with empty connID", "origin", mock.AnythingOfType("string"),
			"channelID", "callChannelID").Once()

		err := p.jobService.StopJob("callChannelID", "jobID", "botUserID", "")
		require.NoError(t, err)
		mockAPI.AssertNotCalled(t, "PublishWebSocketEvent")
	})

	t.Run("sending events", func(t *testing.T) {
		mockMetrics.On("IncWebSocketEvent", "out", wsEventJobStop).Once()
		mockMetrics.On("IncWebSocketEvent", "out", wsEventCallEnd).Once()

		mockAPI.On("PublishWebSocketEvent", wsEventJobStop, map[string]any{
			"job_id": "jobID",
		}, &model.WebsocketBroadcast{
			UserId:              "botUserID",
			ReliableClusterSend: true,
		}).Once()

		mockAPI.On("PublishWebSocketEvent", wsEventCallEnd, map[string]any{
			"channelID": "callChannelID",
		}, &model.WebsocketBroadcast{
			ConnectionId:        "botConnID",
			ReliableClusterSend: true,
		}).Once()

		err := p.jobService.StopJob("callChannelID", "jobID", "botUserID", "botConnID")
		require.NoError(t, err)
	})
}
