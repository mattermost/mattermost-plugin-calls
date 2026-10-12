// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"context"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/livekit/protocol/livekit"
	"github.com/mattermost/mattermost/server/public/model"
	"github.com/stretchr/testify/require"
)

// fakeSIPService is an in-memory LiveKit SIP trunk API. Unimplemented methods
// panic via the nil embedded interface.
type fakeSIPService struct {
	livekit.SIP
	trunks  []*livekit.SIPOutboundTrunkInfo
	creates int
	updates int
}

func (f *fakeSIPService) ListSIPOutboundTrunk(_ context.Context, req *livekit.ListSIPOutboundTrunkRequest) (*livekit.ListSIPOutboundTrunkResponse, error) {
	if len(req.TrunkIds) > 0 {
		var items []*livekit.SIPOutboundTrunkInfo
		for _, id := range req.TrunkIds {
			for _, t := range f.trunks {
				if t.SipTrunkId == id {
					items = append(items, t)
				}
			}
		}
		return &livekit.ListSIPOutboundTrunkResponse{Items: items}, nil
	}
	return &livekit.ListSIPOutboundTrunkResponse{Items: f.trunks}, nil
}

func (f *fakeSIPService) CreateSIPOutboundTrunk(_ context.Context, req *livekit.CreateSIPOutboundTrunkRequest) (*livekit.SIPOutboundTrunkInfo, error) {
	f.creates++
	t := req.Trunk
	t.SipTrunkId = "ST_new"
	f.trunks = append(f.trunks, t)
	return t, nil
}

func (f *fakeSIPService) UpdateSIPOutboundTrunk(_ context.Context, req *livekit.UpdateSIPOutboundTrunkRequest) (*livekit.SIPOutboundTrunkInfo, error) {
	f.updates++
	for i, t := range f.trunks {
		if t.SipTrunkId == req.SipTrunkId {
			repl := req.GetReplace()
			repl.SipTrunkId = t.SipTrunkId
			f.trunks[i] = repl
			return repl, nil
		}
	}
	return nil, context.Canceled
}

func managedCfg(url string) *configuration {
	cfg := &configuration{
		LiveKitURL:           url,
		LiveKitAPIKey:        "key",
		LiveKitAPISecret:     "01234567890123456789012345678901",
		ClientConfig:         ClientConfig{EnableSIPOutbound: model.NewPointer(true)},
		SIPTrunkMode:         sipTrunkModeManaged,
		SIPTrunkAddress:      "example.pstn.twilio.com",
		SIPTrunkNumber:       "+15551234567",
		SIPTrunkAuthUsername: "user",
		SIPTrunkAuthPassword: "pass",
	}
	return cfg
}

func TestReconcileSIPTrunk(t *testing.T) {
	md := sipTrunkMetadata{ManagedBy: sipTrunkManagedBy, Server: "server1", Site: "mm.example.com"}

	setup := func(t *testing.T, svc *fakeSIPService) *configuration {
		ts := httptest.NewServer(livekit.NewSIPServer(svc))
		t.Cleanup(ts.Close)
		return managedCfg(ts.URL)
	}

	t.Run("creates when missing", func(t *testing.T) {
		svc := &fakeSIPService{}
		cfg := setup(t, svc)
		res, err := reconcileSIPTrunkWithClient(context.Background(), newSIPClient(cfg), cfg, md)
		require.NoError(t, err)
		require.Equal(t, "ST_new", res.TrunkID)
		require.Equal(t, sipTrunkActionCreated, res.Action)
		require.Equal(t, 1, svc.creates)
		require.Equal(t, sipTrunkName, svc.trunks[0].Name)
		require.Equal(t, "example.pstn.twilio.com", svc.trunks[0].Address)
		require.True(t, isOwnSIPTrunk(svc.trunks[0], "server1"))
	})

	t.Run("no-op when in sync", func(t *testing.T) {
		svc := &fakeSIPService{}
		cfg := setup(t, svc)
		_, err := reconcileSIPTrunkWithClient(context.Background(), newSIPClient(cfg), cfg, md)
		require.NoError(t, err)
		res, err := reconcileSIPTrunkWithClient(context.Background(), newSIPClient(cfg), cfg, md)
		require.NoError(t, err)
		require.Equal(t, "ST_new", res.TrunkID)
		require.Equal(t, sipTrunkActionUnchanged, res.Action)
		require.Empty(t, res.Fields)
		require.Equal(t, 1, svc.creates)
		require.Equal(t, 0, svc.updates)
	})

	t.Run("updates in place on drift keeping the ID", func(t *testing.T) {
		svc := &fakeSIPService{}
		cfg := setup(t, svc)
		_, err := reconcileSIPTrunkWithClient(context.Background(), newSIPClient(cfg), cfg, md)
		require.NoError(t, err)

		cfg.SIPTrunkAuthPassword = "rotated"
		cfg.SIPTrunkNumber = "+15550000000"
		res, err := reconcileSIPTrunkWithClient(context.Background(), newSIPClient(cfg), cfg, md)
		require.NoError(t, err)
		require.Equal(t, "ST_new", res.TrunkID)
		require.Equal(t, sipTrunkActionUpdated, res.Action)
		require.ElementsMatch(t, []string{"numbers", "authPassword"}, res.Fields)
		require.Equal(t, 1, svc.updates)
		require.Equal(t, 1, svc.creates)
		require.Equal(t, "rotated", svc.trunks[0].AuthPassword)
	})

	t.Run("does not touch other trunks and ignores another server's trunk", func(t *testing.T) {
		other := sipTrunkMetadata{ManagedBy: sipTrunkManagedBy, Server: "server2"}
		otherDesired, err := desiredSIPTrunk(managedCfg(""), other)
		require.NoError(t, err)
		otherDesired.SipTrunkId = "ST_other"
		unrelated := &livekit.SIPOutboundTrunkInfo{SipTrunkId: "ST_hand", Name: "hand-built", Address: "x"}

		svc := &fakeSIPService{trunks: []*livekit.SIPOutboundTrunkInfo{unrelated, otherDesired}}
		cfg := setup(t, svc)
		// Same name, different server marker: not ours, so it's treated as a name collision.
		_, err = reconcileSIPTrunkWithClient(context.Background(), newSIPClient(cfg), cfg, md)
		require.Error(t, err)
		require.Equal(t, 0, svc.creates)
		require.Equal(t, 0, svc.updates)
		require.Equal(t, "x", unrelated.Address)
	})

	t.Run("refuses to adopt same-named trunk without marker", func(t *testing.T) {
		svc := &fakeSIPService{trunks: []*livekit.SIPOutboundTrunkInfo{{SipTrunkId: "ST_x", Name: sipTrunkName, Address: "old"}}}
		cfg := setup(t, svc)
		_, err := reconcileSIPTrunkWithClient(context.Background(), newSIPClient(cfg), cfg, md)
		require.ErrorContains(t, err, "refusing to adopt")
		require.Equal(t, 0, svc.updates)
		require.Equal(t, "old", svc.trunks[0].Address)
	})
}

func TestSIPTrunkDrift(t *testing.T) {
	a := &livekit.SIPOutboundTrunkInfo{Address: "a", Numbers: []string{"+1", "+2"}, AuthUsername: "u", AuthPassword: "p", Metadata: "m"}
	b := &livekit.SIPOutboundTrunkInfo{Address: "a", Numbers: []string{"+2", "+1"}, AuthUsername: "u", AuthPassword: "p", Metadata: "m"}
	require.Empty(t, sipTrunkDrift(a, b), "number order must not count as drift")
	b.Numbers = []string{"+1"}
	b.AuthPassword = "other"
	require.Equal(t, []string{"numbers", "authPassword"}, sipTrunkDrift(a, b))
	for _, f := range sipTrunkDrift(a, b) {
		require.NotContains(t, f, "other", "drift reports field names, never values")
	}
}

func TestValidateManagedSIPTrunk(t *testing.T) {
	t.Run("valid", func(t *testing.T) {
		require.NoError(t, managedCfg("").validateManagedSIPTrunk())
	})
	t.Run("skipped when outbound disabled", func(t *testing.T) {
		cfg := managedCfg("")
		cfg.EnableSIPOutbound = model.NewPointer(false)
		cfg.SIPTrunkAddress = ""
		require.NoError(t, cfg.validateManagedSIPTrunk())
	})
	t.Run("missing address", func(t *testing.T) {
		cfg := managedCfg("")
		cfg.SIPTrunkAddress = ""
		require.Error(t, cfg.validateManagedSIPTrunk())
	})
	t.Run("address with scheme", func(t *testing.T) {
		cfg := managedCfg("")
		cfg.SIPTrunkAddress = "sip:example.com"
		require.Error(t, cfg.validateManagedSIPTrunk())
	})
	t.Run("missing number", func(t *testing.T) {
		cfg := managedCfg("")
		cfg.SIPTrunkNumber = ""
		require.Error(t, cfg.validateManagedSIPTrunk())
	})
	t.Run("non E.164 number", func(t *testing.T) {
		cfg := managedCfg("")
		cfg.SIPTrunkNumber = "555-1234"
		require.Error(t, cfg.validateManagedSIPTrunk())
	})
	t.Run("a second number is rejected", func(t *testing.T) {
		cfg := managedCfg("")
		cfg.SIPTrunkNumber = "+15551234567, +15557654321"
		require.Error(t, cfg.validateManagedSIPTrunk())
	})
	t.Run("surrounding whitespace is tolerated", func(t *testing.T) {
		cfg := managedCfg("")
		cfg.SIPTrunkNumber = "  +15551234567 "
		require.NoError(t, cfg.validateManagedSIPTrunk())
	})
}

func TestResolveSIPTrunkID(t *testing.T) {
	t.Run("existing mode uses configured ID", func(t *testing.T) {
		p := &Plugin{}
		cfg := &configuration{SIPTrunkMode: sipTrunkModeExisting, LiveKitSIPOutboundTrunkID: "ST_abc"}
		require.Equal(t, "ST_abc", p.resolveSIPTrunkID(cfg))
	})
	t.Run("managed mode returns cached ID without reconciling", func(t *testing.T) {
		p := &Plugin{sipTrunkID: "ST_cached"}
		require.Equal(t, "ST_cached", p.resolveSIPTrunkID(managedCfg("http://unused")))
	})
	t.Run("managed mode throttles dial-time reconcile", func(t *testing.T) {
		p := &Plugin{}
		p.sipTrunkLastAttempt = time.Now()
		require.Equal(t, "", p.resolveSIPTrunkID(managedCfg("http://unused")))
	})
	t.Run("invalidate clears only the matching ID", func(t *testing.T) {
		p := &Plugin{sipTrunkID: "ST_a"}
		p.invalidateSIPTrunk("ST_b")
		require.Equal(t, "ST_a", p.sipTrunkID)
		p.invalidateSIPTrunk("ST_a")
		require.Equal(t, "", p.sipTrunkID)
	})
}

func TestBuildSIPTrunkStatusManaged(t *testing.T) {
	newPlugin := func(cfg *configuration) *Plugin {
		p := &Plugin{}
		p.configuration = cfg
		return p
	}

	t.Run("pending before any reconcile", func(t *testing.T) {
		st := newPlugin(managedCfg("http://lk")).buildSIPTrunkStatus()
		require.Equal(t, sipTrunkStatePending, st.State)
	})
	t.Run("ready with cached ID", func(t *testing.T) {
		p := newPlugin(managedCfg("http://lk"))
		p.sipTrunkID = "ST_x"
		p.sipTrunkLastAttempt = time.Now()
		p.sipTrunkLastOK = time.Now()
		st := p.buildSIPTrunkStatus()
		require.Equal(t, sipTrunkStateReady, st.State)
		require.Equal(t, "ST_x", st.TrunkID)
		require.NotZero(t, st.LastReconciled)
	})
	t.Run("error reported", func(t *testing.T) {
		p := newPlugin(managedCfg("http://lk"))
		p.sipTrunkLastAttempt = time.Now()
		p.sipTrunkErr = "boom"
		st := p.buildSIPTrunkStatus()
		require.Equal(t, sipTrunkStateError, st.State)
		require.Equal(t, "boom", st.Error)
	})
	t.Run("not configured when outbound disabled", func(t *testing.T) {
		cfg := managedCfg("http://lk")
		cfg.EnableSIPOutbound = model.NewPointer(false)
		st := newPlugin(cfg).buildSIPTrunkStatus()
		require.Equal(t, sipTrunkStateNone, st.State)
	})
}
