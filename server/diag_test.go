// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"golang.org/x/time/rate"

	"github.com/mattermost/mattermost-plugin-calls/server/cluster"
	"github.com/mattermost/mattermost-plugin-calls/server/enterprise"

	serverMocks "github.com/mattermost/mattermost-plugin-calls/server/mocks/github.com/mattermost/mattermost-plugin-calls/server/interfaces"
	pluginMocks "github.com/mattermost/mattermost-plugin-calls/server/mocks/github.com/mattermost/mattermost/server/public/plugin"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/plugin"

	"github.com/livekit/protocol/auth"
	"github.com/livekit/protocol/livekit"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
	"github.com/twitchtv/twirp"
	"google.golang.org/protobuf/proto"
)

func TestParseSelftestRoom(t *testing.T) {
	nonce, ok := parseSelftestRoom(newSelftestRoomName("abc123"))
	require.True(t, ok)
	require.Equal(t, "abc123", nonce)

	for _, room := range []string{"", "abc123", selftestRoomPrefix} {
		_, ok := parseSelftestRoom(room)
		require.False(t, ok, room)
	}
}

func TestDiagErrCategory(t *testing.T) {
	cat, creds := diagErrCategory(twirp.NewError(twirp.Unauthenticated, "bad token"))
	require.Equal(t, "credentials rejected", cat)
	require.True(t, creds)

	cat, creds = diagErrCategory(fmt.Errorf("wrapped: %w", context.DeadlineExceeded))
	require.Equal(t, "timed out", cat)
	require.False(t, creds)

	cat, _ = diagErrCategory(&net.DNSError{Err: "no such host", Name: "lk.invalid"})
	require.Equal(t, "host not found", cat)

	cat, _ = diagErrCategory(fmt.Errorf("boom"))
	require.Equal(t, "unreachable", cat)
}

func TestRedactURL(t *testing.T) {
	require.Equal(t, "https://user:xxxxx@lk.example.com", redactURL("https://user:secret@lk.example.com"))
	require.Equal(t, "wss://lk.example.com", redactURL("wss://lk.example.com"))
}

func newDiagTestPlugin(t *testing.T) (*Plugin, *pluginMocks.MockAPI) {
	t.Helper()
	mockAPI := &pluginMocks.MockAPI{}
	mockMetrics := &serverMocks.MockMetrics{}
	mockMetrics.On("ObserveClusterMutexGrabTime", mock.Anything, mock.Anything).Maybe()
	mockMetrics.On("ObserveClusterMutexLockedTime", mock.Anything, mock.Anything).Maybe()
	mockMetrics.On("IncClusterMutexLockRetries", mock.Anything).Maybe()
	mockMetrics.On("IncStoreOp", mock.Anything).Maybe()
	mockMetrics.On("Handler").Return(nil).Maybe()
	mockMetrics.On("ObserveAppHandlersTime", mock.AnythingOfType("string"), mock.AnythingOfType("float64")).Maybe()
	mockAPI.On("GetConfig").Return(&model.Config{}, nil).Maybe()

	p := &Plugin{
		MattermostPlugin:  plugin.MattermostPlugin{API: mockAPI},
		metrics:           mockMetrics,
		apiLimiters:       map[string]*rate.Limiter{},
		callsClusterLocks: map[string]*cluster.Mutex{},
	}
	p.licenseChecker = enterprise.NewLicenseChecker(p.API)

	cfg := &configuration{}
	cfg.SetDefaults()
	cfg.LiveKitURL = "wss://lk.example.com"
	cfg.LiveKitAPIKey = "APIkeyvalue"
	cfg.LiveKitAPISecret = "supersecretvalue"
	p.configuration = cfg
	return p, mockAPI
}

func TestRenderDiagReport(t *testing.T) {
	p, _ := newDiagTestPlugin(t)

	report := &diagReport{At: time.Now().UnixMilli(), Results: []diagResult{
		{
			Name: diagCheckAPI, Status: diagFail,
			Detail:      "LiveKit rejected the server's credentials. Ask your system admin.",
			AdminDetail: "https://lk.internal:7880: credentials rejected (key supersecretvalue)",
		},
		{Name: diagCheckSIP, Status: diagFail, Detail: "Outbound dialing is not working.", AdminDetail: "Trunk ST_abc"},
	}}

	t.Run("regular user sees no admin detail", func(t *testing.T) {
		out := p.renderDiagReport(report, nil, "user1", false, false)
		require.Contains(t, out, "credentials")
		require.Contains(t, out, "Ask a system admin to run `/call diag`")
		require.NotContains(t, out, "lk.internal")
		require.NotContains(t, out, "ST_abc")
	})

	t.Run("admin sees detail but never secrets", func(t *testing.T) {
		out := p.renderDiagReport(report, nil, "admin1", true, true)
		require.Contains(t, out, "lk.internal")
		require.Contains(t, out, "ST_abc")
		require.Contains(t, out, "/call diag force")
		require.NotContains(t, out, "supersecretvalue")
		require.Contains(t, out, "[redacted]")
	})
}

func TestDiagUnconfiguredSkipsRest(t *testing.T) {
	p, mockAPI := newDiagTestPlugin(t)
	mockAPI.On("GetLicense").Return(&model.License{SkuShortName: "enterprise"}, nil)
	p.configuration.LiveKitURL = ""
	p.configuration.LiveKitAPIKey = ""

	report := p.runDiagChecks(context.Background())

	byName := map[string]diagResult{}
	for _, r := range report.Results {
		byName[r.Name] = r
	}
	require.Equal(t, diagFail, byName[diagCheckConfig].Status)
	for _, name := range []string{diagCheckAPI, diagCheckPublic, diagCheckWebhook} {
		require.Equal(t, diagSkip, byName[name].Status, name)
	}
}

func TestDiagWebhookShortCircuit(t *testing.T) {
	const key, secret = "testkey", "testsecret"
	p, mockAPI := newDiagTestPlugin(t)
	p.configuration.LiveKitAPIKey = key
	p.configuration.LiveKitAPISecret = secret
	// Variable-arity INFO log: room_started logs 8 key/values, participant_joined 12.
	for n := 8; n <= 12; n += 4 {
		args := []any{mock.AnythingOfType("string")}
		for i := 0; i < n; i++ {
			args = append(args, mock.Anything)
		}
		mockAPI.On("LogInfo", args...).Maybe()
	}

	nonce := "n0nce"
	mockAPI.On("KVSetWithExpiry", fmt.Sprintf(diagWebhookKeyFmt, nonce), []byte("room_started"), int64(diagKVExpirySecs)).
		Return(nil).Once()

	event := &livekit.WebhookEvent{
		Event: "room_started",
		Room:  &livekit.Room{Name: newSelftestRoomName(nonce)},
	}
	r := newSignedWebhookRequest(t, key, secret, event)
	w := httptest.NewRecorder()
	p.newAPIRouter().ServeHTTP(w, r)

	require.Equal(t, http.StatusOK, w.Result().StatusCode)
	mockAPI.AssertExpectations(t)

	// A participant event in a selftest room must not reach the lifecycle
	// handlers (no store is configured, so reaching them would panic).
	event = &livekit.WebhookEvent{
		Event:       "participant_joined",
		Room:        &livekit.Room{Name: newSelftestRoomName(nonce)},
		Participant: &livekit.ParticipantInfo{Identity: "diag-user"},
	}
	r = newSignedWebhookRequest(t, key, secret, event)
	w = httptest.NewRecorder()
	p.newAPIRouter().ServeHTTP(w, r)
	require.Equal(t, http.StatusOK, w.Result().StatusCode)
}

func TestRecordDiagBadSignature(t *testing.T) {
	t.Run("no probe in flight", func(t *testing.T) {
		p, mockAPI := newDiagTestPlugin(t)
		mockAPI.On("KVGet", diagProbeActiveKey).Return(nil, nil).Once()
		p.recordDiagBadSignature()
		mockAPI.AssertNotCalled(t, "KVSetWithExpiry", mock.Anything, mock.Anything, mock.Anything)
	})

	t.Run("probe in flight", func(t *testing.T) {
		p, mockAPI := newDiagTestPlugin(t)
		mockAPI.On("KVGet", diagProbeActiveKey).Return([]byte("nonce"), nil).Once()
		mockAPI.On("KVSetWithExpiry", diagBadSigKey, mock.Anything, int64(diagKVExpirySecs)).Return(nil).Once()
		p.recordDiagBadSignature()
		mockAPI.AssertExpectations(t)
	})
}

// fakeLiveKit stands in for a LiveKit server's RoomService and public root.
type fakeLiveKit struct {
	*httptest.Server

	rejectAuth   bool
	onCreateRoom func(room string)

	createCalls atomic.Int32
}

func newFakeLiveKit(t *testing.T) *fakeLiveKit {
	t.Helper()
	f := &fakeLiveKit{}
	f.Server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/" {
			w.WriteHeader(http.StatusOK)
			return
		}

		if f.rejectAuth {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusUnauthorized)
			_, _ = w.Write([]byte(`{"code":"unauthenticated","msg":"invalid token"}`))
			return
		}

		var resp proto.Message
		switch r.URL.Path {
		case "/twirp/livekit.RoomService/ListRooms":
			resp = &livekit.ListRoomsResponse{}
		case "/twirp/livekit.RoomService/CreateRoom":
			body, err := io.ReadAll(r.Body)
			require.NoError(t, err)
			var req livekit.CreateRoomRequest
			require.NoError(t, proto.Unmarshal(body, &req))
			f.createCalls.Add(1)
			if f.onCreateRoom != nil {
				f.onCreateRoom(req.Name)
			}
			resp = &livekit.Room{Name: req.Name}
		case "/twirp/livekit.RoomService/DeleteRoom":
			resp = &livekit.DeleteRoomResponse{}
		default:
			http.NotFound(w, r)
			return
		}

		data, err := proto.Marshal(resp)
		require.NoError(t, err)
		w.Header().Set("Content-Type", "application/protobuf")
		_, _ = w.Write(data)
	}))
	t.Cleanup(f.Close)
	return f
}

// newDiagProbePlugin returns a plugin whose plugin KV store is backed by a real
// table, since the probe polls it through p.KVGet.
func newDiagProbePlugin(t *testing.T, lkURL string) *Plugin {
	t.Helper()

	p, mockAPI := newDiagTestPlugin(t)
	p.configuration.LiveKitURL = lkURL
	p.configuration.LiveKitPrivateURL = ""
	p.configuration.DefaultEnabled = model.NewPointer(true)

	store, tearDown := NewTestStore(t)
	t.Cleanup(tearDown)
	p.store = store

	_, err := store.WriterDB().Exec(`CREATE TABLE IF NOT EXISTS PluginKeyValueStore (
		PluginId varchar(190) NOT NULL, PKey varchar(150) NOT NULL, PValue bytea, ExpireAt bigint NOT NULL DEFAULT 0,
		PRIMARY KEY (PluginId, PKey))`)
	require.NoError(t, err)

	set := func(key string, value []byte, expireSecs int64) {
		var expireAt int64
		if expireSecs > 0 {
			expireAt = time.Now().Add(time.Duration(expireSecs) * time.Second).UnixMilli()
		}
		_, err := store.WriterDB().Exec(`INSERT INTO PluginKeyValueStore (PluginId, PKey, PValue, ExpireAt)
			VALUES ($1, $2, $3, $4)
			ON CONFLICT (PluginId, PKey) DO UPDATE SET PValue = EXCLUDED.PValue, ExpireAt = EXCLUDED.ExpireAt`,
			manifest.Id, key, value, expireAt)
		require.NoError(t, err)
	}

	mockAPI.On("GetLicense").Return(&model.License{SkuShortName: "enterprise"}, nil).Maybe()
	mockAPI.On("KVSetWithExpiry", mock.Anything, mock.Anything, mock.Anything).Run(func(args mock.Arguments) {
		set(args.String(0), args.Get(1).([]byte), args.Get(2).(int64))
	}).Return(nil).Maybe()
	mockAPI.On("KVSet", mock.Anything, mock.Anything).Run(func(args mock.Arguments) {
		set(args.String(0), args.Get(1).([]byte), 0)
	}).Return(nil).Maybe()
	mockAPI.On("KVGet", mock.Anything).Return(func(key string) []byte {
		data, err := p.KVGet(key, true)
		require.NoError(t, err)
		return data
	}, nil).Maybe()
	// Cluster mutex plumbing.
	mockAPI.On("KVSetWithOptions", mock.Anything, mock.Anything, mock.Anything).Return(true, nil).Maybe()
	mockAPI.On("KVDelete", mock.Anything).Return(nil).Maybe()
	for _, level := range []string{"LogDebug", "LogInfo", "LogWarn", "LogError"} {
		for n := 0; n <= 24; n++ {
			args := []any{mock.AnythingOfType("string")}
			for i := 0; i < n; i++ {
				args = append(args, mock.Anything)
			}
			mockAPI.On(level, args...).Maybe()
		}
	}
	return p
}

func diagResultsByName(report *diagReport) map[string]diagResult {
	m := map[string]diagResult{}
	for _, r := range report.Results {
		m[r.Name] = r
	}
	return m
}

func TestDiagChecksAgainstFakeLiveKit(t *testing.T) {
	prev := diagWebhookTimeout
	diagWebhookTimeout = 400 * time.Millisecond
	t.Cleanup(func() { diagWebhookTimeout = prev })

	t.Run("healthy", func(t *testing.T) {
		lk := newFakeLiveKit(t)
		p := newDiagProbePlugin(t, lk.URL)
		lk.onCreateRoom = func(room string) {
			p.recordDiagWebhook(&livekit.WebhookEvent{Event: "room_started", Room: &livekit.Room{Name: room}})
		}

		got := diagResultsByName(p.runDiagChecks(context.Background()))
		for _, name := range []string{diagCheckCalls, diagCheckConfig, diagCheckAPI, diagCheckPublic, diagCheckWebhook} {
			require.Equal(t, diagOK, got[name].Status, "%s: %+v", name, got[name])
		}
		require.Contains(t, got[diagCheckWebhook].AdminDetail, "room_started")
	})

	t.Run("credentials rejected", func(t *testing.T) {
		lk := newFakeLiveKit(t)
		lk.rejectAuth = true
		p := newDiagProbePlugin(t, lk.URL)

		got := diagResultsByName(p.runDiagChecks(context.Background()))
		require.Equal(t, diagFail, got[diagCheckAPI].Status)
		require.Contains(t, got[diagCheckAPI].Detail, "rejected the server's credentials")
		require.NotContains(t, got[diagCheckAPI].Detail, lk.URL)
		require.Equal(t, diagFail, got[diagCheckWebhook].Status)
		require.Contains(t, got[diagCheckWebhook].Detail, "Could not create the test room")
	})

	t.Run("webhook never arrives", func(t *testing.T) {
		lk := newFakeLiveKit(t)
		p := newDiagProbePlugin(t, lk.URL)

		got := diagResultsByName(p.runDiagChecks(context.Background()))
		require.Equal(t, diagOK, got[diagCheckAPI].Status)
		require.Equal(t, diagFail, got[diagCheckWebhook].Status)
		require.Contains(t, got[diagCheckWebhook].Detail, "did not reach the server")
		require.Contains(t, got[diagCheckWebhook].AdminDetail, "livekit-webhook")
	})

	t.Run("webhook arrives with invalid signature", func(t *testing.T) {
		lk := newFakeLiveKit(t)
		p := newDiagProbePlugin(t, lk.URL)
		lk.onCreateRoom = func(string) { p.recordDiagBadSignature() }

		got := diagResultsByName(p.runDiagChecks(context.Background()))
		require.Equal(t, diagFail, got[diagCheckWebhook].Status)
		require.Contains(t, got[diagCheckWebhook].Detail, "was rejected")
		require.Contains(t, got[diagCheckWebhook].AdminDetail, "invalid signature")
	})

	t.Run("livekit unreachable", func(t *testing.T) {
		lk := newFakeLiveKit(t)
		p := newDiagProbePlugin(t, lk.URL)
		lk.Close()

		got := diagResultsByName(p.runDiagChecks(context.Background()))
		require.Equal(t, diagFail, got[diagCheckAPI].Status)
		require.Contains(t, got[diagCheckAPI].Detail, "connection refused")
		// The public URL is a warning only: clients may reach it where the
		// server cannot.
		require.Equal(t, diagWarn, got[diagCheckPublic].Status)
		require.Equal(t, diagFail, got[diagCheckWebhook].Status)
	})
}

func TestDiagReportCooldown(t *testing.T) {
	lk := newFakeLiveKit(t)
	p := newDiagProbePlugin(t, lk.URL)
	lk.onCreateRoom = func(room string) {
		p.recordDiagWebhook(&livekit.WebhookEvent{Event: "room_started", Room: &livekit.Room{Name: room}})
	}

	report, cached, err := p.getDiagReport(false, 0)
	require.NoError(t, err)
	require.False(t, cached)
	require.False(t, report.failed())
	require.EqualValues(t, 1, lk.createCalls.Load())

	// Within the cooldown the cached result is replayed and nothing is probed.
	report2, cached, err := p.getDiagReport(false, 0)
	require.NoError(t, err)
	require.True(t, cached)
	require.Equal(t, report.At, report2.At)
	require.EqualValues(t, 1, lk.createCalls.Load())

	// force bypasses the cooldown.
	_, cached, err = p.getDiagReport(true, 0)
	require.NoError(t, err)
	require.False(t, cached)
	require.EqualValues(t, 2, lk.createCalls.Load())
}

func TestMintDiagToken(t *testing.T) {
	p, _ := newDiagTestPlugin(t)

	token, url, err := p.mintDiagToken("user1", "n0nce")
	require.NoError(t, err)
	require.Equal(t, p.configuration.LiveKitURL, url)

	verifier, err := auth.ParseAPIToken(token)
	require.NoError(t, err)
	jwtClaims, claims, err := verifier.Verify(p.configuration.LiveKitAPISecret)
	require.NoError(t, err)

	require.Equal(t, "diag-user1", claims.Identity)
	// Never parses as a call session identity.
	_, _, ok := parseLivekitIdentity(claims.Identity)
	require.False(t, ok)

	v := claims.Video
	require.True(t, v.RoomJoin)
	require.Equal(t, newSelftestRoomName("n0nce"), v.Room)
	require.True(t, v.GetCanPublish())
	require.True(t, v.GetCanSubscribe())
	require.False(t, v.GetCanPublishData())
	require.False(t, v.RoomAdmin)
	require.False(t, v.RoomCreate)
	require.False(t, v.RoomList)

	require.NotNil(t, jwtClaims.ExpiresAt)
	require.LessOrEqual(t, time.Until(jwtClaims.ExpiresAt.Time), diagTokenTTL)

	p.configuration.LiveKitAPISecret = ""
	_, _, err = p.mintDiagToken("user1", "n0nce")
	require.ErrorIs(t, err, errLiveKitNotConfigured)
}

func TestDiagClientReportSanitize(t *testing.T) {
	var checks []diagClientCheck
	for i := 0; i < diagMaxClientChecks+5; i++ {
		checks = append(checks, diagClientCheck{Name: "check", Status: diagOK})
	}
	checks[0] = diagClientCheck{Name: strings.Repeat("n", 500), Status: "bogus", Detail: strings.Repeat("d", 5000)}

	got := (&diagClientReport{Checks: checks, SkippedReason: strings.Repeat("r", 1000)}).sanitize()
	require.Len(t, got.Checks, diagMaxClientChecks)
	require.Len(t, got.Checks[0].Name, diagMaxNameLen)
	require.Len(t, got.Checks[0].Detail, diagMaxDetailLen)
	require.Equal(t, diagSkip, got.Checks[0].Status)
	require.Len(t, got.SkippedReason, diagMaxReasonLen)
}

func TestRenderDiagReportClientHalf(t *testing.T) {
	p, _ := newDiagTestPlugin(t)
	report := &diagReport{At: time.Now().UnixMilli(), Results: []diagResult{{Name: diagCheckAPI, Status: diagOK}}}

	t.Run("no client half", func(t *testing.T) {
		out := p.renderDiagReport(report, nil, "u", false, false)
		require.Contains(t, out, "this client does not support them")
	})

	t.Run("skipped with reason", func(t *testing.T) {
		out := p.renderDiagReport(report, &diagClientReport{SkippedReason: "LiveKit is not configured."}, "u", false, false)
		require.Contains(t, out, "skipped: LiveKit is not configured.")
	})

	t.Run("server details are hidden from a regular user but not an admin", func(t *testing.T) {
		client := &diagClientReport{Checks: []diagClientCheck{
			{Name: "Signaling", Status: diagWarn, Detail: "Server is insecure; Connected to server, version 1.13.1."},
			{Name: "WebRTC", Status: diagWarn, Detail: "No public IPv4 UDP candidates were found; UDP 172.16.0.3:7882 host (private); TCP 172.16.0.3:7881 host (private); Reached 10.1.2.3:443"},
		}}

		user := p.renderDiagReport(report, client, "u", false, false)
		require.Contains(t, user, "Server is insecure")
		require.Contains(t, user, "Connected to server.")
		require.Contains(t, user, "No public IPv4 UDP candidates were found")
		require.NotContains(t, user, "1.13.1")
		require.NotContains(t, user, "172.16.0.3")
		require.NotContains(t, user, "10.1.2.3")
		require.Contains(t, user, "[address]")

		admin := p.renderDiagReport(report, client, "a", true, false)
		require.Contains(t, admin, "version 1.13.1")
		require.Contains(t, admin, "UDP 172.16.0.3:7882 host (private)")
	})

	t.Run("results are shown in full to a regular user", func(t *testing.T) {
		out := p.renderDiagReport(report, &diagClientReport{Checks: []diagClientCheck{
			{Name: "WebRTC", Status: diagOK, Detail: "Connected via UDP"},
			{Name: "TURN", Status: diagInfo, Detail: "No TURN server | not required"},
		}}, "u", false, false)
		require.Contains(t, out, "Your connection")
		require.Contains(t, out, "| Check | Notes |")
		require.NotContains(t, out, "Result")
		require.Contains(t, out, "Connected via UDP")
		require.Contains(t, out, `No TURN server \| not required`)
		require.Contains(t, out, "WebRTC: ok")
		require.Contains(t, out, "TURN: info")

		// The copyable summary carries the same notes, unescaped.
		summary := out[strings.Index(out, "Summary for a support request"):]
		require.Contains(t, summary, "WebRTC: ok - Connected via UDP")
		require.Contains(t, summary, "TURN: info - No TURN server | not required")
		require.Contains(t, summary, "Your connection")
	})
}

func TestHandleDiagToken(t *testing.T) {
	setup := func(t *testing.T) (*Plugin, *pluginMocks.MockAPI, *fakeLiveKit) {
		t.Helper()
		lk := newFakeLiveKit(t)
		p := newDiagProbePlugin(t, lk.URL)
		mockAPI := p.API.(*pluginMocks.MockAPI)
		mockAPI.On("HasPermissionTo", mock.Anything, model.PermissionManageSystem).Return(false).Maybe()
		mockAPI.On("GetChannel", mock.Anything).Return(&model.Channel{Id: model.NewId(), Type: model.ChannelTypeOpen}, nil).Maybe()
		mockAPI.On("SendEphemeralPost", mock.Anything, mock.Anything).Return(&model.Post{}).Maybe()
		lk.onCreateRoom = func(room string) {
			p.recordDiagWebhook(&livekit.WebhookEvent{Event: "room_started", Room: &livekit.Room{Name: room}})
		}
		return p, mockAPI, lk
	}

	post := func(p *Plugin, userID string, body string) *httptest.ResponseRecorder {
		r := httptest.NewRequest(http.MethodPost, "/diag/token", strings.NewReader(body))
		r.Header.Set("Mattermost-User-Id", userID)
		w := httptest.NewRecorder()
		p.handleDiagToken(w, r)
		return w
	}

	channelID := model.NewId()
	body := fmt.Sprintf(`{"channel_id":%q}`, channelID)

	t.Run("no channel permission", func(t *testing.T) {
		p, mockAPI, _ := setup(t)
		mockAPI.On("HasPermissionToChannel", "user1", channelID, model.PermissionCreatePost).Return(false)

		w := post(p, "user1", body)
		require.Equal(t, http.StatusForbidden, w.Code)
		require.NotContains(t, w.Body.String(), `"token"`)
	})

	t.Run("invalid channel id", func(t *testing.T) {
		p, _, _ := setup(t)
		require.Equal(t, http.StatusBadRequest, post(p, "user1", `{"channel_id":"nope"}`).Code)
	})

	t.Run("mints a token, starts the server half and rate limits", func(t *testing.T) {
		p, mockAPI, lk := setup(t)
		mockAPI.On("HasPermissionToChannel", mock.Anything, channelID, model.PermissionCreatePost).Return(true)

		w := post(p, "user1", body)
		require.Equal(t, http.StatusOK, w.Code)

		var resp diagTokenResponse
		require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
		require.NotEmpty(t, resp.Token)
		require.Equal(t, lk.URL, resp.URL)
		require.NotZero(t, resp.StartedAt)

		// The server half runs in the background, in parallel with the client's.
		require.Eventually(t, func() bool { return lk.createCalls.Load() == 1 }, 5*time.Second, 50*time.Millisecond)

		// Burst of 3 is allowed, then the per-user limiter rejects.
		require.Equal(t, http.StatusOK, post(p, "user1", body).Code)
		require.Equal(t, http.StatusOK, post(p, "user1", body).Code)
		require.Equal(t, http.StatusTooManyRequests, post(p, "user1", body).Code)
		require.Equal(t, http.StatusOK, post(p, "user2", body).Code, "limit is per user")

		// Let the background runs finish before the DB goes away.
		time.Sleep(time.Second)
	})

	t.Run("LiveKit not configured", func(t *testing.T) {
		p, mockAPI, _ := setup(t)
		mockAPI.On("HasPermissionToChannel", "user1", channelID, model.PermissionCreatePost).Return(true)
		p.configuration.LiveKitAPISecret = ""

		require.Equal(t, http.StatusServiceUnavailable, post(p, "user1", body).Code)
	})
}
