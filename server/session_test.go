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

	"github.com/stretchr/testify/assert"
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

	t.Run("DM: does not publish call_end when the bot leaves with a real user still connected", func(t *testing.T) {
		defer mockAPI.AssertExpectations(t)
		defer mockMetrics.AssertExpectations(t)
		defer ResetTestStore(t, p.store)

		botID := model.NewId()
		p.botSession = &model.Session{UserId: botID}
		defer func() { p.botSession = nil }()

		channelID := model.NewId()
		state := buildDMCallState(t, channelID)

		// Add a bot session alongside the two real users.
		botConnID := model.NewId()
		err := p.store.CreateCallSession(&public.CallSession{
			ID:     botConnID,
			CallID: state.Call.ID,
			UserID: botID,
			JoinAt: time.Now().UnixMilli(),
		})
		require.NoError(t, err)
		state.sessions[botConnID] = &public.CallSession{
			ID:     botConnID,
			CallID: state.Call.ID,
			UserID: botID,
		}

		err = p.removeUserSession(state, botID, botConnID, botConnID, channelID)
		require.NoError(t, err)

		// wsEventUserLeft and wsEventCallEnd must NOT be published: publishWebSocketEvent
		// suppresses wsEventUserLeft for the bot, and the DM auto-end block skips bot departures.
		require.Zero(t, state.Call.EndAt)
		require.Len(t, state.sessions, 2)
	})

	t.Run("DM: does not publish call_end when a user closes one of their two devices", func(t *testing.T) {
		defer mockAPI.AssertExpectations(t)
		defer mockMetrics.AssertExpectations(t)
		defer ResetTestStore(t, p.store)

		channelID := model.NewId()
		state := buildDMCallState(t, channelID)

		// userA is connected from a second device.
		err := p.store.CreateCallSession(&public.CallSession{
			ID:     "connA2",
			CallID: state.Call.ID,
			UserID: "userA",
			JoinAt: time.Now().UnixMilli(),
		})
		require.NoError(t, err)
		state.sessions["connA2"] = &public.CallSession{
			ID:     "connA2",
			CallID: state.Call.ID,
			UserID: "userA",
		}

		mockMetrics.On("IncWebSocketEvent", "out", wsEventUserLeft).Once()
		mockAPI.On("PublishWebSocketEvent", wsEventUserLeft, map[string]any{
			"session_id": "connA",
			"user_id":    "userA",
		}, &model.WebsocketBroadcast{ChannelId: channelID, ReliableClusterSend: true}).Once()

		err = p.removeUserSession(state, "userA", "connA", "connA", channelID)
		require.NoError(t, err)

		// userA is still in the call on their other device, so both parties remain and the
		// call must survive. No GetChannel or call_end expectations are set, so the strict
		// mock catches an auto-end here.
		require.Zero(t, state.Call.EndAt)
		require.Len(t, state.sessions, 2)
	})

	t.Run("does not publish call_end when the channel can't be read", func(t *testing.T) {
		defer mockAPI.AssertExpectations(t)
		defer mockMetrics.AssertExpectations(t)
		defer ResetTestStore(t, p.store)

		channelID := model.NewId()
		state := buildDMCallState(t, channelID)

		mockAPI.On("GetChannel", channelID).Return(nil, &model.AppError{Message: "failed to get channel"}).Once()

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

func TestRemoveUserSessionCallEndReason(t *testing.T) {
	mockAPI := &pluginMocks.MockAPI{}
	mockMetrics := &serverMocks.MockMetrics{}

	p := Plugin{
		MattermostPlugin: plugin.MattermostPlugin{
			API: mockAPI,
		},
		callsClusterLocks: map[string]*cluster.Mutex{},
		metrics:           mockMetrics,
		sessions:          map[string]*session{},
		dmNoAnswerTimers:  map[string]*time.Timer{},
	}

	store, tearDown := NewTestStore(t)
	t.Cleanup(tearDown)
	p.store = store

	mockMetrics.On("ObserveAppHandlersTime", mock.AnythingOfType("string"), mock.AnythingOfType("float64")).Maybe()
	mockAPI.On("LogDebug", mock.Anything, mock.Anything, mock.Anything,
		mock.Anything, mock.Anything, mock.Anything, mock.Anything,
		mock.Anything, mock.Anything, mock.Anything, mock.Anything).Maybe()
	mockAPI.On("LogError", mock.Anything, mock.Anything, mock.Anything,
		mock.Anything, mock.Anything, mock.Anything, mock.Anything,
		mock.Anything, mock.Anything, mock.Anything, mock.Anything).Maybe()

	// The call is left with a single session so that removing it is what ends the call. participants
	// is the cumulative set of everyone who ever joined, which is what the reason is derived from.
	buildCall := func(t *testing.T, channelID string, participants ...string) *callState {
		t.Helper()

		postID := model.NewId()
		props := public.CallProps{Participants: map[string]struct{}{}}
		for _, userID := range participants {
			props.Participants[userID] = struct{}{}
		}

		call := &public.Call{
			ID:        model.NewId(),
			CreateAt:  time.Now().UnixMilli(),
			ChannelID: channelID,
			StartAt:   time.Now().UnixMilli(),
			PostID:    postID,
			ThreadID:  model.NewId(),
			OwnerID:   "userA",
			Props:     props,
		}
		require.NoError(t, p.store.CreateCall(call))
		require.NoError(t, p.store.CreateCallSession(&public.CallSession{
			ID:     "connA",
			CallID: call.ID,
			UserID: "userA",
			JoinAt: time.Now().UnixMilli(),
		}))
		createPost(t, p.store, postID, "userA", channelID)

		state, err := p.getCallState(channelID, true)
		require.NoError(t, err)
		require.NotNil(t, state)
		require.Len(t, state.sessions, 1)

		return state
	}

	expectUserLeft := func(channelID string) {
		mockMetrics.On("IncWebSocketEvent", "out", wsEventUserLeft).Once()
		mockAPI.On("PublishWebSocketEvent", wsEventUserLeft, map[string]any{
			"session_id": "connA",
			"user_id":    "userA",
		}, &model.WebsocketBroadcast{ChannelId: channelID, ReliableClusterSend: true}).Once()
	}

	t.Run("DM: the caller hanging up before anyone answered cancels the call", func(t *testing.T) {
		defer mockAPI.AssertExpectations(t)
		defer mockMetrics.AssertExpectations(t)
		defer ResetTestStore(t, p.store)

		channelID := model.NewId()
		state := buildCall(t, channelID, "userA")

		expectUserLeft(channelID)
		mockAPI.On("GetChannel", channelID).Return(&model.Channel{
			Id:   channelID,
			Type: model.ChannelTypeDirect,
		}, nil).Once()
		mockAPI.On("GetConfig").Return(&model.Config{}, nil).Once()

		var capturedPost *model.Post
		mockAPI.On("UpdatePost", mock.AnythingOfType("*model.Post")).Run(func(args mock.Arguments) {
			capturedPost = args.Get(0).(*model.Post)
		}).Return(&model.Post{}, nil).Once()

		require.NoError(t, p.removeUserSession(state, "userA", "connA", "connA", channelID))

		require.NotNil(t, capturedPost)
		assert.Equal(t, callStatusCanceledByCaller, capturedPost.GetProp("call_status"))
		assert.Equal(t, []string{"userA"}, capturedPost.GetProp("participants"))
	})

	t.Run("DM: the last participant leaving an answered call ends it", func(t *testing.T) {
		defer mockAPI.AssertExpectations(t)
		defer mockMetrics.AssertExpectations(t)
		defer ResetTestStore(t, p.store)

		channelID := model.NewId()
		state := buildCall(t, channelID, "userA", "userB")

		expectUserLeft(channelID)
		mockAPI.On("GetConfig").Return(&model.Config{}, nil).Once()

		var capturedPost *model.Post
		mockAPI.On("UpdatePost", mock.AnythingOfType("*model.Post")).Run(func(args mock.Arguments) {
			capturedPost = args.Get(0).(*model.Post)
		}).Return(&model.Post{}, nil).Once()

		require.NoError(t, p.removeUserSession(state, "userA", "connA", "connA", channelID))

		require.NotNil(t, capturedPost)
		assert.Equal(t, callStatusEnded, capturedPost.GetProp("call_status"))
		assert.ElementsMatch(t, []string{"userA", "userB"}, capturedPost.GetProp("participants"))
	})

	t.Run("a lone participant leaving ends the call when the channel can't be read", func(t *testing.T) {
		defer mockAPI.AssertExpectations(t)
		defer mockMetrics.AssertExpectations(t)
		defer ResetTestStore(t, p.store)

		channelID := model.NewId()
		state := buildCall(t, channelID, "userA")

		expectUserLeft(channelID)
		mockAPI.On("GetChannel", channelID).Return(nil, &model.AppError{Message: "failed to get channel"}).Once()
		mockAPI.On("GetConfig").Return(&model.Config{}, nil).Once()

		var capturedPost *model.Post
		mockAPI.On("UpdatePost", mock.AnythingOfType("*model.Post")).Run(func(args mock.Arguments) {
			capturedPost = args.Get(0).(*model.Post)
		}).Return(&model.Post{}, nil).Once()

		require.NoError(t, p.removeUserSession(state, "userA", "connA", "connA", channelID))

		// Without knowing it was a DM there's nothing to say it was cancelled rather than ended.
		require.NotNil(t, capturedPost)
		assert.Equal(t, callStatusEnded, capturedPost.GetProp("call_status"))
	})

	t.Run("non-DM: a lone participant leaving ends the call rather than cancelling it", func(t *testing.T) {
		defer mockAPI.AssertExpectations(t)
		defer mockMetrics.AssertExpectations(t)
		defer ResetTestStore(t, p.store)

		channelID := model.NewId()
		state := buildCall(t, channelID, "userA")

		expectUserLeft(channelID)
		mockAPI.On("GetChannel", channelID).Return(&model.Channel{
			Id:   channelID,
			Type: model.ChannelTypeOpen,
		}, nil).Once()
		mockAPI.On("GetConfig").Return(&model.Config{}, nil).Once()

		var capturedPost *model.Post
		mockAPI.On("UpdatePost", mock.AnythingOfType("*model.Post")).Run(func(args mock.Arguments) {
			capturedPost = args.Get(0).(*model.Post)
		}).Return(&model.Post{}, nil).Once()

		require.NoError(t, p.removeUserSession(state, "userA", "connA", "connA", channelID))

		require.NotNil(t, capturedPost)
		assert.Equal(t, callStatusEnded, capturedPost.GetProp("call_status"))
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
