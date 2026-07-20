// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"testing"
	"time"

	"github.com/mattermost/mattermost-plugin-calls/server/cluster"
	"github.com/mattermost/mattermost-plugin-calls/server/enterprise"
	"github.com/mattermost/mattermost-plugin-calls/server/public"

	serverMocks "github.com/mattermost/mattermost-plugin-calls/server/mocks/github.com/mattermost/mattermost-plugin-calls/server/interfaces"
	pluginMocks "github.com/mattermost/mattermost-plugin-calls/server/mocks/github.com/mattermost/mattermost/server/public/plugin"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/plugin"

	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
)

func TestRemoveUserSessionDMAutoEnd(t *testing.T) {
	mockAPI := &pluginMocks.MockAPI{}
	mockMetrics := &serverMocks.MockMetrics{}

	p := Plugin{
		MattermostPlugin: plugin.MattermostPlugin{
			API: mockAPI,
		},
		callsClusterLocks: map[string]*cluster.Mutex{},
		metrics:           mockMetrics,
		sessions:          map[string]*session{},
	}

	store, tearDown := NewTestStore(t)
	t.Cleanup(tearDown)
	p.store = store

	mockMetrics.On("ObserveAppHandlersTime", mock.AnythingOfType("string"), mock.AnythingOfType("float64"))
	mockAPI.On("LogDebug", mock.Anything, mock.Anything, mock.Anything,
		mock.Anything, mock.Anything, mock.Anything, mock.Anything,
		mock.Anything, mock.Anything, mock.Anything, mock.Anything).Maybe()
	mockAPI.On("LogError", mock.Anything, mock.Anything, mock.Anything,
		mock.Anything, mock.Anything, mock.Anything, mock.Anything,
		mock.Anything, mock.Anything, mock.Anything, mock.Anything).Maybe()

	buildDMCallState := func(t *testing.T, channelID string) *callState {
		t.Helper()
		call := &public.Call{
			ID:        model.NewId(),
			CreateAt:  time.Now().UnixMilli(),
			ChannelID: channelID,
			StartAt:   time.Now().UnixMilli(),
			PostID:    model.NewId(),
			ThreadID:  model.NewId(),
			OwnerID:   "userA",
			Props: public.CallProps{
				Participants: map[string]struct{}{
					"userA": {},
					"userB": {},
				},
			},
		}
		err := p.store.CreateCall(call)
		require.NoError(t, err)

		err = p.store.CreateCallSession(&public.CallSession{
			ID:     "connA",
			CallID: call.ID,
			UserID: "userA",
			JoinAt: time.Now().UnixMilli(),
		})
		require.NoError(t, err)

		err = p.store.CreateCallSession(&public.CallSession{
			ID:     "connB",
			CallID: call.ID,
			UserID: "userB",
			JoinAt: time.Now().UnixMilli(),
		})
		require.NoError(t, err)

		state, err := p.getCallState(channelID, true)
		require.NoError(t, err)
		require.NotNil(t, state)
		require.Len(t, state.sessions, 2)

		return state
	}

	t.Run("DM: publishes call_end when a real user leaves with another user still connected", func(t *testing.T) {
		defer mockAPI.AssertExpectations(t)
		defer mockMetrics.AssertExpectations(t)
		defer ResetTestStore(t, p.store)

		channelID := model.NewId()
		state := buildDMCallState(t, channelID)

		mockAPI.On("GetChannel", channelID).Return(&model.Channel{
			Id:   channelID,
			Type: model.ChannelTypeDirect,
		}, nil).Once()

		mockMetrics.On("IncWebSocketEvent", "out", wsEventUserLeft).Once()
		mockAPI.On("PublishWebSocketEvent", wsEventUserLeft, map[string]any{
			"session_id": "connA",
			"user_id":    "userA",
		}, &model.WebsocketBroadcast{ChannelId: channelID, ReliableClusterSend: true}).Once()

		mockMetrics.On("IncWebSocketEvent", "out", wsEventCallEnd).Once()
		mockAPI.On("PublishWebSocketEvent", wsEventCallEnd, map[string]any{},
			&model.WebsocketBroadcast{ChannelId: channelID, ReliableClusterSend: true}).Once()

		err := p.removeUserSession(state, "userA", "connA", "connA", channelID)
		require.NoError(t, err)

		// Call should NOT be marked as ended in state (userB is still connected).
		require.Zero(t, state.Call.EndAt)

		// One session (userB) should remain.
		require.Len(t, state.sessions, 1)
	})

	t.Run("non-DM: does not publish call_end when a user leaves with another user still connected", func(t *testing.T) {
		defer mockAPI.AssertExpectations(t)
		defer mockMetrics.AssertExpectations(t)
		defer ResetTestStore(t, p.store)

		channelID := model.NewId()
		state := buildDMCallState(t, channelID)

		mockAPI.On("GetChannel", channelID).Return(&model.Channel{
			Id:   channelID,
			Type: model.ChannelTypeOpen,
		}, nil).Once()

		mockMetrics.On("IncWebSocketEvent", "out", wsEventUserLeft).Once()
		mockAPI.On("PublishWebSocketEvent", wsEventUserLeft, map[string]any{
			"session_id": "connA",
			"user_id":    "userA",
		}, &model.WebsocketBroadcast{ChannelId: channelID, ReliableClusterSend: true}).Once()

		err := p.removeUserSession(state, "userA", "connA", "connA", channelID)
		require.NoError(t, err)

		require.Zero(t, state.Call.EndAt)
		require.Len(t, state.sessions, 1)
	})
}

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
			ClientConfig: ClientConfig{
				DefaultEnabled: model.NewPointer(true),
			},
		},
		sessions: map[string]*session{},
	}

	p.licenseChecker = enterprise.NewLicenseChecker(p.API)

	store, tearDown := NewTestStore(t)
	t.Cleanup(tearDown)
	p.store = store

	mockMetrics.On("ObserveAppHandlersTime", mock.AnythingOfType("string"), mock.AnythingOfType("float64"))

	t.Run("not enabled", func(t *testing.T) {
		defer mockAPI.AssertExpectations(t)
		defer mockMetrics.AssertExpectations(t)

		mockAPI.On("GetConfig").Return(&model.Config{}, nil).Once()
		mockAPI.On("GetLicense").Return(&model.License{
			SkuShortName: "professional",
		}, nil).Once()

		var cs *callState
		state, err := p.addUserSession(cs, model.NewPointer(false), "userID", "connID", "channelID", "", model.ChannelTypeOpen)
		require.Nil(t, state)
		require.EqualError(t, err, "calls are disabled in the channel")
	})

	t.Run("consistent state after error", func(t *testing.T) {
		defer mockAPI.AssertExpectations(t)
		defer mockMetrics.AssertExpectations(t)
		defer ResetTestStore(t, p.store)

		mockAPI.On("GetConfig").Return(&model.Config{}, nil).Once()
		mockAPI.On("GetLicense").Return(&model.License{
			SkuShortName: "professional",
		}, nil).Once()

		// We'd be starting a new call
		mockMetrics.On("IncWebSocketEvent", "out", wsEventCallHostChanged).Once()
		mockAPI.On("PublishWebSocketEvent", wsEventCallHostChanged, mock.Anything,
			&model.WebsocketBroadcast{UserId: "userA", ChannelId: "channelID", ReliableClusterSend: true}).Once()

		// Start call
		retState, err := p.addUserSession(nil, model.NewPointer(true), "userA", "connA", "channelID", "", model.ChannelTypeOpen)
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

		retState2, err := p.addUserSession(retState, model.NewPointer(true), "userB", "connB", "channelID", "", model.ChannelTypeOpen)
		require.NotNil(t, retState2)
		require.ErrorContains(t, err, "failed to create call session: failed to run query: pq: duplicate key value violates unique constraint \"calls_sessions_pkey\"")

		// Verify the original state has not mutated.
		require.Equal(t, map[string]struct{}{"userA": {}}, retState.Props.Participants)
		require.Len(t, retState.sessions, 1)
		require.NotNil(t, retState.sessions["connA"])

		require.Equal(t, retState, retState2)
	})

	t.Run("allow calls in DMs only when unlicensed", func(t *testing.T) {
		defer mockAPI.AssertExpectations(t)
		defer mockMetrics.AssertExpectations(t)
		defer ResetTestStore(t, p.store)

		mockAPI.On("GetConfig").Return(&model.Config{}, nil).Times(6)
		mockAPI.On("GetLicense").Return(&model.License{}, nil).Times(3)

		t.Run("public channel", func(t *testing.T) {
			mockAPI.On("SendEphemeralPost", "userA", &model.Post{
				ChannelId: "channelID",
				Message:   "app.add_user_session.group_calls_not_allowed_error",
			}).Return(nil).Once()

			retState, err := p.addUserSession(nil, model.NewPointer(true), "userA", "connA", "channelID", "", model.ChannelTypeOpen)
			require.Equal(t, errGroupCallsNotAllowed, err)
			require.Nil(t, retState)
		})

		t.Run("private channel", func(t *testing.T) {
			mockAPI.On("SendEphemeralPost", "userA", &model.Post{
				ChannelId: "channelID",
				Message:   "app.add_user_session.group_calls_not_allowed_error",
			}).Return(nil).Once()

			retState, err := p.addUserSession(nil, model.NewPointer(true), "userA", "connA", "channelID", "", model.ChannelTypePrivate)
			require.Equal(t, errGroupCallsNotAllowed, err)
			require.Nil(t, retState)
		})

		t.Run("group channel", func(t *testing.T) {
			mockAPI.On("SendEphemeralPost", "userA", &model.Post{
				ChannelId: "channelID",
				Message:   "app.add_user_session.group_calls_not_allowed_error",
			}).Return(nil).Once()

			retState, err := p.addUserSession(nil, model.NewPointer(true), "userA", "connA", "channelID", "", model.ChannelTypeGroup)
			require.Equal(t, errGroupCallsNotAllowed, err)
			require.Nil(t, retState)
		})

		t.Run("direct channel", func(t *testing.T) {
			mockMetrics.On("IncWebSocketEvent", "out", wsEventCallHostChanged).Once()
			mockAPI.On("PublishWebSocketEvent", wsEventCallHostChanged, mock.Anything,
				&model.WebsocketBroadcast{UserId: "userA", ChannelId: "channelID", ReliableClusterSend: true}).Once()

			retState, err := p.addUserSession(nil, model.NewPointer(true), "userA", "connA", "channelID", "", model.ChannelTypeDirect)
			require.NoError(t, err)
			require.NotNil(t, retState)
			require.Equal(t, map[string]struct{}{"userA": {}}, retState.Props.Participants)
			require.Len(t, retState.sessions, 1)
			require.NotNil(t, retState.sessions["connA"])
		})
	})
}
