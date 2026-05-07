// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/base64"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"golang.org/x/time/rate"
	"google.golang.org/protobuf/encoding/protojson"

	"github.com/mattermost/mattermost-plugin-calls/server/db"
	"github.com/mattermost/mattermost-plugin-calls/server/enterprise"
	"github.com/mattermost/mattermost-plugin-calls/server/public"

	serverMocks "github.com/mattermost/mattermost-plugin-calls/server/mocks/github.com/mattermost/mattermost-plugin-calls/server/interfaces"
	pluginMocks "github.com/mattermost/mattermost-plugin-calls/server/mocks/github.com/mattermost/mattermost/server/public/plugin"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/plugin"

	"github.com/mattermost/mattermost-plugin-calls/server/cluster"

	"github.com/livekit/protocol/auth"
	"github.com/livekit/protocol/livekit"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
)

// newSignedWebhookRequest creates a valid LiveKit-signed webhook POST request.
func newSignedWebhookRequest(t *testing.T, apiKey, apiSecret string, event *livekit.WebhookEvent) *http.Request {
	t.Helper()

	body, err := protojson.Marshal(event)
	require.NoError(t, err)

	sha := sha256.Sum256(body)
	hash := base64.StdEncoding.EncodeToString(sha[:])

	token, err := auth.NewAccessToken(apiKey, apiSecret).
		SetSha256(hash).
		ToJWT()
	require.NoError(t, err)

	r := httptest.NewRequest(http.MethodPost, "/livekit-webhook", bytes.NewReader(body))
	r.Header.Set("Authorization", token)
	r.Header.Set("Content-Type", "application/json")
	return r
}

func TestHandleLiveKitWebhook(t *testing.T) {
	const (
		testAPIKey    = "testkey"
		testAPISecret = "testsecret"
	)

	newPlugin := func(t *testing.T) (*Plugin, *pluginMocks.MockAPI) {
		t.Helper()
		mockAPI := &pluginMocks.MockAPI{}
		mockMetrics := &serverMocks.MockMetrics{}
		p := &Plugin{
			MattermostPlugin:  plugin.MattermostPlugin{API: mockAPI},
			metrics:           mockMetrics,
			apiLimiters:       map[string]*rate.Limiter{},
			callsClusterLocks: map[string]*cluster.Mutex{},
		}
		p.licenseChecker = enterprise.NewLicenseChecker(p.API)
		mockMetrics.On("Handler").Return(nil).Once()
		mockMetrics.On("ObserveAppHandlersTime", mock.AnythingOfType("string"), mock.AnythingOfType("float64"))
		mockAPI.On("GetConfig").Return(&model.Config{}, nil)
		mockAPI.On("GetLicense").Return(&model.License{SkuShortName: "enterprise"}, nil)
		mockAPI.On("LogDebug", mock.AnythingOfType("string"), mock.Anything, mock.Anything,
			mock.Anything, mock.Anything, mock.Anything, mock.Anything).Maybe()
		mockAPI.On("LogError", mock.AnythingOfType("string"), mock.Anything, mock.Anything,
			mock.Anything, mock.Anything, mock.Anything, mock.Anything).Maybe()
		return p, mockAPI
	}

	t.Run("livekit not configured", func(t *testing.T) {
		p, _ := newPlugin(t)
		apiRouter := p.newAPIRouter()

		event := &livekit.WebhookEvent{Event: "participant_joined"}
		r := newSignedWebhookRequest(t, testAPIKey, testAPISecret, event)

		w := httptest.NewRecorder()
		apiRouter.ServeHTTP(w, r)

		require.Equal(t, http.StatusServiceUnavailable, w.Result().StatusCode)
	})

	t.Run("invalid signature rejected", func(t *testing.T) {
		p, _ := newPlugin(t)
		cfg := &configuration{}
		cfg.SetDefaults()
		cfg.LiveKitAPIKey = testAPIKey
		cfg.LiveKitAPISecret = testAPISecret
		p.configuration = cfg

		apiRouter := p.newAPIRouter()

		event := &livekit.WebhookEvent{Event: "participant_joined"}
		r := newSignedWebhookRequest(t, testAPIKey, "wrongsecret", event)

		w := httptest.NewRecorder()
		apiRouter.ServeHTTP(w, r)

		require.Equal(t, http.StatusForbidden, w.Result().StatusCode)
	})

	t.Run("no Mattermost-User-Id required", func(t *testing.T) {
		p, mockAPI := newPlugin(t)
		cfg := &configuration{}
		cfg.SetDefaults()
		cfg.LiveKitAPIKey = testAPIKey
		cfg.LiveKitAPISecret = testAPISecret
		p.configuration = cfg

		mockAPI.On("LogDebug", mock.AnythingOfType("string"),
			mock.Anything, mock.Anything, mock.Anything, mock.Anything,
			mock.Anything, mock.Anything).Maybe()

		apiRouter := p.newAPIRouter()

		event := &livekit.WebhookEvent{
			Event: "room_started",
			Room:  &livekit.Room{Name: model.NewId()},
		}
		r := newSignedWebhookRequest(t, testAPIKey, testAPISecret, event)
		// Deliberately no Mattermost-User-Id header.

		w := httptest.NewRecorder()
		apiRouter.ServeHTTP(w, r)

		require.Equal(t, http.StatusOK, w.Result().StatusCode)
	})

	t.Run("non-SIP participant_joined ignored", func(t *testing.T) {
		p, mockAPI := newPlugin(t)
		cfg := &configuration{}
		cfg.SetDefaults()
		cfg.LiveKitAPIKey = testAPIKey
		cfg.LiveKitAPISecret = testAPISecret
		p.configuration = cfg

		mockAPI.On("LogDebug", mock.AnythingOfType("string"),
			mock.Anything, mock.Anything, mock.Anything, mock.Anything,
			mock.Anything, mock.Anything).Maybe()

		apiRouter := p.newAPIRouter()

		event := &livekit.WebhookEvent{
			Event: "participant_joined",
			Room:  &livekit.Room{Name: model.NewId()},
			Participant: &livekit.ParticipantInfo{
				Sid:      model.NewId(),
				Identity: "user123",
				Kind:     livekit.ParticipantInfo_STANDARD,
			},
		}
		r := newSignedWebhookRequest(t, testAPIKey, testAPISecret, event)

		w := httptest.NewRecorder()
		apiRouter.ServeHTTP(w, r)

		// 200 and no store interaction (p.store is nil; would panic if called).
		require.Equal(t, http.StatusOK, w.Result().StatusCode)
	})
}

func TestHandleLiveKitSIPParticipant(t *testing.T) {
	const (
		testAPIKey    = "testkey"
		testAPISecret = "testsecret"
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
		}
		p.licenseChecker = enterprise.NewLicenseChecker(p.API)

		cfg := &configuration{}
		cfg.SetDefaults()
		cfg.LiveKitAPIKey = testAPIKey
		cfg.LiveKitAPISecret = testAPISecret
		p.configuration = cfg

		mockMetrics.On("Handler").Return(nil).Once()
		mockMetrics.On("ObserveAppHandlersTime", mock.AnythingOfType("string"), mock.AnythingOfType("float64")).Maybe()
		mockMetrics.On("IncWebSocketEvent", mock.AnythingOfType("string"), mock.AnythingOfType("string")).Maybe()
		mockAPI.On("GetConfig").Return(&model.Config{}, nil)
		mockAPI.On("GetLicense").Return(&model.License{SkuShortName: "enterprise"}, nil)
		mockAPI.On("LogDebug", mock.AnythingOfType("string"),
			mock.Anything, mock.Anything, mock.Anything, mock.Anything,
			mock.Anything, mock.Anything, mock.Anything, mock.Anything,
			mock.Anything, mock.Anything, mock.Anything, mock.Anything).Maybe()
		mockAPI.On("LogError", mock.AnythingOfType("string"),
			mock.Anything, mock.Anything, mock.Anything, mock.Anything,
			mock.Anything, mock.Anything, mock.Anything, mock.Anything).Maybe()
		mockAPI.On("PublishWebSocketEvent",
			mock.AnythingOfType("string"),
			mock.Anything,
			mock.AnythingOfType("*model.WebsocketBroadcast")).Maybe()
		// KV mocks needed for cluster mutex locking in lockCallReturnState.
		mockAPI.On("KVSetWithOptions", mock.Anything, mock.Anything, mock.Anything).Return(true, nil).Maybe()
		mockAPI.On("KVDelete", mock.Anything).Return(nil).Maybe()
		mockMetrics.On("ObserveClusterMutexGrabTime", mock.Anything, mock.AnythingOfType("float64")).Maybe()
		mockMetrics.On("ObserveClusterMutexLockedTime", mock.Anything, mock.AnythingOfType("float64")).Maybe()

		return p, mockAPI, mockMetrics
	}

	createActiveCall := func(t *testing.T, p *Plugin, channelID, postID string) *public.Call {
		t.Helper()
		userID := model.NewId()
		callID := model.NewId()
		createPost(t, p.store, postID, userID, channelID)
		call := &public.Call{
			ID:        callID,
			CreateAt:  time.Now().UnixMilli(),
			StartAt:   time.Now().UnixMilli(),
			ChannelID: channelID,
			PostID:    postID,
			ThreadID:  model.NewId(),
			OwnerID:   userID,
			Props:     public.CallProps{NodeID: "test-node"},
		}
		require.NoError(t, p.store.CreateCall(call))
		return call
	}

	setupLock := func(mockAPI *pluginMocks.MockAPI, mockMetrics *serverMocks.MockMetrics, channelID string) {
		mockAPI.On("LogDebug", "creating cluster mutex for call",
			"origin", mock.AnythingOfType("string"), "channelID", channelID).Once()
		mockAPI.On("KVSetWithOptions", mock.Anything, mock.Anything, mock.Anything).Return(true, nil)
		mockAPI.On("KVDelete", "mutex_call_"+channelID).Return(nil)
		mockMetrics.On("ObserveClusterMutexGrabTime", "mutex_call", mock.AnythingOfType("float64")).Maybe()
		mockMetrics.On("ObserveClusterMutexLockedTime", "mutex_call", mock.AnythingOfType("float64")).Maybe()
	}

	t.Run("SIP participant_joined creates session and publishes user_joined", func(t *testing.T) {
		p, mockAPI, mockMetrics := setupPlugin(t)
		defer ResetTestStore(t, p.store)

		channelID := model.NewId()
		postID := model.NewId()
		call := createActiveCall(t, p, channelID, postID)
		setupLock(mockAPI, mockMetrics, channelID)

		sipSid := model.NewId()
		sipIdentity := "+14155551234"

		event := &livekit.WebhookEvent{
			Event: "participant_joined",
			Room:  &livekit.Room{Name: channelID},
			Participant: &livekit.ParticipantInfo{
				Sid:      sipSid,
				Identity: sipIdentity,
				Kind:     livekit.ParticipantInfo_SIP,
			},
		}

		apiRouter := p.newAPIRouter()
		r := newSignedWebhookRequest(t, testAPIKey, testAPISecret, event)
		w := httptest.NewRecorder()
		apiRouter.ServeHTTP(w, r)

		require.Equal(t, http.StatusOK, w.Result().StatusCode)

		sessions, err := p.store.GetCallSessions(call.ID, db.GetCallSessionOpts{})
		require.NoError(t, err)
		require.Len(t, sessions, 1)

		var sess *public.CallSession
		for _, s := range sessions {
			sess = s
		}
		require.Equal(t, sipSid, sess.ID)
		require.Equal(t, sipIdentity, sess.UserID)
		require.True(t, sess.IsSIPParticipant)

		// Verify user_joined WS event was published.
		mockAPI.AssertCalled(t, "PublishWebSocketEvent",
			wsEventUserJoined, mock.Anything, mock.Anything)
	})

	t.Run("SIP participant_joined no active call is a no-op", func(t *testing.T) {
		p, _, _ := setupPlugin(t)

		event := &livekit.WebhookEvent{
			Event: "participant_joined",
			Room:  &livekit.Room{Name: model.NewId()},
			Participant: &livekit.ParticipantInfo{
				Sid:      model.NewId(),
				Identity: "+14155550000",
				Kind:     livekit.ParticipantInfo_SIP,
			},
		}

		apiRouter := p.newAPIRouter()
		r := newSignedWebhookRequest(t, testAPIKey, testAPISecret, event)
		w := httptest.NewRecorder()
		apiRouter.ServeHTTP(w, r)

		require.Equal(t, http.StatusOK, w.Result().StatusCode)
	})

	t.Run("SIP participant_left removes session and publishes user_left", func(t *testing.T) {
		p, mockAPI, mockMetrics := setupPlugin(t)
		defer ResetTestStore(t, p.store)

		channelID := model.NewId()
		postID := model.NewId()
		call := createActiveCall(t, p, channelID, postID)

		sipSid := model.NewId()
		sipIdentity := "+14155551234"
		require.NoError(t, p.store.CreateCallSession(&public.CallSession{
			ID:               sipSid,
			CallID:           call.ID,
			UserID:           sipIdentity,
			JoinAt:           time.Now().UnixMilli(),
			IsSIPParticipant: true,
		}))

		setupLock(mockAPI, mockMetrics, channelID)

		event := &livekit.WebhookEvent{
			Event: "participant_left",
			Room:  &livekit.Room{Name: channelID},
			Participant: &livekit.ParticipantInfo{
				Sid:      sipSid,
				Identity: sipIdentity,
				Kind:     livekit.ParticipantInfo_SIP,
			},
		}

		apiRouter := p.newAPIRouter()
		r := newSignedWebhookRequest(t, testAPIKey, testAPISecret, event)
		w := httptest.NewRecorder()
		apiRouter.ServeHTTP(w, r)

		require.Equal(t, http.StatusOK, w.Result().StatusCode)

		sessions, err := p.store.GetCallSessions(call.ID, db.GetCallSessionOpts{})
		require.NoError(t, err)
		require.Empty(t, sessions)

		mockAPI.AssertCalled(t, "PublishWebSocketEvent",
			wsEventUserLeft, mock.Anything, mock.Anything)
	})

	t.Run("SIP participant_left idempotent when session not found", func(t *testing.T) {
		p, mockAPI, mockMetrics := setupPlugin(t)
		defer ResetTestStore(t, p.store)

		channelID := model.NewId()
		postID := model.NewId()
		createActiveCall(t, p, channelID, postID)
		setupLock(mockAPI, mockMetrics, channelID)

		event := &livekit.WebhookEvent{
			Event: "participant_left",
			Room:  &livekit.Room{Name: channelID},
			Participant: &livekit.ParticipantInfo{
				Sid:      model.NewId(),
				Identity: "+10000000000",
				Kind:     livekit.ParticipantInfo_SIP,
			},
		}

		apiRouter := p.newAPIRouter()
		r := newSignedWebhookRequest(t, testAPIKey, testAPISecret, event)
		w := httptest.NewRecorder()
		apiRouter.ServeHTTP(w, r)

		require.Equal(t, http.StatusOK, w.Result().StatusCode)
	})
}

func TestGetHostIDSIPDeprioritization(t *testing.T) {
	now := time.Now().UnixMilli()

	makeSession := func(userID string, joinAt int64, isSIP bool) *public.CallSession {
		return &public.CallSession{
			ID:               model.NewId(),
			UserID:           userID,
			JoinAt:           joinAt,
			IsSIPParticipant: isSIP,
		}
	}

	t.Run("regular user beats SIP for host", func(t *testing.T) {
		sipUser := "+14155551234"
		regularUser := model.NewId()

		cs := &callState{
			Call: public.Call{
				Props: public.CallProps{Hosts: []string{sipUser}},
			},
			sessions: map[string]*public.CallSession{
				"sip1":  makeSession(sipUser, now-2000, true),
				"user1": makeSession(regularUser, now-1000, false),
			},
		}
		require.Equal(t, regularUser, cs.getHostID("botID"))
	})

	t.Run("SIP is host when only SIP participants present", func(t *testing.T) {
		sip1 := "+14155551234"
		sip2 := "+14155550001"

		cs := &callState{
			Call: public.Call{},
			sessions: map[string]*public.CallSession{
				"sip1": makeSession(sip1, now-2000, true),
				"sip2": makeSession(sip2, now-1000, true),
			},
		}
		// Earliest SIP joiner should be host.
		require.Equal(t, sip1, cs.getHostID("botID"))
	})

	t.Run("HostLockedUserID takes priority over everything", func(t *testing.T) {
		lockedUser := model.NewId()
		regularUser := model.NewId()

		cs := &callState{
			Call: public.Call{
				Props: public.CallProps{
					HostLockedUserID: lockedUser,
					Hosts:            []string{lockedUser},
				},
			},
			sessions: map[string]*public.CallSession{
				"user1":   makeSession(regularUser, now-5000, false),
				"locked1": makeSession(lockedUser, now-1000, false),
			},
		}
		require.Equal(t, lockedUser, cs.getHostID("botID"))
	})

	t.Run("SIP host yields when regular user joins", func(t *testing.T) {
		sipUser := "+14155551234"
		regularUser := model.NewId()

		cs := &callState{
			Call: public.Call{
				Props: public.CallProps{Hosts: []string{sipUser}},
			},
			sessions: map[string]*public.CallSession{
				"sip1":  makeSession(sipUser, now-5000, true),
				"user1": makeSession(regularUser, now-1000, false),
			},
		}
		require.Equal(t, regularUser, cs.getHostID("botID"))
	})

	t.Run("earliest non-SIP wins among multiple regular users", func(t *testing.T) {
		user1 := model.NewId()
		user2 := model.NewId()
		sipUser := "+1415"

		cs := &callState{
			Call: public.Call{},
			sessions: map[string]*public.CallSession{
				"u1":  makeSession(user1, now-3000, false),
				"u2":  makeSession(user2, now-1000, false),
				"sip": makeSession(sipUser, now-5000, true),
			},
		}
		require.Equal(t, user1, cs.getHostID("botID"))
	})

	t.Run("bot is never host", func(t *testing.T) {
		botID := model.NewId()
		sipUser := "+1415"

		cs := &callState{
			Call: public.Call{},
			sessions: map[string]*public.CallSession{
				"bot": makeSession(botID, now-5000, false),
				"sip": makeSession(sipUser, now-1000, true),
			},
		}
		require.Equal(t, sipUser, cs.getHostID(botID))
	})
}
