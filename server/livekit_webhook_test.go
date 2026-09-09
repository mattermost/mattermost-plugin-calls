// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"net/http"
	"net/http/httptest"
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

	"github.com/livekit/protocol/livekit"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
)

func TestLiveKitParticipantWebhooks(t *testing.T) {
	const (
		hookAPIKey    = "testkey"
		hookAPISecret = "testsecret"
	)

	setupPlugin := func(t *testing.T) (*Plugin, *pluginMocks.MockAPI, *serverMocks.MockMetrics) {
		t.Helper()

		mockAPI := &pluginMocks.MockAPI{}
		mockMetrics := &serverMocks.MockMetrics{}

		store, tearDown := NewTestStore(t)
		t.Cleanup(tearDown)

		p := &Plugin{
			MattermostPlugin:  plugin.MattermostPlugin{API: mockAPI},
			metrics:           mockMetrics,
			apiLimiters:       map[string]*rate.Limiter{},
			callsClusterLocks: map[string]*cluster.Mutex{},
			store:             store,
			nodeID:            "test-node",
			dirtyCalls:        map[string]struct{}{},
			dirtyCallsCh:      make(chan struct{}, 1),
		}
		p.licenseChecker = enterprise.NewLicenseChecker(p.API)

		cfg := &configuration{}
		cfg.SetDefaults()
		cfg.LiveKitAPIKey = hookAPIKey
		cfg.LiveKitAPISecret = hookAPISecret
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
		// The call-end path rewrites the call post.
		mockAPI.On("UpdatePost", mock.AnythingOfType("*model.Post")).Return(&model.Post{}, nil).Maybe()
		// callEndReason inspects the channel for single-participant calls, to tell
		// a DM call cancelled before answer from one that simply ended.
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

		return p, mockAPI, mockMetrics
	}

	// createCall persists an active call with a post, as the POST token endpoint
	// would, and returns it.
	createCall := func(t *testing.T, p *Plugin, channelID string) *public.Call {
		t.Helper()
		postID := model.NewId()
		createPost(t, p.store, postID, model.NewId(), channelID)
		call := &public.Call{
			ID:        model.NewId(),
			CreateAt:  time.Now().UnixMilli(),
			StartAt:   time.Now().UnixMilli(),
			ChannelID: channelID,
			PostID:    postID,
			ThreadID:  model.NewId(),
			OwnerID:   model.NewId(),
			Props:     public.CallProps{NodeID: "test-node"},
		}
		require.NoError(t, p.store.CreateCall(call))
		return call
	}

	// createPendingSessionAt persists an unconfirmed session with an explicit join
	// time. Host selection breaks ties on map iteration order, so any test whose
	// premise is "A is the host" has to space the joins apart.
	createPendingSessionAt := func(t *testing.T, p *Plugin, call *public.Call, userID, sessionID string, joinAt int64) {
		t.Helper()
		require.NoError(t, p.store.CreateCallSession(&public.CallSession{
			ID:     sessionID,
			CallID: call.ID,
			UserID: userID,
			JoinAt: joinAt,
		}))
	}

	// createPendingSession persists an unconfirmed session, as the POST token
	// endpoint would.
	createPendingSession := func(t *testing.T, p *Plugin, call *public.Call, userID, sessionID string) {
		t.Helper()
		createPendingSessionAt(t, p, call, userID, sessionID, time.Now().UnixMilli())
	}

	send := func(t *testing.T, p *Plugin, event *livekit.WebhookEvent) {
		t.Helper()
		apiRouter := p.newAPIRouter()
		w := httptest.NewRecorder()
		apiRouter.ServeHTTP(w, newSignedWebhookRequest(t, hookAPIKey, hookAPISecret, event))
		require.Equal(t, http.StatusOK, w.Result().StatusCode)
	}

	participantEvent := func(name, channelID, identity, sid string) *livekit.WebhookEvent {
		return &livekit.WebhookEvent{
			Event: name,
			Room:  &livekit.Room{Name: channelID},
			Participant: &livekit.ParticipantInfo{
				Sid:      sid,
				Identity: identity,
				Kind:     livekit.ParticipantInfo_STANDARD,
			},
		}
	}

	t.Run("participant_joined confirms a pending session", func(t *testing.T) {
		p, _, _ := setupPlugin(t)
		defer ResetTestStore(t, p.store)

		channelID := model.NewId()
		userID := model.NewId()
		sessionID := model.NewId()
		call := createCall(t, p, channelID)
		createPendingSession(t, p, call, userID, sessionID)

		send(t, p, participantEvent("participant_joined", channelID,
			composeLivekitIdentity(userID, sessionID), "PA_first"))

		got, err := p.store.GetCallSession(sessionID, db.GetCallSessionOpts{FromWriter: true})
		require.NoError(t, err)
		require.Equal(t, "PA_first", got.SID)
		require.NotZero(t, got.ConfirmedAt)
	})

	t.Run("participant_left deletes the session and ends an emptied call", func(t *testing.T) {
		p, _, _ := setupPlugin(t)
		defer ResetTestStore(t, p.store)

		channelID := model.NewId()
		userID := model.NewId()
		sessionID := model.NewId()
		call := createCall(t, p, channelID)
		createPendingSession(t, p, call, userID, sessionID)

		identity := composeLivekitIdentity(userID, sessionID)
		send(t, p, participantEvent("participant_joined", channelID, identity, "PA_first"))
		send(t, p, participantEvent("participant_left", channelID, identity, "PA_first"))

		_, err := p.store.GetCallSession(sessionID, db.GetCallSessionOpts{FromWriter: true})
		require.ErrorIs(t, err, db.ErrNotFound)

		_, err = p.store.GetActiveCallByChannelID(channelID, db.GetCallOpts{FromWriter: true})
		require.ErrorIs(t, err, db.ErrNotFound)
	})

	// The SID guard. A full reconnect reuses the identity but gets a new SID, and
	// the resulting left(old)/joined(new) pair is unordered.
	t.Run("SID guard", func(t *testing.T) {
		t.Run("reordered: joined(new) then stale left(old) keeps the session", func(t *testing.T) {
			p, _, _ := setupPlugin(t)
			defer ResetTestStore(t, p.store)

			channelID := model.NewId()
			userID := model.NewId()
			sessionID := model.NewId()
			call := createCall(t, p, channelID)
			createPendingSession(t, p, call, userID, sessionID)
			identity := composeLivekitIdentity(userID, sessionID)

			send(t, p, participantEvent("participant_joined", channelID, identity, "PA_old"))
			// Reconnect lands before the old connection's leave.
			send(t, p, participantEvent("participant_joined", channelID, identity, "PA_new"))
			send(t, p, participantEvent("participant_left", channelID, identity, "PA_old"))

			got, err := p.store.GetCallSession(sessionID, db.GetCallSessionOpts{FromWriter: true})
			require.NoError(t, err, "stale leave must not delete the reconnected session")
			require.Equal(t, "PA_new", got.SID)

			call, err = p.store.GetActiveCallByChannelID(channelID, db.GetCallOpts{FromWriter: true})
			require.NoError(t, err, "call must still be active")
			require.Zero(t, call.EndAt)
		})

		t.Run("reconnect preserves ConfirmedAt", func(t *testing.T) {
			p, _, _ := setupPlugin(t)
			defer ResetTestStore(t, p.store)

			channelID := model.NewId()
			userID := model.NewId()
			sessionID := model.NewId()
			call := createCall(t, p, channelID)
			createPendingSession(t, p, call, userID, sessionID)
			identity := composeLivekitIdentity(userID, sessionID)

			send(t, p, participantEvent("participant_joined", channelID, identity, "PA_old"))
			first, err := p.store.GetCallSession(sessionID, db.GetCallSessionOpts{FromWriter: true})
			require.NoError(t, err)

			send(t, p, participantEvent("participant_joined", channelID, identity, "PA_new"))
			after, err := p.store.GetCallSession(sessionID, db.GetCallSessionOpts{FromWriter: true})
			require.NoError(t, err)

			// A reconnect is not a re-join: the session was already announced.
			require.Equal(t, first.ConfirmedAt, after.ConfirmedAt)
			require.Equal(t, "PA_new", after.SID)
		})

		t.Run("matching left deletes, non-matching does not", func(t *testing.T) {
			p, _, _ := setupPlugin(t)
			defer ResetTestStore(t, p.store)

			channelID := model.NewId()
			userID := model.NewId()
			sessionID := model.NewId()
			call := createCall(t, p, channelID)
			createPendingSession(t, p, call, userID, sessionID)
			identity := composeLivekitIdentity(userID, sessionID)

			send(t, p, participantEvent("participant_joined", channelID, identity, "PA_current"))
			send(t, p, participantEvent("participant_left", channelID, identity, "PA_bogus"))

			_, err := p.store.GetCallSession(sessionID, db.GetCallSessionOpts{FromWriter: true})
			require.NoError(t, err, "leave with a mismatched SID must be ignored")
		})
	})

	t.Run("duplicate participant_joined is idempotent", func(t *testing.T) {
		p, _, _ := setupPlugin(t)
		defer ResetTestStore(t, p.store)

		channelID := model.NewId()
		userID := model.NewId()
		sessionID := model.NewId()
		call := createCall(t, p, channelID)
		createPendingSession(t, p, call, userID, sessionID)
		identity := composeLivekitIdentity(userID, sessionID)

		send(t, p, participantEvent("participant_joined", channelID, identity, "PA_first"))
		first, err := p.store.GetCallSession(sessionID, db.GetCallSessionOpts{FromWriter: true})
		require.NoError(t, err)

		send(t, p, participantEvent("participant_joined", channelID, identity, "PA_first"))
		after, err := p.store.GetCallSession(sessionID, db.GetCallSessionOpts{FromWriter: true})
		require.NoError(t, err)
		require.Equal(t, first.ConfirmedAt, after.ConfirmedAt)
	})

	// Bots hold session rows like anyone else — skipping their confirmation would
	// leave the row pending forever, and the reconciliation sweep would then reap
	// it mid-job (MM-69510). They are excluded from being *participants*, not from
	// being tracked.
	t.Run("bot sessions", func(t *testing.T) {
		t.Run("confirmed, but not a participant or host", func(t *testing.T) {
			p, _, _ := setupPlugin(t)
			defer ResetTestStore(t, p.store)

			botID := model.NewId()
			p.botID = botID

			channelID := model.NewId()
			botSessionID := model.NewId()
			call := createCall(t, p, channelID)
			createPendingSession(t, p, call, botID, botSessionID)

			send(t, p, participantEvent("participant_joined", channelID,
				composeLivekitIdentity(botID, botSessionID), "PA_bot"))

			got, err := p.store.GetCallSession(botSessionID, db.GetCallSessionOpts{FromWriter: true})
			require.NoError(t, err)
			require.NotZero(t, got.ConfirmedAt, "bot row must be confirmed or the sweep will reap it")
			require.Equal(t, "PA_bot", got.SID)

			call, err = p.store.GetActiveCallByChannelID(channelID, db.GetCallOpts{FromWriter: true})
			require.NoError(t, err)
			require.NotContains(t, call.Props.Participants, botID, "bot must not appear in the call post attendees")
			require.NotEqual(t, botID, call.GetHostID(), "bot must not be host")
		})

		t.Run("call ends when the last human leaves a bot behind", func(t *testing.T) {
			p, _, _ := setupPlugin(t)
			defer ResetTestStore(t, p.store)

			botID := model.NewId()
			p.botID = botID

			channelID := model.NewId()
			userID, sessionID := model.NewId(), model.NewId()
			botSessionID := model.NewId()
			call := createCall(t, p, channelID)
			createPendingSession(t, p, call, userID, sessionID)
			createPendingSession(t, p, call, botID, botSessionID)

			send(t, p, participantEvent("participant_joined", channelID,
				composeLivekitIdentity(userID, sessionID), "PA_human"))
			send(t, p, participantEvent("participant_joined", channelID,
				composeLivekitIdentity(botID, botSessionID), "PA_bot"))

			// The bot still holds a session, so ending on len(sessions) == 0 would
			// leave this call open indefinitely.
			send(t, p, participantEvent("participant_left", channelID,
				composeLivekitIdentity(userID, sessionID), "PA_human"))

			_, err := p.store.GetActiveCallByChannelID(channelID, db.GetCallOpts{FromWriter: true})
			require.ErrorIs(t, err, db.ErrNotFound, "call must end when the last human leaves")
		})
	})

	t.Run("unparseable identity is ignored", func(t *testing.T) {
		p, _, _ := setupPlugin(t)
		defer ResetTestStore(t, p.store)

		channelID := model.NewId()
		call := createCall(t, p, channelID)

		send(t, p, participantEvent("participant_joined", channelID, "+14155551234", "PA_x"))

		sessions, err := p.store.GetCallSessions(call.ID, db.GetCallSessionOpts{FromWriter: true})
		require.NoError(t, err)
		require.Empty(t, sessions)
	})

	// Room metadata carries host and job state to clients that have no
	// Mattermost WebSocket. It is only published on change, so the events that
	// change it have to say so.
	t.Run("room metadata", func(t *testing.T) {
		t.Run("the first participant_joined seeds it, later ones do not", func(t *testing.T) {
			// The token endpoint settles the host before anyone connects, so
			// without this seed a call whose host never changed again would have
			// no metadata at all. room_started cannot do it: a room with no
			// confirmed session has nothing to publish to.
			p, _, _ := setupPlugin(t)
			defer ResetTestStore(t, p.store)

			channelID := model.NewId()
			userID, sessionID := model.NewId(), model.NewId()
			call := createCall(t, p, channelID)
			call.Props.Hosts = []string{userID}
			require.NoError(t, p.store.UpdateCall(call))
			createPendingSession(t, p, call, userID, sessionID)

			send(t, p, participantEvent("participant_joined", channelID,
				composeLivekitIdentity(userID, sessionID), "PA_first"))

			require.Equal(t, map[string]struct{}{channelID: {}}, dirtySet(p))

			// And the seed is publishable: the same webhook confirmed the
			// session, so the room exists by the time the publisher looks.
			require.ErrorIs(t, p.publishCallRoomMetadata(channelID), errLiveKitNotConfigured)

			p.dirtyCallsMut.Lock()
			p.dirtyCalls = map[string]struct{}{}
			p.dirtyCallsMut.Unlock()

			// A second joiner adds nothing: the room already has the metadata and
			// they receive it on connect. Re-publishing per join would fan an
			// identical payload out to everyone already in the room.
			userB, sessionB := model.NewId(), model.NewId()
			createPendingSession(t, p, call, userB, sessionB)
			send(t, p, participantEvent("participant_joined", channelID,
				composeLivekitIdentity(userB, sessionB), "PA_second"))

			require.Empty(t, dirtySet(p))
		})

		t.Run("a host change on join marks it stale", func(t *testing.T) {
			p, _, _ := setupPlugin(t)
			defer ResetTestStore(t, p.store)

			channelID := model.NewId()
			userID, sessionID := model.NewId(), model.NewId()
			call := createCall(t, p, channelID)
			createPendingSession(t, p, call, userID, sessionID)

			send(t, p, participantEvent("participant_joined", channelID,
				composeLivekitIdentity(userID, sessionID), "PA_first"))

			require.Equal(t, map[string]struct{}{channelID: {}}, dirtySet(p))
		})

		t.Run("a host change on leave marks it stale", func(t *testing.T) {
			p, _, _ := setupPlugin(t)
			defer ResetTestStore(t, p.store)

			channelID := model.NewId()
			userA, sessionA := model.NewId(), model.NewId()
			userB, sessionB := model.NewId(), model.NewId()
			call := createCall(t, p, channelID)
			now := time.Now().UnixMilli()
			createPendingSessionAt(t, p, call, userA, sessionA, now)
			createPendingSessionAt(t, p, call, userB, sessionB, now+1000)

			send(t, p, participantEvent("participant_joined", channelID,
				composeLivekitIdentity(userA, sessionA), "PA_a"))
			send(t, p, participantEvent("participant_joined", channelID,
				composeLivekitIdentity(userB, sessionB), "PA_b"))

			// The premise of the test: A joined first, so A is the host.
			state, err := p.getCallState(channelID, true)
			require.NoError(t, err)
			require.Equal(t, userA, state.Call.GetHostID())

			p.dirtyCallsMut.Lock()
			p.dirtyCalls = map[string]struct{}{}
			p.dirtyCallsMut.Unlock()

			// The host leaving hands the role to the remaining participant.
			send(t, p, participantEvent("participant_left", channelID,
				composeLivekitIdentity(userA, sessionA), "PA_a"))

			require.Equal(t, map[string]struct{}{channelID: {}}, dirtySet(p))
		})
	})

	t.Run("room_finished ends the call with a bot session still present", func(t *testing.T) {
		p, _, _ := setupPlugin(t)
		defer ResetTestStore(t, p.store)

		botID := model.NewId()
		p.botID = botID

		channelID := model.NewId()
		userID, sessionID := model.NewId(), model.NewId()
		botSessionID := model.NewId()
		call := createCall(t, p, channelID)
		createPendingSession(t, p, call, userID, sessionID)
		createPendingSession(t, p, call, botID, botSessionID)
		send(t, p, participantEvent("participant_joined", channelID,
			composeLivekitIdentity(userID, sessionID), "PA_human"))
		send(t, p, participantEvent("participant_joined", channelID,
			composeLivekitIdentity(botID, botSessionID), "PA_bot"))

		// room_finished is the backstop for participant_left events that never
		// arrived, so it must not depend on the room already being empty.
		send(t, p, &livekit.WebhookEvent{
			Event: "room_finished",
			Room:  &livekit.Room{Name: channelID},
		})

		sessions, err := p.store.GetCallSessions(call.ID, db.GetCallSessionOpts{FromWriter: true})
		require.NoError(t, err)
		require.Empty(t, sessions)

		_, err = p.store.GetActiveCallByChannelID(channelID, db.GetCallOpts{FromWriter: true})
		require.ErrorIs(t, err, db.ErrNotFound)
	})

	t.Run("room_finished ends the call and clears sessions", func(t *testing.T) {
		p, _, _ := setupPlugin(t)
		defer ResetTestStore(t, p.store)

		channelID := model.NewId()
		userID := model.NewId()
		sessionID := model.NewId()
		call := createCall(t, p, channelID)
		createPendingSession(t, p, call, userID, sessionID)
		send(t, p, participantEvent("participant_joined", channelID,
			composeLivekitIdentity(userID, sessionID), "PA_first"))

		send(t, p, &livekit.WebhookEvent{
			Event: "room_finished",
			Room:  &livekit.Room{Name: channelID},
		})

		sessions, err := p.store.GetCallSessions(call.ID, db.GetCallSessionOpts{FromWriter: true})
		require.NoError(t, err)
		require.Empty(t, sessions)

		_, err = p.store.GetActiveCallByChannelID(channelID, db.GetCallOpts{FromWriter: true})
		require.ErrorIs(t, err, db.ErrNotFound)
	})
}

func TestLiveKitTrackWebhooks(t *testing.T) {
	const (
		hookAPIKey    = "testkey"
		hookAPISecret = "testsecret"
	)

	setupPlugin := func(t *testing.T) *Plugin {
		t.Helper()

		mockAPI := &pluginMocks.MockAPI{}
		mockMetrics := &serverMocks.MockMetrics{}

		store, tearDown := NewTestStore(t)
		t.Cleanup(tearDown)

		p := &Plugin{
			MattermostPlugin:  plugin.MattermostPlugin{API: mockAPI},
			metrics:           mockMetrics,
			apiLimiters:       map[string]*rate.Limiter{},
			callsClusterLocks: map[string]*cluster.Mutex{},
			store:             store,
			nodeID:            "test-node",
		}
		p.licenseChecker = enterprise.NewLicenseChecker(p.API)

		cfg := &configuration{}
		cfg.SetDefaults()
		cfg.LiveKitAPIKey = hookAPIKey
		cfg.LiveKitAPISecret = hookAPISecret
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
		// callEndReason inspects the channel for single-participant calls, to tell
		// a DM call cancelled before answer from one that simply ended.
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

		return p
	}

	// callWithSession sets up an active call with one confirmed session, as the
	// POST endpoint plus participant_joined would leave it.
	callWithSession := func(t *testing.T, p *Plugin, channelID, userID, sessionID string) *public.Call {
		t.Helper()
		postID := model.NewId()
		createPost(t, p.store, postID, userID, channelID)
		call := &public.Call{
			ID:        model.NewId(),
			CreateAt:  time.Now().UnixMilli(),
			StartAt:   time.Now().UnixMilli(),
			ChannelID: channelID,
			PostID:    postID,
			OwnerID:   userID,
			Props:     public.CallProps{NodeID: "test-node"},
		}
		require.NoError(t, p.store.CreateCall(call))
		require.NoError(t, p.store.CreateCallSession(&public.CallSession{
			ID:          sessionID,
			CallID:      call.ID,
			UserID:      userID,
			JoinAt:      time.Now().UnixMilli(),
			ConfirmedAt: time.Now().UnixMilli(),
			SID:         "PA_" + sessionID,
		}))
		return call
	}

	send := func(t *testing.T, p *Plugin, event *livekit.WebhookEvent) {
		t.Helper()
		apiRouter := p.newAPIRouter()
		w := httptest.NewRecorder()
		apiRouter.ServeHTTP(w, newSignedWebhookRequest(t, hookAPIKey, hookAPISecret, event))
		require.Equal(t, http.StatusOK, w.Result().StatusCode)
	}

	trackEventSID := func(name, channelID, identity, sid string, source livekit.TrackSource) *livekit.WebhookEvent {
		return &livekit.WebhookEvent{
			Event: name,
			Room:  &livekit.Room{Name: channelID},
			Participant: &livekit.ParticipantInfo{
				Sid:      sid,
				Identity: identity,
				Kind:     livekit.ParticipantInfo_STANDARD,
			},
			Track: &livekit.TrackInfo{
				Sid:    model.NewId(),
				Source: source,
			},
		}
	}

	trackEvent := func(name, channelID, identity string, source livekit.TrackSource) *livekit.WebhookEvent {
		return trackEventSID(name, channelID, identity, "PA_x", source)
	}

	t.Run("screen share sets and clears the sharing session", func(t *testing.T) {
		p := setupPlugin(t)
		defer ResetTestStore(t, p.store)

		channelID, userID, sessionID := model.NewId(), model.NewId(), model.NewId()
		callWithSession(t, p, channelID, userID, sessionID)
		identity := composeLivekitIdentity(userID, sessionID)

		// The publishing connection's SID matches the session row, as it would
		// after participant_joined recorded it.
		sid := "PA_" + sessionID
		send(t, p, trackEventSID("track_published", channelID, identity, sid, livekit.TrackSource_SCREEN_SHARE))

		call, err := p.store.GetActiveCallByChannelID(channelID, db.GetCallOpts{FromWriter: true})
		require.NoError(t, err)
		require.Equal(t, sessionID, call.Props.ScreenSharingSessionID)
		require.NotZero(t, call.Props.ScreenStartAt)

		send(t, p, trackEventSID("track_unpublished", channelID, identity, sid, livekit.TrackSource_SCREEN_SHARE))

		call, err = p.store.GetActiveCallByChannelID(channelID, db.GetCallOpts{FromWriter: true})
		require.NoError(t, err)
		require.Empty(t, call.Props.ScreenSharingSessionID)
		require.Zero(t, call.Props.ScreenStartAt)
	})

	t.Run("camera and microphone tracks are ignored", func(t *testing.T) {
		p := setupPlugin(t)
		defer ResetTestStore(t, p.store)

		channelID, userID, sessionID := model.NewId(), model.NewId(), model.NewId()
		callWithSession(t, p, channelID, userID, sessionID)
		identity := composeLivekitIdentity(userID, sessionID)

		send(t, p, trackEvent("track_published", channelID, identity, livekit.TrackSource_CAMERA))
		send(t, p, trackEvent("track_published", channelID, identity, livekit.TrackSource_MICROPHONE))

		call, err := p.store.GetActiveCallByChannelID(channelID, db.GetCallOpts{FromWriter: true})
		require.NoError(t, err)
		require.Empty(t, call.Props.ScreenSharingSessionID)
	})

	t.Run("stale unpublish does not clear the current sharer", func(t *testing.T) {
		p := setupPlugin(t)
		defer ResetTestStore(t, p.store)

		channelID, userID, sessionID := model.NewId(), model.NewId(), model.NewId()
		callWithSession(t, p, channelID, userID, sessionID)
		identity := composeLivekitIdentity(userID, sessionID)

		send(t, p, trackEvent("track_published", channelID, identity, livekit.TrackSource_SCREEN_SHARE))

		// Track events are unordered, so an unpublish from a session that is no
		// longer the sharer must not clear the prop.
		otherIdentity := composeLivekitIdentity(model.NewId(), model.NewId())
		send(t, p, trackEvent("track_unpublished", channelID, otherIdentity, livekit.TrackSource_SCREEN_SHARE))

		call, err := p.store.GetActiveCallByChannelID(channelID, db.GetCallOpts{FromWriter: true})
		require.NoError(t, err)
		require.Equal(t, sessionID, call.Props.ScreenSharingSessionID)
	})

	t.Run("leaving while sharing clears the sharing session", func(t *testing.T) {
		p := setupPlugin(t)
		defer ResetTestStore(t, p.store)

		channelID, userID, sessionID := model.NewId(), model.NewId(), model.NewId()
		callWithSession(t, p, channelID, userID, sessionID)
		// A second session so the call survives the first one leaving.
		otherUserID, otherSessionID := model.NewId(), model.NewId()
		call, err := p.store.GetActiveCallByChannelID(channelID, db.GetCallOpts{FromWriter: true})
		require.NoError(t, err)
		require.NoError(t, p.store.CreateCallSession(&public.CallSession{
			ID:          otherSessionID,
			CallID:      call.ID,
			UserID:      otherUserID,
			JoinAt:      time.Now().UnixMilli(),
			ConfirmedAt: time.Now().UnixMilli(),
			SID:         "PA_" + otherSessionID,
		}))

		identity := composeLivekitIdentity(userID, sessionID)
		send(t, p, trackEvent("track_published", channelID, identity, livekit.TrackSource_SCREEN_SHARE))

		send(t, p, &livekit.WebhookEvent{
			Event: "participant_left",
			Room:  &livekit.Room{Name: channelID},
			Participant: &livekit.ParticipantInfo{
				Sid:      "PA_" + sessionID,
				Identity: identity,
				Kind:     livekit.ParticipantInfo_STANDARD,
			},
		})

		call, err = p.store.GetActiveCallByChannelID(channelID, db.GetCallOpts{FromWriter: true})
		require.NoError(t, err)
		require.Empty(t, call.Props.ScreenSharingSessionID, "sharer left, prop must be cleared")
	})

	t.Run("stale unpublish from a reconnected sharer does not clear the share", func(t *testing.T) {
		p := setupPlugin(t)
		defer ResetTestStore(t, p.store)

		channelID, userID, sessionID := model.NewId(), model.NewId(), model.NewId()
		callWithSession(t, p, channelID, userID, sessionID)
		identity := composeLivekitIdentity(userID, sessionID)

		// callWithSession seeds the row's SID as "PA_"+sessionID.
		oldSID := "PA_" + sessionID
		send(t, p, trackEventSID("track_published", channelID, identity, oldSID, livekit.TrackSource_SCREEN_SHARE))

		// Full reconnect: same session id, new participant SID. The row rebinds.
		send(t, p, &livekit.WebhookEvent{
			Event: "participant_joined",
			Room:  &livekit.Room{Name: channelID},
			Participant: &livekit.ParticipantInfo{
				Sid:      "PA_reconnected",
				Identity: identity,
				Kind:     livekit.ParticipantInfo_STANDARD,
			},
		})

		// The old connection's trailing unpublish must not clear a live share: the
		// session id matches, but the connection it came from is superseded.
		send(t, p, trackEventSID("track_unpublished", channelID, identity, oldSID, livekit.TrackSource_SCREEN_SHARE))

		call, err := p.store.GetActiveCallByChannelID(channelID, db.GetCallOpts{FromWriter: true})
		require.NoError(t, err)
		require.Equal(t, sessionID, call.Props.ScreenSharingSessionID,
			"stale unpublish from the old connection must not clear the reconnected sharer")
	})
}
