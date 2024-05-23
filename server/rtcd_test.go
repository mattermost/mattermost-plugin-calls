// Copyright (c) 2022-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"fmt"
	"testing"
	"time"

	"github.com/mattermost/mattermost/server/public/plugin"

	rtcd "github.com/mattermost/rtcd/service"

	rtcdMocks "github.com/mattermost/mattermost-plugin-calls/server/mocks/github.com/mattermost/mattermost-plugin-calls/server/interfaces"
	pluginMocks "github.com/mattermost/mattermost-plugin-calls/server/mocks/github.com/mattermost/mattermost/server/public/plugin"

	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
)

func TestGetHostForNewCall(t *testing.T) {
	mockAPI := &pluginMocks.MockAPI{}

	t.Run("no hosts", func(t *testing.T) {
		m := &rtcdClientManager{
			ctx: &Plugin{
				MattermostPlugin: plugin.MattermostPlugin{
					API: mockAPI,
				},
			},
			hosts: map[string]*rtcdHost{},
		}
		host, err := m.GetHostForNewCall()
		require.Error(t, err)
		require.EqualError(t, err, "no host available")
		require.Empty(t, host)
	})

	t.Run("all flagged", func(t *testing.T) {
		mockClientA := &rtcdMocks.MockRTCDClient{}
		mockClientB := &rtcdMocks.MockRTCDClient{}
		mockClientC := &rtcdMocks.MockRTCDClient{}

		mockClientA.On("Connected").Return(true).Once()
		mockClientB.On("Connected").Return(true).Once()
		mockClientC.On("Connected").Return(true).Once()

		mockAPI.On("LogDebug", "skipping host from selection", "origin", mock.AnythingOfType("string"),
			"host", "127.0.0.1",
			"flagged", "true",
			"offline", "false",
		).Once()

		mockAPI.On("LogDebug", "skipping host from selection", "origin", mock.AnythingOfType("string"),
			"host", "127.0.0.2",
			"flagged", "true",
			"offline", "false",
		).Once()

		mockAPI.On("LogDebug", "skipping host from selection", "origin", mock.AnythingOfType("string"),
			"host", "127.0.0.3",
			"flagged", "true",
			"offline", "false",
		).Once()

		m := &rtcdClientManager{
			ctx: &Plugin{
				MattermostPlugin: plugin.MattermostPlugin{
					API: mockAPI,
				},
			},
			hosts: map[string]*rtcdHost{
				"127.0.0.1": {
					ip:      "127.0.0.1",
					flagged: true,
					client:  mockClientA,
				},
				"127.0.0.2": {
					ip:      "127.0.0.2",
					flagged: true,
					client:  mockClientB,
				},
				"127.0.0.3": {
					ip:      "127.0.0.3",
					flagged: true,
					client:  mockClientC,
				},
			},
		}

		host, err := m.GetHostForNewCall()
		require.Error(t, err)
		require.EqualError(t, err, "no host available")
		require.Empty(t, host)
	})

	t.Run("all offline", func(t *testing.T) {
		mockClientA := &rtcdMocks.MockRTCDClient{}
		mockClientB := &rtcdMocks.MockRTCDClient{}
		mockClientC := &rtcdMocks.MockRTCDClient{}

		mockClientA.On("Connected").Return(false).Once()
		mockClientB.On("Connected").Return(false).Once()
		mockClientC.On("Connected").Return(false).Once()

		mockAPI.On("LogDebug", "skipping host from selection", "origin", mock.AnythingOfType("string"),
			"host", "127.0.0.1",
			"flagged", "false",
			"offline", "true",
		).Once()

		mockAPI.On("LogDebug", "skipping host from selection", "origin", mock.AnythingOfType("string"),
			"host", "127.0.0.2",
			"flagged", "false",
			"offline", "true",
		).Once()

		mockAPI.On("LogDebug", "skipping host from selection", "origin", mock.AnythingOfType("string"),
			"host", "127.0.0.3",
			"flagged", "false",
			"offline", "true",
		).Once()

		m := &rtcdClientManager{
			ctx: &Plugin{
				MattermostPlugin: plugin.MattermostPlugin{
					API: mockAPI,
				},
			},
			hosts: map[string]*rtcdHost{
				"127.0.0.1": {
					ip:     "127.0.0.1",
					client: mockClientA,
				},
				"127.0.0.2": {
					ip:     "127.0.0.2",
					client: mockClientB,
				},
				"127.0.0.3": {
					ip:     "127.0.0.3",
					client: mockClientC,
				},
			},
		}

		host, err := m.GetHostForNewCall()
		require.Error(t, err)
		require.EqualError(t, err, "no host available")
		require.Empty(t, host)
	})

	t.Run("load balancing", func(t *testing.T) {
		mockClientA := &rtcdMocks.MockRTCDClient{}
		mockClientB := &rtcdMocks.MockRTCDClient{}
		mockClientC := &rtcdMocks.MockRTCDClient{}

		m := &rtcdClientManager{
			ctx: &Plugin{
				MattermostPlugin: plugin.MattermostPlugin{
					API: mockAPI,
				},
			},
			hosts: map[string]*rtcdHost{
				"127.0.0.1": {
					ip:      "127.0.0.1",
					flagged: false,
					client:  mockClientA,
				},
				"127.0.0.2": {
					ip:      "127.0.0.2",
					flagged: false,
					client:  mockClientB,
				},
				"127.0.0.3": {
					ip:      "127.0.0.3",
					flagged: false,
					client:  mockClientC,
				},
			},
		}

		t.Run("equal loads", func(t *testing.T) {
			mockClientA.On("Connected").Return(true).Once()
			mockClientB.On("Connected").Return(true).Once()
			mockClientC.On("Connected").Return(true).Once()

			mockClientA.On("GetSystemInfo").Return(rtcd.SystemInfo{
				CPULoad: 1.00,
			}, nil).Once()

			mockClientB.On("GetSystemInfo").Return(rtcd.SystemInfo{
				CPULoad: 1.00,
			}, nil).Once()

			mockClientC.On("GetSystemInfo").Return(rtcd.SystemInfo{
				CPULoad: 1.00,
			}, nil).Once()

			mockAPI.On("LogDebug", "got system info for rtcd host", "origin", mock.AnythingOfType("string"),
				"host", "127.0.0.1",
				"info", "{CPULoad:1}",
			).Once()

			mockAPI.On("LogDebug", "got system info for rtcd host", "origin", mock.AnythingOfType("string"),
				"host", "127.0.0.2",
				"info", "{CPULoad:1}",
			).Once()

			mockAPI.On("LogDebug", "got system info for rtcd host", "origin", mock.AnythingOfType("string"),
				"host", "127.0.0.3",
				"info", "{CPULoad:1}",
			).Once()

			host, err := m.GetHostForNewCall()
			require.NoError(t, err)
			require.NotEmpty(t, host)
		})

		t.Run("different loads", func(t *testing.T) {
			mockClientA.On("Connected").Return(true).Once()
			mockClientB.On("Connected").Return(true).Once()
			mockClientC.On("Connected").Return(true).Once()

			mockClientA.On("GetSystemInfo").Return(rtcd.SystemInfo{
				CPULoad: 1.00,
			}, nil).Once()

			mockClientB.On("GetSystemInfo").Return(rtcd.SystemInfo{
				CPULoad: 0.45,
			}, nil).Once()

			mockClientC.On("GetSystemInfo").Return(rtcd.SystemInfo{
				CPULoad: 1.00,
			}, nil).Once()

			mockAPI.On("LogDebug", "got system info for rtcd host", "origin", mock.AnythingOfType("string"),
				"host", "127.0.0.1",
				"info", "{CPULoad:1}",
			).Once()

			mockAPI.On("LogDebug", "got system info for rtcd host", "origin", mock.AnythingOfType("string"),
				"host", "127.0.0.2",
				"info", "{CPULoad:0.45}",
			).Once()

			mockAPI.On("LogDebug", "got system info for rtcd host", "origin", mock.AnythingOfType("string"),
				"host", "127.0.0.3",
				"info", "{CPULoad:1}",
			).Once()

			host, err := m.GetHostForNewCall()
			require.NoError(t, err)
			require.Equal(t, "127.0.0.2", host)
		})

		t.Run("response errors", func(t *testing.T) {
			mockClientA.On("Connected").Return(true).Once()
			mockClientB.On("Connected").Return(true).Once()
			mockClientC.On("Connected").Return(true).Once()

			mockClientA.On("GetSystemInfo").Return(rtcd.SystemInfo{}, fmt.Errorf("request failed")).Once()
			mockClientB.On("GetSystemInfo").Return(rtcd.SystemInfo{}, fmt.Errorf("request failed")).Once()
			mockClientC.On("GetSystemInfo").Return(rtcd.SystemInfo{}, fmt.Errorf("request failed")).Once()

			mockAPI.On("LogError", "failed to get rtcd system info", "origin", mock.AnythingOfType("string"),
				"host", "127.0.0.1",
				"err", "request failed",
			).Once()

			mockAPI.On("LogError", "failed to get rtcd system info", "origin", mock.AnythingOfType("string"),
				"host", "127.0.0.2",
				"err", "request failed",
			).Once()

			mockAPI.On("LogError", "failed to get rtcd system info", "origin", mock.AnythingOfType("string"),
				"host", "127.0.0.3",
				"err", "request failed",
			).Once()

			host, err := m.GetHostForNewCall()
			require.NoError(t, err)
			require.NotEmpty(t, host)
		})

		t.Run("some flagged or offline", func(t *testing.T) {
			m.hosts["127.0.0.1"].flagged = true
			mockClientA.On("Connected").Return(true).Once()
			mockClientB.On("Connected").Return(false).Once()
			mockClientC.On("Connected").Return(true).Once()
			mockClientC.On("GetSystemInfo").Return(rtcd.SystemInfo{
				CPULoad: 1.00,
			}, nil).Once()

			mockAPI.On("LogDebug", "got system info for rtcd host", "origin", mock.AnythingOfType("string"),
				"host", "127.0.0.3",
				"info", "{CPULoad:1}",
			).Once()

			mockAPI.On("LogDebug", "skipping host from selection", "origin", mock.AnythingOfType("string"),
				"host", "127.0.0.1",
				"flagged", "true",
				"offline", "false",
			).Once()

			mockAPI.On("LogDebug", "skipping host from selection", "origin", mock.AnythingOfType("string"),
				"host", "127.0.0.2",
				"flagged", "false",
				"offline", "true",
			).Once()

			host, err := m.GetHostForNewCall()
			require.NoError(t, err)
			require.Equal(t, "127.0.0.3", host)
		})
	})
}

func TestResolveURL(t *testing.T) {
	ips, port, err := resolveURL("https://localhost:8045", time.Second)
	require.NoError(t, err)
	require.NotEmpty(t, ips)
	require.Equal(t, "127.0.0.1", ips[0].String())
	require.Equal(t, "8045", port)

	ips, port, err = resolveURL("http://127.0.0.1:8055", time.Second)
	require.NoError(t, err)
	require.NotEmpty(t, ips)
	require.Equal(t, "127.0.0.1", ips[0].String())
	require.Equal(t, "8055", port)
}
