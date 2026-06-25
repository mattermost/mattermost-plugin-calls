// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"testing"
	"time"

	"github.com/mattermost/mattermost-plugin-calls/server/cluster"
	"github.com/mattermost/mattermost-plugin-calls/server/db"
	"github.com/mattermost/mattermost-plugin-calls/server/enterprise"
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
	mockAPI.On("LogInfo", mock.AnythingOfType("string"),
		mock.Anything, mock.Anything, mock.Anything, mock.Anything,
		mock.Anything, mock.Anything, mock.Anything, mock.Anything,
		mock.Anything, mock.Anything, mock.Anything, mock.Anything,
		mock.Anything, mock.Anything).Maybe()

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
		require.EqualError(t, err, "failed to create call session: failed to run query: pq: duplicate key value violates unique constraint \"calls_sessions_pkey\"")

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

// TestRemoveUserSessionPhoneCall verifies that when the last human leaves an
// outbound phone call (props.Type=="phone"), the lingering SIP participant is
// hung up and the call ends, instead of orphaning the PSTN leg.
func TestRemoveUserSessionPhoneCall(t *testing.T) {
	mockAPI := &pluginMocks.MockAPI{}
	mockMetrics := &serverMocks.MockMetrics{}

	botID := model.NewId()
	p := Plugin{
		MattermostPlugin:  plugin.MattermostPlugin{API: mockAPI},
		callsClusterLocks: map[string]*cluster.Mutex{},
		metrics:           mockMetrics,
		configuration:     &configuration{}, // no LiveKitURL: livekitDeleteRoom is a no-op
		botSession:        &model.Session{UserId: botID},
		sessions:          map[string]*session{},
	}
	p.licenseChecker = enterprise.NewLicenseChecker(p.API)

	store, tearDown := NewTestStore(t)
	t.Cleanup(tearDown)
	p.store = store

	mockMetrics.On("ObserveAppHandlersTime", mock.AnythingOfType("string"), mock.AnythingOfType("float64")).Maybe()
	mockMetrics.On("IncWebSocketEvent", mock.Anything, mock.Anything).Maybe()
	// Generous matcher counts: the LogInfo/LogDebug/LogError wrappers prepend an
	// "origin" pair, and testify tolerates extra expected matchers but not extra
	// actual args, so over-provide mock.Anything to match any key-value count.
	anys := make([]interface{}, 18)
	for i := range anys {
		anys[i] = mock.Anything
	}
	mockAPI.On("LogInfo", append([]interface{}{mock.AnythingOfType("string")}, anys...)...).Maybe()
	mockAPI.On("LogDebug", append([]interface{}{mock.AnythingOfType("string")}, anys...)...).Maybe()
	mockAPI.On("LogError", append([]interface{}{mock.AnythingOfType("string")}, anys...)...).Maybe()
	mockAPI.On("PublishWebSocketEvent", mock.AnythingOfType("string"), mock.Anything,
		mock.AnythingOfType("*model.WebsocketBroadcast")).Maybe()
	mockAPI.On("GetConfig").Return(&model.Config{}, nil)

	channelID := model.NewId()
	postID := model.NewId()
	humanConnID := model.NewId()
	humanUserID := model.NewId()
	sipSid := model.NewId()
	callID := model.NewId()

	createPost(t, store, postID, humanUserID, channelID)
	call := &public.Call{
		ID:        callID,
		CreateAt:  time.Now().UnixMilli(),
		StartAt:   time.Now().UnixMilli(),
		ChannelID: channelID,
		PostID:    postID,
		ThreadID:  model.NewId(),
		OwnerID:   humanUserID,
		Props:     public.CallProps{NodeID: "test-node", Type: callTypePhone},
	}
	require.NoError(t, store.CreateCall(call))

	humanSession := &public.CallSession{ID: humanConnID, CallID: callID, UserID: humanUserID, JoinAt: time.Now().UnixMilli()}
	sipSession := &public.CallSession{ID: sipSid, CallID: callID, UserID: "+14155551234", JoinAt: time.Now().UnixMilli(), IsSIPParticipant: true}
	require.NoError(t, store.CreateCallSession(humanSession))
	require.NoError(t, store.CreateCallSession(sipSession))

	state := &callState{
		Call:     *call,
		sessions: map[string]*public.CallSession{humanConnID: humanSession, sipSid: sipSession},
	}

	// The phone-teardown rules are gated on the call type (props.Type=="phone").
	mockAPI.On("UpdatePost", mock.AnythingOfType("*model.Post")).Return(&model.Post{Id: postID}, nil)

	err := p.removeUserSession(state, humanUserID, humanConnID, humanConnID, channelID)
	require.NoError(t, err)

	// The SIP session was dropped and the call ended.
	require.Empty(t, state.sessions)
	ended, err := store.GetCall(callID, db.GetCallOpts{})
	require.NoError(t, err)
	require.Greater(t, ended.EndAt, int64(0))

	sessions, err := store.GetCallSessions(callID, db.GetCallSessionOpts{})
	require.NoError(t, err)
	require.Empty(t, sessions)

	// With LiveKit unconfigured the leg's answered-state can't be determined, so
	// the terminal reason defaults to "canceled" (caller gave up) and is
	// persisted as the durable phone-call log.
	require.Equal(t, sipReasonCanceled, ended.Props.EndReason)

	mockAPI.AssertCalled(t, "PublishWebSocketEvent", wsEventCallEnd, mock.Anything, mock.Anything)
}
