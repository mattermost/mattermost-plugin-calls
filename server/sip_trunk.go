// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"slices"
	"strings"
	"time"

	"github.com/mattermost/mattermost-plugin-calls/server/cluster"

	"github.com/livekit/protocol/livekit"
	lksdk "github.com/livekit/server-sdk-go/v2"
)

const (
	sipOutboundTrunkManagedBy   = "mattermost-calls"
	sipOutboundTrunkDefaultName = "mattermost-calls"
	sipOutboundTrunkSyncTimeout = 15 * time.Second
	sipOutboundTrunkLockKey     = "sip_outbound_trunk_sync"
)

var sipTransportsByName = map[string]livekit.SIPTransport{
	"auto": livekit.SIPTransport_SIP_TRANSPORT_AUTO,
	"udp":  livekit.SIPTransport_SIP_TRANSPORT_UDP,
	"tcp":  livekit.SIPTransport_SIP_TRANSPORT_TCP,
	"tls":  livekit.SIPTransport_SIP_TRANSPORT_TLS,
}

// sipOutboundTrunkMetadata is stored on trunks the plugin manages. Owner is the
// installation's diagnostic ID, so several Mattermost installations can share a
// LiveKit project without adopting each other's trunks. SpecHash records the
// configuration last applied, including the password, which LiveKit does not
// reliably echo back on list.
type sipOutboundTrunkMetadata struct {
	ManagedBy string `json:"managed_by"`
	Owner     string `json:"owner"`
	SpecHash  string `json:"spec_hash"`
}

type sipOutboundTrunkSpec struct {
	Name         string
	Address      string
	Transport    livekit.SIPTransport
	Numbers      []string
	AuthUsername string
	AuthPassword string
}

// hash is keyed with the LiveKit API secret so the stored value can't be used
// to guess the trunk password by anyone who can only read trunk metadata.
func (s sipOutboundTrunkSpec) hash(key string) string {
	mac := hmac.New(sha256.New, []byte(key))
	_ = json.NewEncoder(mac).Encode(s)
	return hex.EncodeToString(mac.Sum(nil))
}

func (s sipOutboundTrunkSpec) trunkInfo(metadata string) *livekit.SIPOutboundTrunkInfo {
	return &livekit.SIPOutboundTrunkInfo{
		Name:         s.Name,
		Metadata:     metadata,
		Address:      s.Address,
		Transport:    s.Transport,
		Numbers:      s.Numbers,
		AuthUsername: s.AuthUsername,
		AuthPassword: s.AuthPassword,
	}
}

// matches compares the fields LiveKit returns, so edits made outside the plugin
// (e.g. in the LiveKit dashboard) are reverted, and the spec hash, which covers
// the password.
func (s sipOutboundTrunkSpec) matches(trunk *livekit.SIPOutboundTrunkInfo, specHash string) bool {
	md, ok := parseSIPOutboundTrunkMetadata(trunk)
	return ok && md.SpecHash == specHash &&
		trunk.GetName() == s.Name &&
		trunk.GetAddress() == s.Address &&
		trunk.GetTransport() == s.Transport &&
		slices.Equal(trunk.GetNumbers(), s.Numbers) &&
		trunk.GetAuthUsername() == s.AuthUsername
}

func parseSIPOutboundTrunkMetadata(trunk *livekit.SIPOutboundTrunkInfo) (sipOutboundTrunkMetadata, bool) {
	var md sipOutboundTrunkMetadata
	if err := json.Unmarshal([]byte(trunk.GetMetadata()), &md); err != nil {
		return md, false
	}
	return md, md.ManagedBy == sipOutboundTrunkManagedBy
}

// sipOutboundTrunkManaged reports whether the plugin should create and maintain
// the outbound trunk itself rather than use LiveKitSIPOutboundTrunkID.
func (c *configuration) sipOutboundTrunkManaged() bool {
	return c.LiveKitSIPOutboundTrunkAddress != ""
}

func (c *configuration) sipOutboundTrunkNumbers() []string {
	var numbers []string
	for _, entry := range strings.FieldsFunc(c.LiveKitSIPOutboundTrunkNumbers, func(r rune) bool {
		return r == '\n' || r == ',' || r == ';'
	}) {
		if n := normalizePhoneNumber(entry); n != "" && !slices.Contains(numbers, n) {
			numbers = append(numbers, n)
		}
	}
	return numbers
}

func (c *configuration) sipOutboundTrunkSpec() sipOutboundTrunkSpec {
	name := c.LiveKitSIPOutboundTrunkName
	if name == "" {
		name = sipOutboundTrunkDefaultName
	}
	return sipOutboundTrunkSpec{
		Name:         name,
		Address:      c.LiveKitSIPOutboundTrunkAddress,
		Transport:    sipTransportsByName[strings.ToLower(c.LiveKitSIPOutboundTrunkTransport)],
		Numbers:      c.sipOutboundTrunkNumbers(),
		AuthUsername: c.LiveKitSIPOutboundTrunkAuthUsername,
		AuthPassword: c.LiveKitSIPOutboundTrunkAuthPassword,
	}
}

func (c *configuration) validateSIPOutboundTrunk() error {
	if !c.sipOutboundTrunkManaged() {
		return nil
	}
	if c.LiveKitSIPOutboundTrunkID != "" {
		return fmt.Errorf("LiveKitSIPOutboundTrunkID and LiveKitSIPOutboundTrunkAddress are mutually exclusive: set the trunk ID to use an existing trunk, or the trunk address to have the plugin manage one")
	}
	if strings.Contains(c.LiveKitSIPOutboundTrunkAddress, "://") || strings.HasPrefix(strings.ToLower(c.LiveKitSIPOutboundTrunkAddress), "sip:") {
		return fmt.Errorf("LiveKitSIPOutboundTrunkAddress is not valid: should be a host name with an optional port, without a scheme")
	}
	if _, ok := sipTransportsByName[strings.ToLower(c.LiveKitSIPOutboundTrunkTransport)]; !ok {
		return fmt.Errorf("LiveKitSIPOutboundTrunkTransport is not valid: should be one of auto, udp, tcp or tls")
	}
	if len(c.sipOutboundTrunkNumbers()) == 0 {
		return fmt.Errorf("LiveKitSIPOutboundTrunkNumbers is not valid: at least one caller ID number is required")
	}
	return nil
}

type sipOutboundTrunkAPI interface {
	ListSIPOutboundTrunk(ctx context.Context, in *livekit.ListSIPOutboundTrunkRequest) (*livekit.ListSIPOutboundTrunkResponse, error)
	CreateSIPOutboundTrunk(ctx context.Context, in *livekit.CreateSIPOutboundTrunkRequest) (*livekit.SIPOutboundTrunkInfo, error)
	UpdateSIPOutboundTrunk(ctx context.Context, in *livekit.UpdateSIPOutboundTrunkRequest) (*livekit.SIPOutboundTrunkInfo, error)
	DeleteSIPOutboundTrunk(ctx context.Context, trunkID string) error
}

type livekitSIPOutboundTrunkClient struct {
	*lksdk.SIPClient
}

func (c livekitSIPOutboundTrunkClient) DeleteSIPOutboundTrunk(ctx context.Context, trunkID string) error {
	_, err := c.DeleteSIPTrunk(ctx, &livekit.DeleteSIPTrunkRequest{SipTrunkId: trunkID})
	return err
}

// ensureSIPOutboundTrunk converges LiveKit on exactly one trunk owned by this
// installation that matches spec, and returns its ID. It creates the trunk when
// none exists, replaces it in place when it has drifted, and deletes any
// duplicates left behind by an earlier interrupted sync.
func (p *Plugin) ensureSIPOutboundTrunk(ctx context.Context, api sipOutboundTrunkAPI, spec sipOutboundTrunkSpec, owner, specHash string) (string, error) {
	res, err := api.ListSIPOutboundTrunk(ctx, &livekit.ListSIPOutboundTrunkRequest{})
	if err != nil {
		return "", fmt.Errorf("failed to list SIP outbound trunks: %w", err)
	}

	var owned []*livekit.SIPOutboundTrunkInfo
	for _, trunk := range res.GetItems() {
		if md, ok := parseSIPOutboundTrunkMetadata(trunk); ok && md.Owner == owner {
			owned = append(owned, trunk)
		}
	}

	metadata, err := json.Marshal(sipOutboundTrunkMetadata{
		ManagedBy: sipOutboundTrunkManagedBy,
		Owner:     owner,
		SpecHash:  specHash,
	})
	if err != nil {
		return "", fmt.Errorf("failed to marshal SIP outbound trunk metadata: %w", err)
	}
	desired := spec.trunkInfo(string(metadata))

	if len(owned) == 0 {
		created, err := api.CreateSIPOutboundTrunk(ctx, &livekit.CreateSIPOutboundTrunkRequest{Trunk: desired})
		if err != nil {
			return "", fmt.Errorf("failed to create SIP outbound trunk: %w", err)
		}
		p.LogInfo("created SIP outbound trunk", "trunkID", created.GetSipTrunkId(), "name", spec.Name, "address", spec.Address)
		return created.GetSipTrunkId(), nil
	}

	trunk := owned[0]
	for _, duplicate := range owned[1:] {
		if err := api.DeleteSIPOutboundTrunk(ctx, duplicate.GetSipTrunkId()); err != nil {
			p.LogWarn("failed to delete duplicate SIP outbound trunk", "trunkID", duplicate.GetSipTrunkId(), "err", err.Error())
		}
	}

	if spec.matches(trunk, specHash) {
		return trunk.GetSipTrunkId(), nil
	}

	if _, err := api.UpdateSIPOutboundTrunk(ctx, &livekit.UpdateSIPOutboundTrunkRequest{
		SipTrunkId: trunk.GetSipTrunkId(),
		Action:     &livekit.UpdateSIPOutboundTrunkRequest_Replace{Replace: desired},
	}); err != nil {
		return "", fmt.Errorf("failed to update SIP outbound trunk %q: %w", trunk.GetSipTrunkId(), err)
	}
	p.LogInfo("updated SIP outbound trunk", "trunkID", trunk.GetSipTrunkId(), "name", spec.Name, "address", spec.Address)
	return trunk.GetSipTrunkId(), nil
}

// syncSIPOutboundTrunk applies the managed trunk configuration to LiveKit and
// caches the resulting trunk ID. It is a no-op when the cached trunk was built
// from the current configuration. The cluster mutex keeps HA nodes, which all
// receive the same configuration change, from creating a trunk each.
func (p *Plugin) syncSIPOutboundTrunk() (string, error) {
	cfg := p.getConfiguration()

	p.sipOutboundTrunkMut.Lock()
	defer p.sipOutboundTrunkMut.Unlock()

	if !cfg.sipOutboundTrunkManaged() {
		p.sipOutboundTrunkID, p.sipOutboundTrunkSpecHash = "", ""
		return "", nil
	}

	spec := cfg.sipOutboundTrunkSpec()
	specHash := spec.hash(cfg.LiveKitAPISecret)
	if p.sipOutboundTrunkID != "" && p.sipOutboundTrunkSpecHash == specHash {
		return p.sipOutboundTrunkID, nil
	}

	lkURL := cfg.getLiveKitURL()
	if lkURL == "" || cfg.LiveKitAPIKey == "" || cfg.LiveKitAPISecret == "" {
		return "", errLiveKitNotConfigured
	}

	mutex, err := cluster.NewMutex(p.API, p.metrics, sipOutboundTrunkLockKey, cluster.MutexConfig{})
	if err != nil {
		return "", fmt.Errorf("failed to create cluster mutex: %w", err)
	}
	lockCtx, cancelLock := context.WithTimeout(context.Background(), lockTimeout)
	defer cancelLock()
	if err := mutex.Lock(lockCtx); err != nil {
		return "", fmt.Errorf("failed to lock cluster mutex: %w", err)
	}
	defer mutex.Unlock()

	ctx, cancel := context.WithTimeout(context.Background(), sipOutboundTrunkSyncTimeout)
	defer cancel()

	client := livekitSIPOutboundTrunkClient{lksdk.NewSIPClient(lkURL, cfg.LiveKitAPIKey, cfg.LiveKitAPISecret)}
	trunkID, err := p.ensureSIPOutboundTrunk(ctx, client, spec, p.API.GetDiagnosticId(), specHash)
	if err != nil {
		return "", err
	}

	p.sipOutboundTrunkID, p.sipOutboundTrunkSpecHash = trunkID, specHash
	return trunkID, nil
}

// getSIPOutboundTrunkID returns the trunk to dial through: the configured ID
// when an existing trunk is in use, otherwise the managed trunk, syncing it
// first if an earlier background sync has not yet succeeded. An empty ID means
// outbound dialing is not configured.
func (p *Plugin) getSIPOutboundTrunkID() (string, error) {
	cfg := p.getConfiguration()
	if cfg.LiveKitSIPOutboundTrunkID != "" {
		return cfg.LiveKitSIPOutboundTrunkID, nil
	}
	return p.syncSIPOutboundTrunk()
}

func (p *Plugin) syncSIPOutboundTrunkInBackground() {
	go func() {
		if _, err := p.syncSIPOutboundTrunk(); err != nil {
			p.LogError("failed to sync SIP outbound trunk", "err", err.Error())
		}
	}()
}
