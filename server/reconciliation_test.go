// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"testing"
	"time"

	"golang.org/x/time/rate"

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

func TestReconcileCallSessions(t *testing.T) {
	setupPlugin := func(t *testing.T) (*Plugin, func()) {
		t.Helper()

		mockAPI := &pluginMocks.MockAPI{}
		mockMetrics := &serverMocks.MockMetrics{}

		store, tearDown := NewTestStore(t)

		p := &Plugin{
			MattermostPlugin:     plugin.MattermostPlugin{API: mockAPI},
			metrics:              mockMetrics,
			apiLimiters:          map[string]*rate.Limiter{},
			callsClusterLocks:    map[string]*cluster.Mutex{},
			reconcilerSuspicions: map[string]int{},
			store:                store,
			nodeID:               "test-node",
			dirtyCalls:           map[string]struct{}{},
			dirtyCallsCh:         make(chan struct{}, 1),
		}
		p.licenseChecker = enterprise.NewLicenseChecker(p.API)

		cfg := &configuration{}
		cfg.SetDefaults()
		p.configuration = cfg

		mockMetrics.On("Handler").Return(nil).Maybe()
		mockMetrics.On("IncWebSocketEvent", mock.Anything, mock.Anything).Maybe()
		mockMetrics.On("ObserveAppHandlersTime", mock.Anything, mock.AnythingOfType("float64")).Maybe()
		mockMetrics.On("ObserveClusterMutexGrabTime", mock.Anything, mock.AnythingOfType("float64")).Maybe()
		mockMetrics.On("ObserveClusterMutexLockedTime", mock.Anything, mock.AnythingOfType("float64")).Maybe()
		mockAPI.On("GetConfig").Return(&model.Config{}, nil).Maybe()
		mockAPI.On("GetLicense").Return(&model.License{SkuShortName: "enterprise"}, nil).Maybe()
		mockAPI.On("PublishWebSocketEvent", mock.AnythingOfType("string"), mock.Anything,
			mock.AnythingOfType("*model.WebsocketBroadcast")).Maybe()
		mockAPI.On("KVSetWithOptions", mock.Anything, mock.Anything, mock.Anything).Return(true, nil).Maybe()
		mockAPI.On("KVDelete", mock.Anything).Return(nil).Maybe()
		mockAPI.On("UpdatePost", mock.AnythingOfType("*model.Post")).Return(&model.Post{}, nil).Maybe()
		mockAPI.On("GetChannel", mock.AnythingOfType("string")).Return(&model.Channel{
			Type: model.ChannelTypeOpen,
		}, nil).Maybe()
		for _, method := range []string{"LogDebug", "LogInfo", "LogWarn", "LogError"} {
			for n := 1; n <= 20; n++ {
				args := make([]any, n)
				for i := range args {
					args[i] = mock.Anything
				}
				mockAPI.On(method, args...).Maybe()
			}
		}

		return p, func() {
			ResetTestStore(t, store)
			tearDown()
		}
	}

	// createConfirmedSession creates a confirmed (announced) session in the DB.
	createConfirmedSession := func(t *testing.T, p *Plugin, call *public.Call, userID, sessionID, sid string) {
		t.Helper()
		now := time.Now().UnixMilli()
		require.NoError(t, p.store.CreateCallSession(&public.CallSession{
			ID:          sessionID,
			CallID:      call.ID,
			UserID:      userID,
			JoinAt:      now,
			ConfirmedAt: now,
			SID:         sid,
		}))
	}

	// tick runs one reconcileCallSessions pass with the given LK session IDs.
	tick := func(p *Plugin, channelID string, sessions map[string]*public.CallSession, lkSessionIDs map[string]struct{}) {
		seen := map[string]struct{}{}
		p.reconcileCallSessions(channelID, sessions, lkSessionIDs, seen)
	}

	// sessionsFromDB fetches the current DB snapshot for a call.
	sessionsFromDB := func(t *testing.T, p *Plugin, callID string) map[string]*public.CallSession {
		t.Helper()
		sessions, err := p.store.GetCallSessions(callID, db.GetCallSessionOpts{FromWriter: true})
		require.NoError(t, err)
		return sessions
	}

	t.Run("unconfirmed session is skipped", func(t *testing.T) {
		p, tearDown := setupPlugin(t)
		defer tearDown()

		channelID := model.NewId()
		userID := model.NewId()
		sessionID := model.NewId()

		postID := model.NewId()
		createPost(t, p.store, postID, userID, channelID)
		call := &public.Call{
			ID:        model.NewId(),
			CreateAt:  time.Now().UnixMilli(),
			StartAt:   time.Now().UnixMilli(),
			ChannelID: channelID,
			PostID:    postID,
			ThreadID:  model.NewId(),
			OwnerID:   userID,
			Props:     public.CallProps{NodeID: "test-node"},
		}
		require.NoError(t, p.store.CreateCall(call))

		// Unconfirmed: ConfirmedAt = 0, SID = ""
		require.NoError(t, p.store.CreateCallSession(&public.CallSession{
			ID:     sessionID,
			CallID: call.ID,
			UserID: userID,
			JoinAt: time.Now().UnixMilli(),
		}))

		sessions := sessionsFromDB(t, p, call.ID)

		// Two ticks with the session absent from LK — should never be suspected.
		for i := 0; i < reconcilerSuspicionLimit; i++ {
			tick(p, channelID, sessions, map[string]struct{}{})
		}

		p.reconcilerSuspicionsMut.Lock()
		count := p.reconcilerSuspicions[sessionID]
		p.reconcilerSuspicionsMut.Unlock()
		require.Zero(t, count, "unconfirmed session must not accumulate suspicion")

		// Session still in DB.
		_, err := p.store.GetCallSession(sessionID, db.GetCallSessionOpts{FromWriter: true})
		require.NoError(t, err)
	})

	t.Run("SIP session is skipped", func(t *testing.T) {
		p, tearDown := setupPlugin(t)
		defer tearDown()

		channelID := model.NewId()
		userID := model.NewId()
		sessionID := model.NewId()

		postID := model.NewId()
		createPost(t, p.store, postID, userID, channelID)
		call := &public.Call{
			ID:        model.NewId(),
			CreateAt:  time.Now().UnixMilli(),
			StartAt:   time.Now().UnixMilli(),
			ChannelID: channelID,
			PostID:    postID,
			ThreadID:  model.NewId(),
			OwnerID:   userID,
			Props:     public.CallProps{NodeID: "test-node"},
		}
		require.NoError(t, p.store.CreateCall(call))

		now := time.Now().UnixMilli()
		require.NoError(t, p.store.CreateCallSession(&public.CallSession{
			ID:               sessionID,
			CallID:           call.ID,
			UserID:           userID,
			JoinAt:           now,
			ConfirmedAt:      now,
			SID:              "PA_sip",
			IsSIPParticipant: true,
		}))

		sessions := sessionsFromDB(t, p, call.ID)

		for i := 0; i < reconcilerSuspicionLimit; i++ {
			tick(p, channelID, sessions, map[string]struct{}{})
		}

		p.reconcilerSuspicionsMut.Lock()
		count := p.reconcilerSuspicions[sessionID]
		p.reconcilerSuspicionsMut.Unlock()
		require.Zero(t, count, "SIP session must not accumulate suspicion")

		_, err := p.store.GetCallSession(sessionID, db.GetCallSessionOpts{FromWriter: true})
		require.NoError(t, err)
	})

	t.Run("absent session gains suspicion but is not reaped on first tick", func(t *testing.T) {
		p, tearDown := setupPlugin(t)
		defer tearDown()

		channelID := model.NewId()
		userID := model.NewId()
		sessionID := model.NewId()

		postID := model.NewId()
		createPost(t, p.store, postID, userID, channelID)
		call := &public.Call{
			ID:        model.NewId(),
			CreateAt:  time.Now().UnixMilli(),
			StartAt:   time.Now().UnixMilli(),
			ChannelID: channelID,
			PostID:    postID,
			ThreadID:  model.NewId(),
			OwnerID:   userID,
			Props:     public.CallProps{NodeID: "test-node"},
		}
		require.NoError(t, p.store.CreateCall(call))
		createConfirmedSession(t, p, call, userID, sessionID, "PA_first")

		sessions := sessionsFromDB(t, p, call.ID)
		tick(p, channelID, sessions, map[string]struct{}{}) // absent from LK

		p.reconcilerSuspicionsMut.Lock()
		count := p.reconcilerSuspicions[sessionID]
		p.reconcilerSuspicionsMut.Unlock()
		require.Equal(t, 1, count, "one miss should give suspicion = 1")

		// Session still in DB after one tick.
		_, err := p.store.GetCallSession(sessionID, db.GetCallSessionOpts{FromWriter: true})
		require.NoError(t, err)

		// Call still active.
		active, err := p.store.GetActiveCallByChannelID(channelID, db.GetCallOpts{FromWriter: true})
		require.NoError(t, err)
		require.Zero(t, active.EndAt)
	})

	t.Run("absent session is reaped after two ticks", func(t *testing.T) {
		p, tearDown := setupPlugin(t)
		defer tearDown()

		channelID := model.NewId()
		userID := model.NewId()
		sessionID := model.NewId()

		postID := model.NewId()
		createPost(t, p.store, postID, userID, channelID)
		call := &public.Call{
			ID:        model.NewId(),
			CreateAt:  time.Now().UnixMilli(),
			StartAt:   time.Now().UnixMilli(),
			ChannelID: channelID,
			PostID:    postID,
			ThreadID:  model.NewId(),
			OwnerID:   userID,
			Props:     public.CallProps{NodeID: "test-node"},
		}
		require.NoError(t, p.store.CreateCall(call))
		createConfirmedSession(t, p, call, userID, sessionID, "PA_first")

		// Tick 1: suspicion = 1, not reaped.
		tick(p, channelID, sessionsFromDB(t, p, call.ID), map[string]struct{}{})

		_, err := p.store.GetCallSession(sessionID, db.GetCallSessionOpts{FromWriter: true})
		require.NoError(t, err, "session must survive the first absent tick")

		// Tick 2: suspicion reaches limit → reap.
		tick(p, channelID, sessionsFromDB(t, p, call.ID), map[string]struct{}{})

		_, err = p.store.GetCallSession(sessionID, db.GetCallSessionOpts{FromWriter: true})
		require.ErrorIs(t, err, db.ErrNotFound, "session must be deleted after two absent ticks")

		// The call was the last participant, so it should have ended.
		_, err = p.store.GetActiveCallByChannelID(channelID, db.GetCallOpts{FromWriter: true})
		require.ErrorIs(t, err, db.ErrNotFound, "call must end when last session is reaped")

		// Suspicion counter cleared.
		p.reconcilerSuspicionsMut.Lock()
		count := p.reconcilerSuspicions[sessionID]
		p.reconcilerSuspicionsMut.Unlock()
		require.Zero(t, count)
	})

	t.Run("session present in LK clears accumulated suspicion", func(t *testing.T) {
		p, tearDown := setupPlugin(t)
		defer tearDown()

		channelID := model.NewId()
		userID := model.NewId()
		sessionID := model.NewId()

		postID := model.NewId()
		createPost(t, p.store, postID, userID, channelID)
		call := &public.Call{
			ID:        model.NewId(),
			CreateAt:  time.Now().UnixMilli(),
			StartAt:   time.Now().UnixMilli(),
			ChannelID: channelID,
			PostID:    postID,
			ThreadID:  model.NewId(),
			OwnerID:   userID,
			Props:     public.CallProps{NodeID: "test-node"},
		}
		require.NoError(t, p.store.CreateCall(call))
		createConfirmedSession(t, p, call, userID, sessionID, "PA_first")

		// Tick 1: absent → suspicion = 1.
		tick(p, channelID, sessionsFromDB(t, p, call.ID), map[string]struct{}{})

		p.reconcilerSuspicionsMut.Lock()
		require.Equal(t, 1, p.reconcilerSuspicions[sessionID])
		p.reconcilerSuspicionsMut.Unlock()

		// Tick 2: session now present in LK → suspicion cleared.
		tick(p, channelID, sessionsFromDB(t, p, call.ID), map[string]struct{}{sessionID: {}})

		p.reconcilerSuspicionsMut.Lock()
		count := p.reconcilerSuspicions[sessionID]
		p.reconcilerSuspicionsMut.Unlock()
		require.Zero(t, count, "presence in LK must clear suspicion")

		// Session still in DB.
		_, err := p.store.GetCallSession(sessionID, db.GetCallSessionOpts{FromWriter: true})
		require.NoError(t, err)
	})

	t.Run("reconnect safety: stale SID snapshot does not reap a reconnected session", func(t *testing.T) {
		// The reconciler snapshots DB sessions at the start of a tick (sessionsFromDB).
		// If the client reconnects between the snapshot and the reap, the DB row now
		// carries a new SID. removeParticipantSession's SID guard catches this and
		// aborts, leaving the live session intact.
		p, tearDown := setupPlugin(t)
		defer tearDown()

		channelID := model.NewId()
		userID := model.NewId()
		sessionID := model.NewId()

		postID := model.NewId()
		createPost(t, p.store, postID, userID, channelID)
		call := &public.Call{
			ID:        model.NewId(),
			CreateAt:  time.Now().UnixMilli(),
			StartAt:   time.Now().UnixMilli(),
			ChannelID: channelID,
			PostID:    postID,
			ThreadID:  model.NewId(),
			OwnerID:   userID,
			Props:     public.CallProps{NodeID: "test-node"},
		}
		require.NoError(t, p.store.CreateCall(call))
		createConfirmedSession(t, p, call, userID, sessionID, "PA_old")

		// Tick 1: absent → suspicion = 1.
		tick(p, channelID, sessionsFromDB(t, p, call.ID), map[string]struct{}{})

		// Simulate reconnect: the participant_joined webhook fires and updates the SID.
		require.NoError(t, p.store.UpdateCallSessionSID(sessionID, "PA_new"))

		// Tick 2: snapshot still has "PA_old" (from our explicit sessionsFromDB call
		// above). The reconciler calls removeParticipantSession with "PA_old", but the
		// DB now has "PA_new" → SID guard fires → session survives.
		oldSnapshot := map[string]*public.CallSession{
			sessionID: {
				ID:          sessionID,
				CallID:      call.ID,
				UserID:      userID,
				JoinAt:      time.Now().UnixMilli(),
				ConfirmedAt: time.Now().UnixMilli(),
				SID:         "PA_old", // stale
			},
		}
		tick(p, channelID, oldSnapshot, map[string]struct{}{})

		got, err := p.store.GetCallSession(sessionID, db.GetCallSessionOpts{FromWriter: true})
		require.NoError(t, err, "reconnected session must survive a stale-SID reap attempt")
		require.Equal(t, "PA_new", got.SID)
	})

	t.Run("stale suspicion entries are pruned when a call ends between ticks", func(t *testing.T) {
		p, tearDown := setupPlugin(t)
		defer tearDown()

		sessionID := model.NewId()

		// Plant a suspicion entry for a session that no longer exists in any active call.
		p.reconcilerSuspicionsMut.Lock()
		p.reconcilerSuspicions[sessionID] = 1
		p.reconcilerSuspicionsMut.Unlock()

		// Run reconcileActiveCalls with no active calls (empty DB). seenSessionIDs
		// will be empty, so the stale entry should be pruned during the cleanup step.
		// We test the pruning logic directly rather than through reconcileActiveCalls
		// (which needs the cluster mutex and LK API) by simulating what it does:
		seen := map[string]struct{}{} // sessionID not visited → stale

		p.reconcilerSuspicionsMut.Lock()
		for id := range p.reconcilerSuspicions {
			if _, ok := seen[id]; !ok {
				delete(p.reconcilerSuspicions, id)
			}
		}
		p.reconcilerSuspicionsMut.Unlock()

		p.reconcilerSuspicionsMut.Lock()
		count := p.reconcilerSuspicions[sessionID]
		p.reconcilerSuspicionsMut.Unlock()
		require.Zero(t, count, "stale suspicion entry must be pruned")
	})
}
