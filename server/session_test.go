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
		state, err := p.addUserSession(cs, model.NewPointer(false), "userID", "connID", "channelID", "", "", model.ChannelTypeOpen)
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
		retState, err := p.addUserSession(nil, model.NewPointer(true), "userA", "connA", "channelID", "", "", model.ChannelTypeOpen)
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

		retState2, err := p.addUserSession(retState, model.NewPointer(true), "userB", "connB", "channelID", "", "", model.ChannelTypeOpen)
		require.NotNil(t, retState2)
		require.EqualError(t, err, "store failure: failed to create call session: failed to run query: pq: duplicate key value violates unique constraint \"calls_sessions_pkey\"")

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

			retState, err := p.addUserSession(nil, model.NewPointer(true), "userA", "connA", "channelID", "", "", model.ChannelTypeOpen)
			require.Equal(t, errGroupCallsNotAllowed, err)
			require.Nil(t, retState)
		})

		t.Run("private channel", func(t *testing.T) {
			mockAPI.On("SendEphemeralPost", "userA", &model.Post{
				ChannelId: "channelID",
				Message:   "app.add_user_session.group_calls_not_allowed_error",
			}).Return(nil).Once()

			retState, err := p.addUserSession(nil, model.NewPointer(true), "userA", "connA", "channelID", "", "", model.ChannelTypePrivate)
			require.Equal(t, errGroupCallsNotAllowed, err)
			require.Nil(t, retState)
		})

		t.Run("group channel", func(t *testing.T) {
			mockAPI.On("SendEphemeralPost", "userA", &model.Post{
				ChannelId: "channelID",
				Message:   "app.add_user_session.group_calls_not_allowed_error",
			}).Return(nil).Once()

			retState, err := p.addUserSession(nil, model.NewPointer(true), "userA", "connA", "channelID", "", "", model.ChannelTypeGroup)
			require.Equal(t, errGroupCallsNotAllowed, err)
			require.Nil(t, retState)
		})

		t.Run("direct channel", func(t *testing.T) {
			mockMetrics.On("IncWebSocketEvent", "out", wsEventCallHostChanged).Once()
			mockAPI.On("PublishWebSocketEvent", wsEventCallHostChanged, mock.Anything,
				&model.WebsocketBroadcast{UserId: "userA", ChannelId: "channelID", ReliableClusterSend: true}).Once()

			retState, err := p.addUserSession(nil, model.NewPointer(true), "userA", "connA", "channelID", "", "", model.ChannelTypeDirect)
			require.NoError(t, err)
			require.NotNil(t, retState)
			require.Equal(t, map[string]struct{}{"userA": {}}, retState.Props.Participants)
			require.Len(t, retState.sessions, 1)
			require.NotNil(t, retState.sessions["connA"])
		})
	})
}

// TestRemoveUserSessionDMAutoEnd covers the multi-device side of the DM auto-end rule. The rule
// is about parties, not connections: a user connected from two devices is still in the call after
// closing one of them, so the call must survive, and only end once their last device is gone.
//
// isDMCallChannel (and with it the auto-end) is only reached when the guard passes, so whether the
// channel is looked up at all is what tells the two cases apart.
func TestRemoveUserSessionDMAutoEnd(t *testing.T) {
	mockAPI := &pluginMocks.MockAPI{}
	mockMetrics := &serverMocks.MockMetrics{}

	botID := model.NewId()
	p := Plugin{
		MattermostPlugin:  plugin.MattermostPlugin{API: mockAPI},
		callsClusterLocks: map[string]*cluster.Mutex{},
		metrics:           mockMetrics,
		configuration:     &configuration{}, // no LiveKitURL: livekitDeleteRoom is a no-op
		botSession:        &model.Session{UserId: botID},
		botID:             botID, // getBotID reads p.botID, not botSession
		sessions:          map[string]*session{},
	}
	p.licenseChecker = enterprise.NewLicenseChecker(p.API)

	store, tearDown := NewTestStore(t)
	t.Cleanup(tearDown)
	p.store = store

	mockMetrics.On("ObserveAppHandlersTime", mock.AnythingOfType("string"), mock.AnythingOfType("float64")).Maybe()
	mockMetrics.On("IncWebSocketEvent", mock.Anything, mock.Anything).Maybe()
	anys := make([]interface{}, 18)
	for i := range anys {
		anys[i] = mock.Anything
	}
	mockAPI.On("LogInfo", append([]interface{}{mock.AnythingOfType("string")}, anys...)...).Maybe()
	mockAPI.On("LogDebug", append([]interface{}{mock.AnythingOfType("string")}, anys...)...).Maybe()
	mockAPI.On("LogError", append([]interface{}{mock.AnythingOfType("string")}, anys...)...).Maybe()
	mockAPI.On("PublishWebSocketEvent", mock.AnythingOfType("string"), mock.Anything,
		mock.AnythingOfType("*model.WebsocketBroadcast")).Maybe()

	// A DM call between userA and userB, with userA connected from two devices.
	buildTwoDeviceCallState := func(t *testing.T, channelID string) *callState {
		t.Helper()

		callID := model.NewId()
		postID := model.NewId()
		createPost(t, store, postID, "userA", channelID)

		call := &public.Call{
			ID:        callID,
			CreateAt:  time.Now().UnixMilli(),
			StartAt:   time.Now().UnixMilli(),
			ChannelID: channelID,
			PostID:    postID,
			ThreadID:  model.NewId(),
			OwnerID:   "userA",
			Props: public.CallProps{
				NodeID: "test-node",
				Participants: map[string]struct{}{
					"userA": {},
					"userB": {},
				},
			},
		}
		require.NoError(t, store.CreateCall(call))

		sessions := map[string]*public.CallSession{}
		for _, s := range []*public.CallSession{
			{ID: "connA", CallID: callID, UserID: "userA", JoinAt: time.Now().UnixMilli()},
			{ID: "connA2", CallID: callID, UserID: "userA", JoinAt: time.Now().UnixMilli()},
			{ID: "connB", CallID: callID, UserID: "userB", JoinAt: time.Now().UnixMilli()},
		} {
			require.NoError(t, store.CreateCallSession(s))
			sessions[s.ID] = s
		}

		return &callState{Call: *call, sessions: sessions}
	}

	t.Run("does not end the call when a user closes one of their two devices", func(t *testing.T) {
		defer ResetTestStore(t, p.store)

		channelID := model.NewId()
		state := buildTwoDeviceCallState(t, channelID)

		err := p.removeUserSession(state, "userA", "connA", "connA", channelID)
		require.NoError(t, err)

		// userA is still in the call on their other device, so both parties remain. No GetChannel
		// expectation is set, so the strict mock would fail the test if the auto-end were reached.
		mockAPI.AssertNotCalled(t, "GetChannel", channelID)
		require.Zero(t, state.Call.EndAt)
		require.Len(t, state.sessions, 2)
	})

	t.Run("ends the call when the last of a user's two devices leaves", func(t *testing.T) {
		defer ResetTestStore(t, p.store)

		channelID := model.NewId()
		state := buildTwoDeviceCallState(t, channelID)

		require.NoError(t, p.removeUserSession(state, "userA", "connA", "connA", channelID))

		// Closing the remaining device leaves userB alone, which is what ends the call. The
		// channel is a regular DM rather than a phone-call container, so the bot is not a member.
		// The channel is read twice: once by the auto-end check, once by isPhoneCallChannel.
		mockAPI.On("GetChannel", channelID).Return(&model.Channel{
			Id:   channelID,
			Type: model.ChannelTypeDirect,
		}, nil).Twice()
		mockAPI.On("GetChannelMembers", channelID, 0, 10).Return(model.ChannelMembers{
			{ChannelId: channelID, UserId: "userA"},
			{ChannelId: channelID, UserId: "userB"},
		}, nil).Once()

		err := p.removeUserSession(state, "userA", "connA2", "connA2", channelID)
		require.NoError(t, err)

		mockAPI.AssertExpectations(t)
		require.Len(t, state.sessions, 1)
	})
}

// TestRemoveUserSessionPhoneCall verifies scenario 1: when the last human leaves
// an outbound phone call (bot-DM container), the lingering SIP participant is
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
		botID:             botID, // getBotID reads p.botID, not botSession
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
		Props:     public.CallProps{NodeID: "test-node"},
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

	// The DM is a phone-call container (bot is a member).
	mockAPI.On("GetChannel", channelID).Return(&model.Channel{Id: channelID, Type: model.ChannelTypeDirect}, nil)
	mockAPI.On("GetChannelMembers", channelID, 0, 10).Return(model.ChannelMembers{{ChannelId: channelID, UserId: botID}}, nil)
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

	mockAPI.AssertCalled(t, "PublishWebSocketEvent", wsEventCallEnd, mock.Anything, mock.Anything)
}
