// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"regexp"
	"slices"
	"strings"
	"time"

	"github.com/mattermost/mattermost-plugin-calls/server/cluster"

	"github.com/livekit/protocol/auth"
	"github.com/livekit/protocol/livekit"
)

const (
	sipTrunkModeExisting = "existing"
	sipTrunkModeManaged  = "managed"

	// sipTrunkName is the fixed name of the trunk the plugin manages. Ownership is
	// decided by the metadata marker, never by the name alone.
	sipTrunkName = "Mattermost Calls"
	// sipTrunkManagedBy is the value of the "managed-by" metadata marker.
	sipTrunkManagedBy = "com.mattermost.calls"

	// sipTrunkReconcileInterval throttles dial-time reconciles so a LiveKit outage
	// isn't hammered by every dial attempt.
	sipTrunkReconcileInterval = 30 * time.Second
	// sipTrunkAPITimeout bounds each LiveKit trunk API request.
	sipTrunkAPITimeout = 5 * time.Second
	// sipTrunkListPageSize is the page size used when listing outbound trunks.
	sipTrunkListPageSize = 100

	sipTrunkStateReady   = "ready"
	sipTrunkStateError   = "error"
	sipTrunkStatePending = "pending"
	sipTrunkStateFound   = "found"
	sipTrunkStateMissing = "not_found"
	sipTrunkStateNone    = "not_configured"
)

// e164Regexp matches an E.164 phone number, the international format carriers
// expect: "+", a non-zero country code digit, up to 15 digits in total.
var e164Regexp = regexp.MustCompile(`^\+[1-9][0-9]{6,14}$`)

const (
	sipTrunkTransportDefault       = "auto"
	sipTrunkMediaEncryptionDefault = "disable"
)

// Short config values for the LiveKit SIP enums. They keep config.json and env
// overrides readable; the UI offers the same set.
var sipTrunkTransports = map[string]livekit.SIPTransport{
	"auto": livekit.SIPTransport_SIP_TRANSPORT_AUTO,
	"udp":  livekit.SIPTransport_SIP_TRANSPORT_UDP,
	"tcp":  livekit.SIPTransport_SIP_TRANSPORT_TCP,
	"tls":  livekit.SIPTransport_SIP_TRANSPORT_TLS,
}

var sipTrunkMediaEncryptions = map[string]livekit.SIPMediaEncryption{
	"disable": livekit.SIPMediaEncryption_SIP_MEDIA_ENCRYPT_DISABLE,
	"allow":   livekit.SIPMediaEncryption_SIP_MEDIA_ENCRYPT_ALLOW,
	"require": livekit.SIPMediaEncryption_SIP_MEDIA_ENCRYPT_REQUIRE,
}

// sipTrunkMetadata is the ownership marker stored in the trunk's metadata.
type sipTrunkMetadata struct {
	ManagedBy string `json:"managed-by"`
	Server    string `json:"server"`
	// Site is the site URL host. A debugging aid only; Server is the key.
	Site string `json:"site,omitempty"`
}

// sipTrunkStatus is the runtime state served to the admin console.
type sipTrunkStatus struct {
	Mode           string `json:"mode"`
	TrunkID        string `json:"trunkID"`
	State          string `json:"state"`
	LastReconciled int64  `json:"lastReconciled,omitempty"` // unix ms
	Error          string `json:"error,omitempty"`
}

func (c *configuration) sipTrunkManaged() bool {
	return c.SIPTrunkMode == sipTrunkModeManaged
}

// validateManagedSIPTrunk checks the managed trunk fields. It only applies while
// outbound dialing is enabled, so a half-filled form can't block unrelated saves.
func (c *configuration) validateManagedSIPTrunk() error {
	if c.EnableSIPOutbound == nil || !*c.EnableSIPOutbound {
		return nil
	}
	if c.SIPTrunkAddress == "" {
		return fmt.Errorf("SIPTrunkAddress is required when Calls manages the SIP trunk")
	}
	if strings.Contains(c.SIPTrunkAddress, "://") || strings.HasPrefix(c.SIPTrunkAddress, "sip:") {
		return fmt.Errorf("SIPTrunkAddress should be a hostname, without a protocol or \"sip:\" prefix")
	}
	number := strings.TrimSpace(c.SIPTrunkNumber)
	if number == "" {
		return fmt.Errorf("SIPTrunkNumber is required when Calls manages the SIP trunk")
	}
	if !e164Regexp.MatchString(number) {
		return fmt.Errorf("SIPTrunkNumber is not valid: %q is not an E.164 number", number)
	}
	if _, ok := sipTrunkTransports[c.SIPTrunkTransport]; !ok {
		return fmt.Errorf("SIPTrunkTransport is not valid: %q is not one of auto, udp, tcp, tls", c.SIPTrunkTransport)
	}
	if _, ok := sipTrunkMediaEncryptions[c.SIPTrunkMediaEncryption]; !ok {
		return fmt.Errorf("SIPTrunkMediaEncryption is not valid: %q is not one of disable, allow, require", c.SIPTrunkMediaEncryption)
	}
	return nil
}

func (p *Plugin) sipTrunkMetadata() sipTrunkMetadata {
	md := sipTrunkMetadata{ManagedBy: sipTrunkManagedBy, Server: p.API.GetTelemetryId()}
	if cfg := p.API.GetConfig(); cfg != nil && cfg.ServiceSettings.SiteURL != nil {
		if u, err := url.Parse(*cfg.ServiceSettings.SiteURL); err == nil {
			md.Site = u.Host
		}
	}
	return md
}

// desiredSIPTrunk builds the trunk definition from config.
func desiredSIPTrunk(cfg *configuration, md sipTrunkMetadata) (*livekit.SIPOutboundTrunkInfo, error) {
	mdJSON, err := json.Marshal(md)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal trunk metadata: %w", err)
	}
	// Fail rather than fall back to the zero value: for media encryption that would
	// silently mean unencrypted.
	transport, ok := sipTrunkTransports[cfg.SIPTrunkTransport]
	if !ok {
		return nil, fmt.Errorf("invalid SIPTrunkTransport %q", cfg.SIPTrunkTransport)
	}
	mediaEncryption, ok := sipTrunkMediaEncryptions[cfg.SIPTrunkMediaEncryption]
	if !ok {
		return nil, fmt.Errorf("invalid SIPTrunkMediaEncryption %q", cfg.SIPTrunkMediaEncryption)
	}
	trunk := &livekit.SIPOutboundTrunkInfo{
		Name:         sipTrunkName,
		Metadata:     string(mdJSON),
		Address:      cfg.SIPTrunkAddress,
		Numbers:      []string{strings.TrimSpace(cfg.SIPTrunkNumber)},
		AuthUsername: cfg.SIPTrunkAuthUsername,
		AuthPassword: cfg.SIPTrunkAuthPassword,
		Transport:    transport,
	}
	setSIPTrunkMediaEncryption(trunk, mediaEncryption)
	return trunk, nil
}

// setSIPTrunkMediaEncryption sets Media.Encryption and also the legacy field, so a
// LiveKit server that predates Media still enforces the requested encryption
// instead of silently ignoring it.
func setSIPTrunkMediaEncryption(t *livekit.SIPOutboundTrunkInfo, enc livekit.SIPMediaEncryption) {
	t.Media = &livekit.SIPMediaConfig{Encryption: &enc}
	t.MediaEncryption = enc //nolint:staticcheck // legacy field, see above
}

// sipTrunkMediaEncryption returns the trunk's effective encryption, preferring
// Media.Encryption and falling back to the legacy field for older trunks.
func sipTrunkMediaEncryption(t *livekit.SIPOutboundTrunkInfo) livekit.SIPMediaEncryption {
	if m := t.GetMedia(); m != nil && m.Encryption != nil {
		return *m.Encryption
	}
	return t.MediaEncryption //nolint:staticcheck // legacy field, see above
}

// sipTrunkDrift returns the names of the fields on which the existing trunk
// differs from the desired one. Names only, never values: authPassword is a field
// name here and must not be logged with its value.
func sipTrunkDrift(existing, desired *livekit.SIPOutboundTrunkInfo) []string {
	a := slices.Clone(existing.Numbers)
	b := slices.Clone(desired.Numbers)
	slices.Sort(a)
	slices.Sort(b)

	var fields []string
	if existing.Address != desired.Address {
		fields = append(fields, "address")
	}
	if !slices.Equal(a, b) {
		fields = append(fields, "numbers")
	}
	if existing.AuthUsername != desired.AuthUsername {
		fields = append(fields, "authUsername")
	}
	if existing.AuthPassword != desired.AuthPassword {
		fields = append(fields, "authPassword")
	}
	if existing.Transport != desired.Transport {
		fields = append(fields, "transport")
	}
	if sipTrunkMediaEncryption(existing) != sipTrunkMediaEncryption(desired) {
		fields = append(fields, "mediaEncryption")
	}
	if existing.Metadata != desired.Metadata {
		fields = append(fields, "metadata")
	}
	return fields
}

// isOwnSIPTrunk reports whether the trunk carries this server's ownership marker.
func isOwnSIPTrunk(t *livekit.SIPOutboundTrunkInfo, serverID string) bool {
	if t.Name != sipTrunkName || t.Metadata == "" {
		return false
	}
	var md sipTrunkMetadata
	if err := json.Unmarshal([]byte(t.Metadata), &md); err != nil {
		return false
	}
	return md.ManagedBy == sipTrunkManagedBy && md.Server == serverID
}

func newSIPClient(cfg *configuration) livekit.SIP {
	return livekit.NewSIPProtobufClient(livekitHTTPURL(cfg.getLiveKitPrivateURL()), &http.Client{})
}

func listSIPOutboundTrunks(ctx context.Context, client livekit.SIP, cfg *configuration) ([]*livekit.SIPOutboundTrunkInfo, error) {
	var all []*livekit.SIPOutboundTrunkInfo
	afterID := ""
	for {
		reqCtx, err := sipRequestContext(ctx, cfg, &auth.SIPGrant{Admin: true}, nil)
		if err != nil {
			return nil, err
		}
		resp, err := client.ListSIPOutboundTrunk(reqCtx, &livekit.ListSIPOutboundTrunkRequest{
			Page: &livekit.Pagination{AfterId: afterID, Limit: sipTrunkListPageSize},
		})
		if err != nil {
			return nil, fmt.Errorf("failed to list SIP outbound trunks: %w", err)
		}
		all = append(all, resp.Items...)
		if len(resp.Items) < sipTrunkListPageSize {
			return all, nil
		}
		afterID = resp.Items[len(resp.Items)-1].SipTrunkId
	}
}

const (
	sipTrunkActionCreated   = "created"
	sipTrunkActionUpdated   = "updated"
	sipTrunkActionUnchanged = "unchanged"
)

// sipTrunkReconcileResult describes what a reconcile did.
type sipTrunkReconcileResult struct {
	TrunkID string
	Action  string
	// Fields lists what drifted on an update (names only, no values).
	Fields []string
}

// reconcileSIPTrunkWithClient creates or updates the managed trunk and reports
// what it did. It never modifies a trunk without our marker.
func reconcileSIPTrunkWithClient(ctx context.Context, client livekit.SIP, cfg *configuration, md sipTrunkMetadata) (sipTrunkReconcileResult, error) {
	desired, err := desiredSIPTrunk(cfg, md)
	if err != nil {
		return sipTrunkReconcileResult{}, err
	}

	trunks, err := listSIPOutboundTrunks(ctx, client, cfg)
	if err != nil {
		return sipTrunkReconcileResult{}, err
	}

	var own *livekit.SIPOutboundTrunkInfo
	nameTaken := false
	for _, t := range trunks {
		if t == nil {
			continue
		}
		if isOwnSIPTrunk(t, md.Server) {
			own = t
			break
		}
		if t.Name == sipTrunkName {
			nameTaken = true
		}
	}

	if own == nil && nameTaken {
		return sipTrunkReconcileResult{}, fmt.Errorf("a trunk named %q already exists on LiveKit but was not created by this Calls deployment; refusing to adopt it", sipTrunkName)
	}

	if own == nil {
		reqCtx, err := sipRequestContext(ctx, cfg, &auth.SIPGrant{Admin: true}, nil)
		if err != nil {
			return sipTrunkReconcileResult{}, err
		}
		created, err := client.CreateSIPOutboundTrunk(reqCtx, &livekit.CreateSIPOutboundTrunkRequest{Trunk: desired})
		if err != nil {
			return sipTrunkReconcileResult{}, fmt.Errorf("failed to create SIP outbound trunk: %w", err)
		}
		return sipTrunkReconcileResult{TrunkID: created.SipTrunkId, Action: sipTrunkActionCreated}, nil
	}

	if drift := sipTrunkDrift(own, desired); len(drift) > 0 {
		reqCtx, err := sipRequestContext(ctx, cfg, &auth.SIPGrant{Admin: true}, nil)
		if err != nil {
			return sipTrunkReconcileResult{}, err
		}
		// Replace keeps the trunk ID, so in-flight calls are unaffected.
		if _, err := client.UpdateSIPOutboundTrunk(reqCtx, &livekit.UpdateSIPOutboundTrunkRequest{
			SipTrunkId: own.SipTrunkId,
			Action:     &livekit.UpdateSIPOutboundTrunkRequest_Replace{Replace: desired},
		}); err != nil {
			return sipTrunkReconcileResult{}, fmt.Errorf("failed to update SIP outbound trunk: %w", err)
		}
		return sipTrunkReconcileResult{TrunkID: own.SipTrunkId, Action: sipTrunkActionUpdated, Fields: drift}, nil
	}

	return sipTrunkReconcileResult{TrunkID: own.SipTrunkId, Action: sipTrunkActionUnchanged}, nil
}

// sipTrunkReconcileWanted reports whether the plugin should be managing a trunk.
// Unlicensed servers never manage one.
func (p *Plugin) sipTrunkReconcileWanted(cfg *configuration) bool {
	return p.licenseChecker.SIPOutboundAllowed() && cfg.sipTrunkManaged() && cfg.EnableSIPOutbound != nil && *cfg.EnableSIPOutbound &&
		cfg.getLiveKitURL() != "" && cfg.LiveKitAPIKey != "" && cfg.LiveKitAPISecret != ""
}

// reconcileSIPTrunk reconciles the managed trunk under a cluster mutex and records
// the result.
func (p *Plugin) reconcileSIPTrunk() error {
	if !p.sipTrunkReconcileWanted(p.getConfiguration()) {
		return nil
	}

	err := p.doReconcileSIPTrunk()

	p.sipTrunkMut.Lock()
	defer p.sipTrunkMut.Unlock()
	p.sipTrunkLastAttempt = time.Now()
	if err != nil {
		p.sipTrunkErr = err.Error()
		return err
	}
	p.sipTrunkErr = ""
	p.sipTrunkLastOK = p.sipTrunkLastAttempt
	return nil
}

func (p *Plugin) doReconcileSIPTrunk() error {
	m, err := cluster.NewMutex(p.API, p.metrics, "sip_trunk_reconcile", cluster.MutexConfig{})
	if err != nil {
		return fmt.Errorf("failed to create cluster mutex: %w", err)
	}
	lockCtx, cancel := context.WithTimeout(context.Background(), lockTimeout)
	defer cancel()
	if err := m.Lock(lockCtx); err != nil {
		return fmt.Errorf("failed to lock cluster mutex: %w", err)
	}
	defer m.Unlock()

	// Read the config under the lock so a reconcile queued by an earlier save
	// can't overwrite the trunk with stale values.
	cfg := p.getConfiguration()
	if !p.sipTrunkReconcileWanted(cfg) {
		return nil
	}

	ctx, cancelAPI := context.WithTimeout(context.Background(), 3*sipTrunkAPITimeout)
	defer cancelAPI()

	res, err := reconcileSIPTrunkWithClient(ctx, newSIPClient(cfg), cfg, p.sipTrunkMetadata())
	if err != nil {
		p.LogError("failed to reconcile SIP trunk", "err", err.Error())
		return err
	}

	p.sipTrunkMut.Lock()
	p.sipTrunkID = res.TrunkID
	p.sipTrunkMut.Unlock()

	switch res.Action {
	case sipTrunkActionCreated:
		p.LogInfo("created SIP outbound trunk", "trunkID", res.TrunkID)
	case sipTrunkActionUpdated:
		p.LogInfo("updated SIP outbound trunk", "trunkID", res.TrunkID, "fields", strings.Join(res.Fields, ","))
	default:
		p.LogDebug("SIP outbound trunk is up to date", "trunkID", res.TrunkID)
	}
	return nil
}

// reconcileSIPTrunkAsync kicks off a reconcile in the background. Errors are
// recorded for the status endpoint; LiveKit being down must not block activation
// or config saves.
func (p *Plugin) reconcileSIPTrunkAsync() {
	if !p.sipTrunkActive.Load() || !p.sipTrunkReconcileWanted(p.getConfiguration()) {
		return
	}
	go func() {
		if err := p.reconcileSIPTrunk(); err != nil {
			p.LogWarn("SIP trunk reconcile failed", "err", err.Error())
		}
	}()
}

// resolveSIPTrunkID returns the trunk to dial with, or "" if none is available.
// In managed mode with nothing resolved it reconciles once (throttled).
func (p *Plugin) resolveSIPTrunkID(cfg *configuration) string {
	if !cfg.sipTrunkManaged() {
		return cfg.LiveKitSIPOutboundTrunkID
	}

	p.sipTrunkMut.Lock()
	id := p.sipTrunkID
	throttled := time.Since(p.sipTrunkLastAttempt) < sipTrunkReconcileInterval
	p.sipTrunkMut.Unlock()

	if id != "" || throttled || !p.sipTrunkReconcileWanted(cfg) {
		return id
	}

	if err := p.reconcileSIPTrunk(); err != nil {
		p.LogWarn("dial-time SIP trunk reconcile failed", "err", err.Error())
		return ""
	}

	p.sipTrunkMut.Lock()
	defer p.sipTrunkMut.Unlock()
	return p.sipTrunkID
}

// invalidateSIPTrunk drops a cached trunk ID that LiveKit no longer knows, so the
// next dial reconciles it.
func (p *Plugin) invalidateSIPTrunk(trunkID string) {
	p.sipTrunkMut.Lock()
	defer p.sipTrunkMut.Unlock()
	if p.sipTrunkID == trunkID {
		p.sipTrunkID = ""
		// Allow an immediate dial-time reconcile.
		p.sipTrunkLastAttempt = time.Time{}
	}
}

// buildSIPTrunkStatus assembles the status served to the admin console.
func (p *Plugin) buildSIPTrunkStatus() sipTrunkStatus {
	cfg := p.getConfiguration()
	status := sipTrunkStatus{Mode: cfg.SIPTrunkMode}

	if !cfg.sipTrunkManaged() {
		status.TrunkID = cfg.LiveKitSIPOutboundTrunkID
		status.State, status.Error = p.checkExistingSIPTrunk(cfg)
		return status
	}

	p.sipTrunkMut.Lock()
	status.TrunkID = p.sipTrunkID
	status.Error = p.sipTrunkErr
	if !p.sipTrunkLastOK.IsZero() {
		status.LastReconciled = p.sipTrunkLastOK.UnixMilli()
	}
	attempted := !p.sipTrunkLastAttempt.IsZero()
	p.sipTrunkMut.Unlock()

	switch {
	case !p.sipTrunkReconcileWanted(cfg):
		status.State = sipTrunkStateNone
	case status.Error != "":
		status.State = sipTrunkStateError
	case status.TrunkID != "":
		status.State = sipTrunkStateReady
	case attempted:
		status.State = sipTrunkStateError
	default:
		status.State = sipTrunkStatePending
	}
	return status
}

// handleGetSIPTrunkStatus serves the current status without changing anything.
func (p *Plugin) handleGetSIPTrunkStatus(w http.ResponseWriter) error {
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(p.buildSIPTrunkStatus()); err != nil {
		return fmt.Errorf("error encoding SIP trunk status: %w", err)
	}
	return nil
}

// checkExistingSIPTrunk verifies a pasted trunk ID exists on the LiveKit server.
func (p *Plugin) checkExistingSIPTrunk(cfg *configuration) (string, string) {
	id := cfg.LiveKitSIPOutboundTrunkID
	if id == "" {
		return sipTrunkStateNone, ""
	}
	if cfg.getLiveKitURL() == "" || cfg.LiveKitAPIKey == "" || cfg.LiveKitAPISecret == "" {
		return sipTrunkStateNone, "LiveKit is not configured"
	}

	ctx, cancel := context.WithTimeout(context.Background(), sipTrunkAPITimeout)
	defer cancel()
	reqCtx, err := sipRequestContext(ctx, cfg, &auth.SIPGrant{Admin: true}, nil)
	if err != nil {
		return sipTrunkStateError, err.Error()
	}
	resp, err := newSIPClient(cfg).ListSIPOutboundTrunk(reqCtx, &livekit.ListSIPOutboundTrunkRequest{TrunkIds: []string{id}})
	if err != nil {
		return sipTrunkStateError, fmt.Errorf("failed to query LiveKit: %w", err).Error()
	}
	for _, t := range resp.Items {
		if t != nil && t.SipTrunkId == id {
			return sipTrunkStateFound, ""
		}
	}
	return sipTrunkStateMissing, errors.New("trunk not found on this LiveKit server").Error()
}
