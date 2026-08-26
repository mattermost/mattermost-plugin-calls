// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"testing"
	"time"

	"github.com/mattermost/mattermost-plugin-calls/server/cluster"
	"github.com/mattermost/mattermost-plugin-calls/server/db"
	"github.com/mattermost/mattermost-plugin-calls/server/public"
	rtcd "github.com/mattermost/rtcd/service"
	"github.com/mattermost/rtcd/service/rtc"

	serverMocks "github.com/mattermost/mattermost-plugin-calls/server/mocks/github.com/mattermost/mattermost-plugin-calls/server/interfaces"
	pluginMocks "github.com/mattermost/mattermost-plugin-calls/server/mocks/github.com/mattermost/mattermost/server/public/plugin"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/plugin"

	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
)

func TestReconcileRTCDSessions(t *testing.T) {
	mockAPI := &pluginMocks.MockAPI{}
	mockMetrics := &serverMocks.MockMetrics{}

	p := &Plugin{
		MattermostPlugin: plugin.MattermostPlugin{
			API: mockAPI,
		},
		metrics:           mockMetrics,
		callsClusterLocks: map[string]*cluster.Mutex{},
		sessions:          map[string]*session{},
	}

	store, tearDown := NewTestStore(t)
	t.Cleanup(tearDown)
	p.store = store

	mockMetrics.On("ObserveAppHandlersTime", mock.AnythingOfType("string"), mock.AnythingOfType("float64")).Maybe()
	mockMetrics.On("ObserveClusterMutexGrabTime", "mutex_call", mock.AnythingOfType("float64")).Maybe()
	mockMetrics.On("ObserveClusterMutexLockedTime", "mutex_call", mock.AnythingOfType("float64")).Maybe()
	mockAPI.On("LogDebug", mock.Anything, mock.Anything, mock.Anything,
		mock.Anything, mock.Anything, mock.Anything, mock.Anything,
		mock.Anything, mock.Anything, mock.Anything, mock.Anything).Maybe()
	mockAPI.On("LogError", mock.Anything, mock.Anything, mock.Anything,
		mock.Anything, mock.Anything, mock.Anything, mock.Anything,
		mock.Anything, mock.Anything, mock.Anything, mock.Anything).Maybe()
	mockAPI.On("LogInfo", mock.Anything, mock.Anything, mock.Anything,
		mock.Anything, mock.Anything, mock.Anything, mock.Anything,
		mock.Anything, mock.Anything, mock.Anything, mock.Anything).Maybe()

	newCall := func(t *testing.T, channelID, postID, userID string, rtcdHost string) *public.Call {
		t.Helper()
		call := &public.Call{
			ID:        model.NewId(),
			CreateAt:  time.Now().UnixMilli(),
			ChannelID: channelID,
			StartAt:   time.Now().UnixMilli(),
			PostID:    postID,
			ThreadID:  model.NewId(),
			OwnerID:   userID,
			Props: public.CallProps{
				RTCDHost: rtcdHost,
			},
		}
		err := p.store.CreateCall(call)
		require.NoError(t, err)
		return call
	}

	newSession := func(t *testing.T, callID, sessionID, userID string) {
		t.Helper()
		err := p.store.CreateCallSession(&public.CallSession{
			ID:     sessionID,
			CallID: callID,
			UserID: userID,
			JoinAt: time.Now().UnixMilli(),
		})
		require.NoError(t, err)
	}

	// newOldSession creates a session with a JoinAt old enough to be outside the
	// reconciler's grace window, so it will be treated as a candidate for deletion.
	newOldSession := func(t *testing.T, callID, sessionID, userID string) {
		t.Helper()
		err := p.store.CreateCallSession(&public.CallSession{
			ID:     sessionID,
			CallID: callID,
			UserID: userID,
			JoinAt: time.Now().Add(-2 * rtcdSessionReconcilerInterval).UnixMilli(),
		})
		require.NoError(t, err)
	}

	t.Run("no active calls", func(_ *testing.T) {
		p.rtcdManager = &rtcdClientManager{
			ctx:   p,
			hosts: map[string]*rtcdHost{},
		}
		// Should be a no-op without errors.
		p.reconcileRTCDSessions()
	})

	t.Run("call without rtcd host skipped", func(t *testing.T) {
		defer ResetTestStore(t, p.store)

		channelID := model.NewId()
		postID := model.NewId()
		userID := model.NewId()

		call := newCall(t, channelID, postID, userID, "")
		newSession(t, call.ID, model.NewId(), userID)

		p.rtcdManager = &rtcdClientManager{
			ctx:   p,
			hosts: map[string]*rtcdHost{},
		}

		p.reconcileRTCDSessions()

		// Session should be untouched.
		sessions, err := p.store.GetCallSessions(call.ID, db.GetCallSessionOpts{})
		require.NoError(t, err)
		require.Len(t, sessions, 1)
	})

	t.Run("rtcd host not found in manager skipped", func(t *testing.T) {
		defer ResetTestStore(t, p.store)

		channelID := model.NewId()
		postID := model.NewId()
		userID := model.NewId()

		call := newCall(t, channelID, postID, userID, "127.0.0.1")
		newSession(t, call.ID, model.NewId(), userID)

		// Manager has no hosts configured.
		p.rtcdManager = &rtcdClientManager{
			ctx:   p,
			hosts: map[string]*rtcdHost{},
		}

		p.reconcileRTCDSessions()

		// Session should be untouched — cleanUpState handles the gone-host path.
		sessions, err := p.store.GetCallSessions(call.ID, db.GetCallSessionOpts{})
		require.NoError(t, err)
		require.Len(t, sessions, 1)
	})

	t.Run("all sessions live in rtcd, no orphans", func(t *testing.T) {
		defer ResetTestStore(t, p.store)

		channelID := model.NewId()
		postID := model.NewId()
		userID := model.NewId()
		sessionID := model.NewId()

		call := newCall(t, channelID, postID, userID, "127.0.0.1")
		newSession(t, call.ID, sessionID, userID)

		mockRTCDClient := &serverMocks.MockRTCDClient{}
		defer mockRTCDClient.AssertExpectations(t)

		p.rtcdManager = &rtcdClientManager{
			ctx: p,
			hosts: map[string]*rtcdHost{
				"127.0.0.1": {client: mockRTCDClient},
			},
		}

		mockRTCDClient.On("GetVersionInfo").Return(rtcd.VersionInfo{}, nil).Once()
		mockRTCDClient.On("GetSessions", call.ID).Return([]rtc.SessionConfig{
			{SessionID: sessionID},
		}, 200, nil).Once()

		p.reconcileRTCDSessions()

		// Session and call should be untouched.
		sessions, err := p.store.GetCallSessions(call.ID, db.GetCallSessionOpts{})
		require.NoError(t, err)
		require.Len(t, sessions, 1)

		calls, err := p.store.GetAllActiveCalls(db.GetCallOpts{})
		require.NoError(t, err)
		require.Len(t, calls, 1)
	})

	t.Run("one orphaned session among live ones", func(t *testing.T) {
		defer ResetTestStore(t, p.store)

		channelID := model.NewId()
		postID := model.NewId()
		userID := model.NewId()
		liveSessionID := model.NewId()
		orphanedSessionID := model.NewId()

		call := newCall(t, channelID, postID, userID, "127.0.0.1")
		newSession(t, call.ID, liveSessionID, userID)
		newOldSession(t, call.ID, orphanedSessionID, model.NewId())

		mockRTCDClient := &serverMocks.MockRTCDClient{}
		defer mockRTCDClient.AssertExpectations(t)

		p.rtcdManager = &rtcdClientManager{
			ctx: p,
			hosts: map[string]*rtcdHost{
				"127.0.0.1": {client: mockRTCDClient},
			},
		}

		// RTCD only knows about the live session.
		mockRTCDClient.On("GetVersionInfo").Return(rtcd.VersionInfo{}, nil).Once()
		mockRTCDClient.On("GetSessions", call.ID).Return([]rtc.SessionConfig{
			{SessionID: liveSessionID},
		}, 200, nil).Once()

		p.reconcileRTCDSessions()

		// Orphaned session deleted, live session kept, call still active.
		sessions, err := p.store.GetCallSessions(call.ID, db.GetCallSessionOpts{})
		require.NoError(t, err)
		require.Len(t, sessions, 1)
		require.NotNil(t, sessions[liveSessionID])

		calls, err := p.store.GetAllActiveCalls(db.GetCallOpts{})
		require.NoError(t, err)
		require.Len(t, calls, 1)
	})

	t.Run("all sessions orphaned, call state cleaned up", func(t *testing.T) {
		defer ResetTestStore(t, p.store)

		channelID := model.NewId()
		postID := model.NewId()
		userID := model.NewId()
		sessionID := model.NewId()

		call := newCall(t, channelID, postID, userID, "127.0.0.1")
		createPost(t, store, postID, userID, channelID)
		newOldSession(t, call.ID, sessionID, userID)

		mockRTCDClient := &serverMocks.MockRTCDClient{}
		defer mockRTCDClient.AssertExpectations(t)

		p.rtcdManager = &rtcdClientManager{
			ctx: p,
			hosts: map[string]*rtcdHost{
				"127.0.0.1": {client: mockRTCDClient},
			},
		}

		// RTCD has no sessions for this call — they've all ended.
		mockRTCDClient.On("GetVersionInfo").Return(rtcd.VersionInfo{}, nil).Once()
		mockRTCDClient.On("GetSessions", call.ID).Return(nil, 404, nil).Once()

		mockAPI.On("KVSetWithOptions", mock.Anything, mock.Anything, mock.Anything).Return(true, nil).Once()
		mockAPI.On("KVDelete", "mutex_call_"+channelID).Return(nil).Once()
		mockAPI.On("UpdatePost", mock.AnythingOfType("*model.Post")).Return(&model.Post{Id: postID}, nil).Once()
		mockAPI.On("GetConfig").Return(&model.Config{}, nil).Once()

		p.reconcileRTCDSessions()

		// Both the session and the call should be cleaned up.
		sessions, err := p.store.GetCallSessions(call.ID, db.GetCallSessionOpts{})
		require.NoError(t, err)
		require.Empty(t, sessions)

		calls, err := p.store.GetAllActiveCalls(db.GetCallOpts{})
		require.NoError(t, err)
		require.Empty(t, calls)
	})

	t.Run("new session within grace period not deleted", func(t *testing.T) {
		defer ResetTestStore(t, p.store)

		channelID := model.NewId()
		postID := model.NewId()
		userID := model.NewId()

		call := newCall(t, channelID, postID, userID, "127.0.0.1")

		// Session created just now: the plugin writes the DB row before sending
		// ClientMessageJoin, so RTCD may not know about it yet. The reconciler
		// must not delete it.
		newSessionID := model.NewId()
		err := p.store.CreateCallSession(&public.CallSession{
			ID:     newSessionID,
			CallID: call.ID,
			UserID: userID,
			JoinAt: time.Now().UnixMilli(),
		})
		require.NoError(t, err)

		mockRTCDClient := &serverMocks.MockRTCDClient{}
		defer mockRTCDClient.AssertExpectations(t)

		p.rtcdManager = &rtcdClientManager{
			ctx: p,
			hosts: map[string]*rtcdHost{
				"127.0.0.1": {client: mockRTCDClient},
			},
		}

		// RTCD has no sessions — the join hasn't been processed there yet.
		mockRTCDClient.On("GetVersionInfo").Return(rtcd.VersionInfo{}, nil).Once()
		mockRTCDClient.On("GetSessions", call.ID).Return(nil, 404, nil).Once()

		p.reconcileRTCDSessions()

		// The new session must not have been deleted.
		sessions, err := p.store.GetCallSessions(call.ID, db.GetCallSessionOpts{})
		require.NoError(t, err)
		require.Len(t, sessions, 1)
		require.NotNil(t, sessions[newSessionID])

		// Call still active.
		calls, err := p.store.GetAllActiveCalls(db.GetCallOpts{})
		require.NoError(t, err)
		require.Len(t, calls, 1)
	})

	t.Run("retry: sessions already deleted, call state cleanup retried", func(t *testing.T) {
		defer ResetTestStore(t, p.store)

		// Simulate a prior pass that deleted all orphaned sessions but failed
		// at cleanCallState — the call row is still active but has no sessions.
		channelID := model.NewId()
		postID := model.NewId()
		userID := model.NewId()

		call := newCall(t, channelID, postID, userID, "127.0.0.1")
		createPost(t, store, postID, userID, channelID)
		// No sessions created — previous pass already deleted them.

		mockRTCDClient := &serverMocks.MockRTCDClient{}
		defer mockRTCDClient.AssertExpectations(t)

		p.rtcdManager = &rtcdClientManager{
			ctx: p,
			hosts: map[string]*rtcdHost{
				"127.0.0.1": {client: mockRTCDClient},
			},
		}

		mockRTCDClient.On("GetVersionInfo").Return(rtcd.VersionInfo{}, nil).Once()
		mockRTCDClient.On("GetSessions", call.ID).Return(nil, 404, nil).Once()

		mockAPI.On("KVSetWithOptions", mock.Anything, mock.Anything, mock.Anything).Return(true, nil).Once()
		mockAPI.On("KVDelete", "mutex_call_"+channelID).Return(nil).Once()
		mockAPI.On("UpdatePost", mock.AnythingOfType("*model.Post")).Return(&model.Post{Id: postID}, nil).Once()
		mockAPI.On("GetConfig").Return(&model.Config{}, nil).Once()

		p.reconcileRTCDSessions()

		// Call should be ended even though there were no sessions to delete this pass.
		calls, err := p.store.GetAllActiveCalls(db.GetCallOpts{})
		require.NoError(t, err)
		require.Empty(t, calls)
	})
}
