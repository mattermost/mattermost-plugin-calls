// Copyright (c) 2022-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"testing"
	"time"

	"github.com/mattermost/mattermost-plugin-calls/server/cluster"
	"github.com/mattermost/mattermost-plugin-calls/server/public"

	serverMocks "github.com/mattermost/mattermost-plugin-calls/server/mocks/github.com/mattermost/mattermost-plugin-calls/server/interfaces"
	pluginMocks "github.com/mattermost/mattermost-plugin-calls/server/mocks/github.com/mattermost/mattermost/server/public/plugin"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/plugin"

	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
)

func TestAddUserSession(t *testing.T) {
	mockAPI := &pluginMocks.MockAPI{}
	mockMetrics := &serverMocks.MockMetrics{}

	p := Plugin{
		MattermostPlugin: plugin.MattermostPlugin{
			API: mockAPI,
		},
		callsClusterLocks: map[string]*cluster.Mutex{},
		metrics:           mockMetrics,
		configuration: &configuration{
			clientConfig: clientConfig{
				DefaultEnabled: model.NewBool(true),
			},
		},
		sessions: map[string]*session{},
	}

	store, tearDown := NewTestStore(t)
	t.Cleanup(tearDown)
	p.store = store

	mockAPI.On("LogDebug", mock.Anything, mock.Anything, mock.Anything,
		mock.Anything, mock.Anything, mock.Anything, mock.Anything,
		mock.Anything, mock.Anything, mock.Anything, mock.Anything)
	mockAPI.On("KVSetWithOptions", mock.Anything, mock.Anything, mock.Anything).Return(true, nil)
	mockMetrics.On("ObserveClusterMutexGrabTime", "mutex_call", mock.AnythingOfType("float64"))
	mockMetrics.On("ObserveClusterMutexLockedTime", "mutex_call", mock.AnythingOfType("float64"))
	mockMetrics.On("ObserveAppHandlersTime", mock.AnythingOfType("string"), mock.AnythingOfType("float64"))
	mockMetrics.On("IncStoreOp", "KVGet")
	mockMetrics.On("IncStoreOp", "KVSet")

	t.Run("not enabled", func(t *testing.T) {
		var cs *callState
		state, err := p.addUserSession(cs, model.NewBool(false), "userID", "connID", "channelID", "")
		require.Nil(t, state)
		require.EqualError(t, err, "calls are not enabled")
	})

	t.Run("consistent state after error", func(t *testing.T) {
		// We'd be starting a new call
		mockMetrics.On("IncWebSocketEvent", "out", wsEventCallHostChanged).Once()
		mockAPI.On("PublishWebSocketEvent", wsEventCallHostChanged, mock.Anything,
			&model.WebsocketBroadcast{UserId: "userA", ChannelId: "channelID", ReliableClusterSend: true}).Once()

		// Start call
		retState, err := p.addUserSession(nil, model.NewBool(true), "userA", "connA", "channelID", "")
		require.NoError(t, err)
		require.NotNil(t, retState)
		require.Equal(t, map[string]struct{}{"userA": {}}, retState.Props.Participants)
		require.Len(t, retState.sessions, 1)
		require.NotNil(t, retState.sessions["connA"])

		// We create the session so that addUserSession will fail on duplicate entry.
		err = p.store.CreateCallSession(&public.CallSession{
			ID:     "connB",
			CallID: "callID",
			UserID: "userB",
			JoinAt: time.Now().UnixMilli(),
		})
		require.NoError(t, err)

		retState2, err := p.addUserSession(retState, model.NewBool(true), "userB", "connB", "channelID", "")
		require.NotNil(t, retState2)
		require.EqualError(t, err, "failed to create call session: failed to run query: pq: duplicate key value violates unique constraint \"calls_sessions_pkey\"")

		// Verify the original state has not mutated.
		require.Equal(t, map[string]struct{}{"userA": {}}, retState.Props.Participants)
		require.Len(t, retState.sessions, 1)
		require.NotNil(t, retState.sessions["connA"])

		require.Equal(t, retState, retState2)
	})
}
