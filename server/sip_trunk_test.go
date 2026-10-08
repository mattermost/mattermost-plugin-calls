// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"testing"

	pluginMocks "github.com/mattermost/mattermost-plugin-calls/server/mocks/github.com/mattermost/mattermost/server/public/plugin"

	"github.com/livekit/protocol/livekit"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
	"google.golang.org/protobuf/proto"
)

type fakeSIPOutboundTrunkAPI struct {
	trunks  []*livekit.SIPOutboundTrunkInfo
	nextID  int
	created int
	updated int
	deleted []string
	listErr error
}

func (f *fakeSIPOutboundTrunkAPI) ListSIPOutboundTrunk(_ context.Context, _ *livekit.ListSIPOutboundTrunkRequest) (*livekit.ListSIPOutboundTrunkResponse, error) {
	if f.listErr != nil {
		return nil, f.listErr
	}
	items := make([]*livekit.SIPOutboundTrunkInfo, 0, len(f.trunks))
	for _, t := range f.trunks {
		items = append(items, proto.Clone(t).(*livekit.SIPOutboundTrunkInfo))
	}
	return &livekit.ListSIPOutboundTrunkResponse{Items: items}, nil
}

func (f *fakeSIPOutboundTrunkAPI) CreateSIPOutboundTrunk(_ context.Context, in *livekit.CreateSIPOutboundTrunkRequest) (*livekit.SIPOutboundTrunkInfo, error) {
	f.nextID++
	f.created++
	trunk := proto.Clone(in.Trunk).(*livekit.SIPOutboundTrunkInfo)
	trunk.SipTrunkId = fmt.Sprintf("ST_%d", f.nextID)
	f.trunks = append(f.trunks, trunk)
	return trunk, nil
}

func (f *fakeSIPOutboundTrunkAPI) UpdateSIPOutboundTrunk(_ context.Context, in *livekit.UpdateSIPOutboundTrunkRequest) (*livekit.SIPOutboundTrunkInfo, error) {
	for i, t := range f.trunks {
		if t.SipTrunkId == in.SipTrunkId {
			f.updated++
			trunk := proto.Clone(in.GetReplace()).(*livekit.SIPOutboundTrunkInfo)
			trunk.SipTrunkId = in.SipTrunkId
			f.trunks[i] = trunk
			return trunk, nil
		}
	}
	return nil, errors.New("not found")
}

func (f *fakeSIPOutboundTrunkAPI) DeleteSIPOutboundTrunk(_ context.Context, trunkID string) error {
	for i, t := range f.trunks {
		if t.SipTrunkId == trunkID {
			f.trunks = append(f.trunks[:i], f.trunks[i+1:]...)
			f.deleted = append(f.deleted, trunkID)
			return nil
		}
	}
	return errors.New("not found")
}

func managedTrunkConfig() *configuration {
	cfg := &configuration{
		LiveKitAPISecret:                    "secret",
		LiveKitSIPOutboundTrunkName:         "twilio",
		LiveKitSIPOutboundTrunkAddress:      "example.pstn.twilio.com",
		LiveKitSIPOutboundTrunkTransport:    "TCP",
		LiveKitSIPOutboundTrunkNumbers:      "+1 781 650 9397\n17816509397\n",
		LiveKitSIPOutboundTrunkAuthUsername: "mattermost",
		LiveKitSIPOutboundTrunkAuthPassword: "hunter2",
	}
	cfg.SetDefaults()
	return cfg
}

func TestSIPOutboundTrunkSpec(t *testing.T) {
	spec := managedTrunkConfig().sipOutboundTrunkSpec()
	assert.Equal(t, sipOutboundTrunkSpec{
		Name:         "twilio",
		Address:      "example.pstn.twilio.com",
		Transport:    livekit.SIPTransport_SIP_TRANSPORT_TCP,
		Numbers:      []string{"+17816509397"},
		AuthUsername: "mattermost",
		AuthPassword: "hunter2",
	}, spec)

	t.Run("default name", func(t *testing.T) {
		cfg := managedTrunkConfig()
		cfg.LiveKitSIPOutboundTrunkName = ""
		assert.Equal(t, sipOutboundTrunkDefaultName, cfg.sipOutboundTrunkSpec().Name)
	})

	t.Run("hash covers password", func(t *testing.T) {
		other := spec
		other.AuthPassword = "changed"
		assert.NotEqual(t, spec.hash("secret"), other.hash("secret"))
		assert.Equal(t, spec.hash("secret"), spec.hash("secret"))
	})
}

func TestValidateSIPOutboundTrunk(t *testing.T) {
	tcs := []struct {
		name   string
		modify func(cfg *configuration)
		err    string
	}{
		{name: "valid", modify: func(_ *configuration) {}},
		{name: "unmanaged", modify: func(cfg *configuration) {
			cfg.LiveKitSIPOutboundTrunkAddress = ""
			cfg.LiveKitSIPOutboundTrunkNumbers = ""
			cfg.LiveKitSIPOutboundTrunkID = "ST_existing"
		}},
		{name: "trunk ID and address both set", modify: func(cfg *configuration) {
			cfg.LiveKitSIPOutboundTrunkID = "ST_existing"
		}, err: "mutually exclusive"},
		{name: "address with scheme", modify: func(cfg *configuration) {
			cfg.LiveKitSIPOutboundTrunkAddress = "sip:example.pstn.twilio.com"
		}, err: "LiveKitSIPOutboundTrunkAddress is not valid"},
		{name: "address with URL scheme", modify: func(cfg *configuration) {
			cfg.LiveKitSIPOutboundTrunkAddress = "https://example.pstn.twilio.com"
		}, err: "LiveKitSIPOutboundTrunkAddress is not valid"},
		{name: "unknown transport", modify: func(cfg *configuration) {
			cfg.LiveKitSIPOutboundTrunkTransport = "sctp"
		}, err: "LiveKitSIPOutboundTrunkTransport is not valid"},
		{name: "no numbers", modify: func(cfg *configuration) {
			cfg.LiveKitSIPOutboundTrunkNumbers = " \n "
		}, err: "LiveKitSIPOutboundTrunkNumbers is not valid"},
	}

	for _, tc := range tcs {
		t.Run(tc.name, func(t *testing.T) {
			cfg := managedTrunkConfig()
			tc.modify(cfg)
			err := cfg.IsValid()
			if tc.err == "" {
				require.NoError(t, err)
				return
			}
			require.Error(t, err)
			assert.Contains(t, err.Error(), tc.err)
		})
	}
}

func TestEnsureSIPOutboundTrunk(t *testing.T) {
	const owner = "diagnostic-id"

	setup := func(t *testing.T) *Plugin {
		mockAPI := &pluginMocks.MockAPI{}
		t.Cleanup(func() { mockAPI.AssertExpectations(t) })
		for _, level := range []string{"LogInfo", "LogWarn"} {
			args := []any{mock.Anything}
			for range 8 {
				args = append(args, mock.Anything)
			}
			mockAPI.On(level, args...).Return().Maybe()
			mockAPI.On(level, args[:7]...).Return().Maybe()
		}
		p := &Plugin{}
		p.SetAPI(mockAPI)
		return p
	}

	spec := managedTrunkConfig().sipOutboundTrunkSpec()
	specHash := spec.hash("secret")

	t.Run("creates trunk when none is owned", func(t *testing.T) {
		p := setup(t)
		api := &fakeSIPOutboundTrunkAPI{trunks: []*livekit.SIPOutboundTrunkInfo{
			{SipTrunkId: "ST_unmanaged", Name: "manual"},
		}}

		id, err := p.ensureSIPOutboundTrunk(context.Background(), api, spec, owner, specHash)
		require.NoError(t, err)
		assert.Equal(t, "ST_1", id)
		assert.Equal(t, 1, api.created)
		require.Len(t, api.trunks, 2)

		created := api.trunks[1]
		assert.Equal(t, "example.pstn.twilio.com", created.Address)
		assert.Equal(t, livekit.SIPTransport_SIP_TRANSPORT_TCP, created.Transport)
		assert.Equal(t, []string{"+17816509397"}, created.Numbers)
		assert.Equal(t, "hunter2", created.AuthPassword)

		var md sipOutboundTrunkMetadata
		require.NoError(t, json.Unmarshal([]byte(created.Metadata), &md))
		assert.Equal(t, sipOutboundTrunkMetadata{ManagedBy: sipOutboundTrunkManagedBy, Owner: owner, SpecHash: specHash}, md)
	})

	t.Run("is idempotent", func(t *testing.T) {
		p := setup(t)
		api := &fakeSIPOutboundTrunkAPI{}

		first, err := p.ensureSIPOutboundTrunk(context.Background(), api, spec, owner, specHash)
		require.NoError(t, err)
		second, err := p.ensureSIPOutboundTrunk(context.Background(), api, spec, owner, specHash)
		require.NoError(t, err)

		assert.Equal(t, first, second)
		assert.Equal(t, 1, api.created)
		assert.Zero(t, api.updated)
		assert.Len(t, api.trunks, 1)
	})

	t.Run("replaces trunk when configuration changes", func(t *testing.T) {
		p := setup(t)
		api := &fakeSIPOutboundTrunkAPI{}
		id, err := p.ensureSIPOutboundTrunk(context.Background(), api, spec, owner, specHash)
		require.NoError(t, err)

		changed := spec
		changed.AuthPassword = "new-password"
		updatedID, err := p.ensureSIPOutboundTrunk(context.Background(), api, changed, owner, changed.hash("secret"))
		require.NoError(t, err)

		assert.Equal(t, id, updatedID)
		assert.Equal(t, 1, api.updated)
		require.Len(t, api.trunks, 1)
		assert.Equal(t, "new-password", api.trunks[0].AuthPassword)
	})

	t.Run("reverts changes made outside the plugin", func(t *testing.T) {
		p := setup(t)
		api := &fakeSIPOutboundTrunkAPI{}
		_, err := p.ensureSIPOutboundTrunk(context.Background(), api, spec, owner, specHash)
		require.NoError(t, err)
		api.trunks[0].Address = "elsewhere.example.com"

		_, err = p.ensureSIPOutboundTrunk(context.Background(), api, spec, owner, specHash)
		require.NoError(t, err)
		assert.Equal(t, 1, api.updated)
		assert.Equal(t, "example.pstn.twilio.com", api.trunks[0].Address)
	})

	t.Run("ignores trunks owned by other installations", func(t *testing.T) {
		p := setup(t)
		api := &fakeSIPOutboundTrunkAPI{}
		_, err := p.ensureSIPOutboundTrunk(context.Background(), api, spec, "other-installation", specHash)
		require.NoError(t, err)

		id, err := p.ensureSIPOutboundTrunk(context.Background(), api, spec, owner, specHash)
		require.NoError(t, err)
		assert.Equal(t, "ST_2", id)
		assert.Equal(t, 2, api.created)
		assert.Zero(t, api.updated)
	})

	t.Run("deletes duplicate owned trunks", func(t *testing.T) {
		p := setup(t)
		api := &fakeSIPOutboundTrunkAPI{}
		_, err := p.ensureSIPOutboundTrunk(context.Background(), api, spec, owner, specHash)
		require.NoError(t, err)
		_, err = api.CreateSIPOutboundTrunk(context.Background(), &livekit.CreateSIPOutboundTrunkRequest{Trunk: api.trunks[0]})
		require.NoError(t, err)

		id, err := p.ensureSIPOutboundTrunk(context.Background(), api, spec, owner, specHash)
		require.NoError(t, err)
		assert.Equal(t, "ST_1", id)
		assert.Equal(t, []string{"ST_2"}, api.deleted)
		assert.Len(t, api.trunks, 1)
	})

	t.Run("list error", func(t *testing.T) {
		p := setup(t)
		api := &fakeSIPOutboundTrunkAPI{listErr: errors.New("unavailable")}
		_, err := p.ensureSIPOutboundTrunk(context.Background(), api, spec, owner, specHash)
		require.ErrorContains(t, err, "failed to list SIP outbound trunks")
		assert.Zero(t, api.created)
	})
}

func TestGetSIPOutboundTrunkID(t *testing.T) {
	t.Run("existing trunk ID", func(t *testing.T) {
		p := &Plugin{configuration: &configuration{LiveKitSIPOutboundTrunkID: "ST_existing"}}
		id, err := p.getSIPOutboundTrunkID()
		require.NoError(t, err)
		assert.Equal(t, "ST_existing", id)
	})

	t.Run("not configured", func(t *testing.T) {
		p := &Plugin{configuration: &configuration{}}
		id, err := p.getSIPOutboundTrunkID()
		require.NoError(t, err)
		assert.Empty(t, id)
	})

	t.Run("cached managed trunk", func(t *testing.T) {
		cfg := managedTrunkConfig()
		p := &Plugin{
			configuration:            cfg,
			sipOutboundTrunkID:       "ST_cached",
			sipOutboundTrunkSpecHash: cfg.sipOutboundTrunkSpec().hash(cfg.LiveKitAPISecret),
		}
		id, err := p.getSIPOutboundTrunkID()
		require.NoError(t, err)
		assert.Equal(t, "ST_cached", id)
	})

	t.Run("managed trunk without LiveKit credentials", func(t *testing.T) {
		cfg := managedTrunkConfig()
		cfg.LiveKitAPISecret = ""
		p := &Plugin{configuration: cfg}
		_, err := p.getSIPOutboundTrunkID()
		require.ErrorIs(t, err, errLiveKitNotConfigured)
	})
}
