// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"syscall"
	"time"

	"github.com/mattermost/mattermost-plugin-calls/server/cluster"
	"github.com/mattermost/mattermost-plugin-calls/server/db"

	"github.com/mattermost/mattermost/server/public/model"

	"github.com/livekit/protocol/livekit"
	"github.com/livekit/protocol/webhook"
	"github.com/twitchtv/twirp"
)

// /call diag runs a set of LiveKit setup and connectivity checks and reports
// the result to the invoking user as an ephemeral post. See MM-71387.
//
// The checks are shared: one run is cached cluster-wide and replayed to
// anyone who runs the command within diagCooldown. Results carry both a
// user-safe and an admin-only detail, and redaction happens only at render
// time so the cached copy is the same for every caller.

const (
	diagCommandTrigger = "diag"
	diagForceArg       = "force"

	diagCooldown     = 60 * time.Second
	diagLockTimeout  = 30 * time.Second
	diagPollInterval = 250 * time.Millisecond

	diagResultKey      = "diag_result"
	diagProbeActiveKey = "diag_probe_active"
	diagBadSigKey      = "diag_webhook_badsig"
	diagWebhookKeyFmt  = "diag_webhook_%s"
	diagKVExpirySecs   = 60

	// selftestRoomPrefix names the throwaway rooms used for the webhook probe.
	// The webhook handler short-circuits on it so the probe never reaches the
	// call lifecycle handlers.
	selftestRoomPrefix = "calls-selftest-"
)

// diagWebhookTimeout is how long the probe waits for the webhook; a var so
// tests can shorten it.
var diagWebhookTimeout = 10 * time.Second

// Rough durations shown to the user while a run is in progress. The client
// half (a media test over UDP and TCP) dominates a full run.
const (
	diagServerEstimate = "10 seconds"
	diagClientEstimate = "30 seconds"
)

func diagRunningMessage(estimate string) string {
	return fmt.Sprintf("Running Calls diagnostics... this usually takes about %s.", estimate)
}

type diagStatus string

const (
	diagOK   diagStatus = "ok"
	diagWarn diagStatus = "warn"
	diagFail diagStatus = "fail"
	diagSkip diagStatus = "skip"
	// diagInfo is for results that are informational rather than pass/fail
	// (e.g. TURN when no TURN server is configured).
	diagInfo diagStatus = "info"
)

const (
	diagCheckCalls   = "Calls enabled"
	diagCheckConfig  = "LiveKit configured"
	diagCheckAPI     = "LiveKit API"
	diagCheckPublic  = "LiveKit public URL"
	diagCheckWebhook = "LiveKit webhook"
	diagCheckSIP     = "SIP outbound"
)

// diagResult is the outcome of a single check. Detail is safe to show any
// user (a category and an action); AdminDetail adds hosts, errors, latency.
type diagResult struct {
	Name        string     `json:"name"`
	Status      diagStatus `json:"status"`
	Detail      string     `json:"detail,omitempty"`
	AdminDetail string     `json:"admin_detail,omitempty"`
}

type diagReport struct {
	At      int64        `json:"at"`
	Results []diagResult `json:"results"`
}

func (r *diagReport) failed() bool {
	for _, res := range r.Results {
		if res.Status == diagFail {
			return true
		}
	}
	return false
}

func newSelftestRoomName(nonce string) string {
	return selftestRoomPrefix + nonce
}

func parseSelftestRoom(room string) (nonce string, ok bool) {
	nonce = strings.TrimPrefix(room, selftestRoomPrefix)
	if nonce == room || nonce == "" {
		return "", false
	}
	return nonce, true
}

// redactURL drops any userinfo from a URL before it is shown to an admin.
func redactURL(raw string) string {
	u, err := url.Parse(raw)
	if err != nil {
		return "<invalid URL>"
	}
	return u.Redacted()
}

// diagErrCategory maps a LiveKit API or HTTP error to a short, user-safe
// category and whether the failure is a credentials problem.
func diagErrCategory(err error) (category string, creds bool) {
	var twerr twirp.Error
	if errors.As(err, &twerr) {
		switch twerr.Code() {
		case twirp.Unauthenticated, twirp.PermissionDenied:
			return "credentials rejected", true
		}
	}

	var dnsErr *net.DNSError
	switch {
	case errors.Is(err, context.DeadlineExceeded):
		return "timed out", false
	case errors.As(err, &dnsErr):
		return "host not found", false
	case errors.Is(err, syscall.ECONNREFUSED):
		return "connection refused", false
	}

	var tlsErr *tls.CertificateVerificationError
	if errors.As(err, &tlsErr) {
		return "TLS certificate error", false
	}
	return "unreachable", false
}

type diagCheck func(ctx context.Context, cfg *configuration) []diagResult

// runDiagChecks runs the server half. Checks after a failed prerequisite are
// skipped rather than reported as spurious failures.
func (p *Plugin) runDiagChecks(ctx context.Context) *diagReport {
	cfg := p.getConfiguration()
	report := &diagReport{At: time.Now().UnixMilli()}

	checks := []diagCheck{
		p.checkCallsEnabled,
		p.checkLiveKitConfig,
		p.checkLiveKitAPI,
		p.checkLiveKitPublicURL,
		p.checkLiveKitWebhook,
		p.checkSIP,
	}

	configured := true
	for _, check := range checks {
		results := check(ctx, cfg)
		report.Results = append(report.Results, results...)
		for _, res := range results {
			if res.Name == diagCheckConfig && res.Status == diagFail {
				configured = false
			}
		}
		if !configured {
			break
		}
	}

	if !configured {
		for _, name := range []string{diagCheckAPI, diagCheckPublic, diagCheckWebhook} {
			report.Results = append(report.Results, diagResult{
				Name: name, Status: diagSkip, Detail: "Skipped: LiveKit is not configured.",
			})
		}
	}

	return report
}

func (p *Plugin) checkCallsEnabled(_ context.Context, cfg *configuration) []diagResult {
	res := diagResult{Name: diagCheckCalls, Status: diagOK}
	switch {
	case cfg.DefaultEnabled != nil && !*cfg.DefaultEnabled:
		res.Status = diagWarn
		res.Detail = "Calls is in test mode: only system admins can start calls unless a channel enables them."
	case !p.licenseChecker.GroupCallsAllowed():
		res.Status = diagWarn
		res.Detail = "Calls is limited to direct messages on this server's license."
	}
	return []diagResult{res}
}

func (p *Plugin) checkLiveKitConfig(_ context.Context, cfg *configuration) []diagResult {
	res := diagResult{Name: diagCheckConfig, Status: diagOK}

	var missing []string
	if cfg.getLiveKitURL() == "" {
		missing = append(missing, "URL")
	}
	if cfg.LiveKitAPIKey == "" {
		missing = append(missing, "API key")
	}
	if cfg.LiveKitAPISecret == "" {
		missing = append(missing, "API secret")
	}
	if len(missing) > 0 {
		res.Status = diagFail
		res.Detail = "LiveKit is not fully configured. Ask your system admin."
		res.AdminDetail = "Missing: " + strings.Join(missing, ", ") + "."
		return []diagResult{res}
	}

	if cfg.getLiveKitPrivateURL() == cfg.getLiveKitURL() {
		res.AdminDetail = "LiveKitPrivateURL is empty; the public URL is used for server-side API calls."
	}
	return []diagResult{res}
}

func (p *Plugin) checkLiveKitAPI(ctx context.Context, cfg *configuration) []diagResult {
	res := diagResult{Name: diagCheckAPI, Status: diagOK}
	privateURL := redactURL(cfg.getLiveKitPrivateURL())

	client, err := p.getLiveKitRoomClient()
	if err != nil {
		res.Status = diagFail
		res.Detail = "LiveKit is not configured. Ask your system admin."
		res.AdminDetail = err.Error()
		return []diagResult{res}
	}

	ctx, cancel := context.WithTimeout(ctx, livekitAPITimeout)
	defer cancel()
	start := time.Now()
	_, err = client.ListRooms(ctx, &livekit.ListRoomsRequest{})
	latency := time.Since(start).Round(time.Millisecond)
	if err != nil {
		category, creds := diagErrCategory(err)
		res.Status = diagFail
		if creds {
			res.Detail = "LiveKit rejected the server's credentials. Ask your system admin."
		} else {
			res.Detail = fmt.Sprintf("The server could not reach LiveKit (%s). Ask your system admin.", category)
		}
		res.AdminDetail = fmt.Sprintf("%s: %s (%s)", privateURL, category, err.Error())
		return []diagResult{res}
	}

	res.AdminDetail = fmt.Sprintf("%s reachable, credentials valid (%s).", privateURL, latency)
	return []diagResult{res}
}

func (p *Plugin) checkLiveKitPublicURL(ctx context.Context, cfg *configuration) []diagResult {
	res := diagResult{Name: diagCheckPublic, Status: diagOK}
	publicURL := redactURL(cfg.getLiveKitURL())

	ctx, cancel := context.WithTimeout(ctx, livekitAPITimeout)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, livekitHTTPURL(cfg.getLiveKitURL()), nil)
	if err != nil {
		res.Status = diagWarn
		res.Detail = "The LiveKit URL is invalid. Ask your system admin."
		res.AdminDetail = fmt.Sprintf("%s: %s", publicURL, err.Error())
		return []diagResult{res}
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		category, _ := diagErrCategory(err)
		// Clients may reach the public URL where the server cannot.
		res.Status = diagWarn
		res.Detail = "The server could not reach the public LiveKit URL. Clients may still be able to."
		res.AdminDetail = fmt.Sprintf("%s: %s (%s)", publicURL, category, err.Error())
		return []diagResult{res}
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		res.Status = diagWarn
		res.Detail = "The public LiveKit URL did not respond as expected. Ask your system admin."
		res.AdminDetail = fmt.Sprintf("GET %s returned %d.", publicURL, resp.StatusCode)
		return []diagResult{res}
	}

	res.AdminDetail = publicURL + " reachable."
	return []diagResult{res}
}

// checkLiveKitWebhook proves the LiveKit -> plugin webhook path. LiveKit emits
// room_started on CreateRoom with no participant needed, so creating a
// throwaway room is enough. The webhook may land on any node, so the handler
// records the nonce in KV and this node polls for it.
func (p *Plugin) checkLiveKitWebhook(ctx context.Context, _ *configuration) []diagResult {
	res := diagResult{Name: diagCheckWebhook}

	client, err := p.getLiveKitRoomClient()
	if err != nil {
		res.Status = diagSkip
		res.Detail = "Skipped: LiveKit is not configured."
		return []diagResult{res}
	}

	nonce := model.NewId()
	room := newSelftestRoomName(nonce)
	probeStart := time.Now()

	// Lets the webhook handler record signature failures, which carry no
	// trustworthy nonce. Only written while a probe is in flight.
	if appErr := p.API.KVSetWithExpiry(diagProbeActiveKey, []byte(nonce), diagKVExpirySecs); appErr != nil {
		p.LogWarn("diag: failed to set probe marker", "err", appErr.Error())
	}

	apiCtx, cancel := context.WithTimeout(ctx, livekitAPITimeout)
	defer cancel()
	if _, err := client.CreateRoom(apiCtx, &livekit.CreateRoomRequest{Name: room, EmptyTimeout: 30}); err != nil {
		category, _ := diagErrCategory(err)
		res.Status = diagFail
		res.Detail = "Could not create the test room, so the webhook was not tested. Ask your system admin."
		res.AdminDetail = fmt.Sprintf("CreateRoom failed (%s): %s", category, err.Error())
		return []diagResult{res}
	}
	// LiveKit's emptyTimeout is the backstop if this fails.
	defer func() {
		delCtx, delCancel := context.WithTimeout(context.Background(), livekitAPITimeout)
		defer delCancel()
		if _, err := client.DeleteRoom(delCtx, &livekit.DeleteRoomRequest{Room: room}); err != nil {
			p.LogWarn("diag: failed to delete selftest room", "room", room, "err", err.Error())
		}
	}()

	deadline := time.NewTimer(diagWebhookTimeout)
	defer deadline.Stop()
	ticker := time.NewTicker(diagPollInterval)
	defer ticker.Stop()

	for {
		if data, err := p.KVGet(fmt.Sprintf(diagWebhookKeyFmt, nonce), true); err == nil && len(data) > 0 {
			res.Status = diagOK
			res.AdminDetail = fmt.Sprintf("Received %s in %s.", string(data), time.Since(probeStart).Round(time.Millisecond))
			return []diagResult{res}
		}

		select {
		case <-ctx.Done():
			res.Status = diagFail
			res.Detail = "The webhook test was interrupted."
			return []diagResult{res}
		case <-deadline.C:
			return []diagResult{p.diagWebhookMissing(res, probeStart)}
		case <-ticker.C:
		}
	}
}

// diagWebhookMissing distinguishes a webhook that failed signature validation
// from one that never arrived.
func (p *Plugin) diagWebhookMissing(res diagResult, probeStart time.Time) diagResult {
	res.Status = diagFail

	if data, err := p.KVGet(diagBadSigKey, true); err == nil && len(data) > 0 {
		var at int64
		if json.Unmarshal(data, &at) == nil && at >= probeStart.UnixMilli() {
			res.Detail = "LiveKit's webhook reached the server but was rejected. Ask your system admin."
			res.AdminDetail = "Webhook received with an invalid signature: the API key/secret in LiveKit's webhook config does not match the plugin's."
			return res
		}
	}

	res.Detail = "LiveKit's webhook did not reach the server. Ask your system admin."
	res.AdminDetail = fmt.Sprintf("No webhook within %s. Check the LiveKit webhook URL (%s/plugins/%s/livekit-webhook), network access and any WAF.",
		diagWebhookTimeout, p.siteURL(), manifest.Id)
	return res
}

func (p *Plugin) siteURL() string {
	if cfg := p.API.GetConfig(); cfg != nil && cfg.ServiceSettings.SiteURL != nil {
		return strings.TrimSuffix(*cfg.ServiceSettings.SiteURL, "/")
	}
	return "<SiteURL>"
}

func (p *Plugin) checkSIP(_ context.Context, cfg *configuration) []diagResult {
	if cfg.EnableSIPOutbound == nil || !*cfg.EnableSIPOutbound {
		return nil
	}

	res := diagResult{Name: diagCheckSIP, Status: diagOK}
	status := p.buildSIPTrunkStatus()

	switch status.State {
	case sipTrunkStateReady, sipTrunkStateFound:
		res.AdminDetail = fmt.Sprintf("Trunk %s (%s).", status.TrunkID, status.State)
	case sipTrunkStateNone:
		// Enabled but never set up: nothing is broken, so don't fail the report.
		res.Status = diagInfo
		res.Detail = "Outbound dialing is enabled but no SIP trunk is set up."
	default:
		res.Status = diagFail
		res.Detail = "Outbound dialing is not working. Ask your system admin."
		res.AdminDetail = fmt.Sprintf("Trunk state %q (ID %q) %s", status.State, status.TrunkID, status.Error)
	}
	return []diagResult{res}
}

// getDiagReport returns a recent cached report, or runs the checks. Concurrent
// callers serialize on a cluster mutex, so a second caller usually finds the
// first caller's fresh result instead of probing again. force (admins only)
// bypasses the cooldown but still takes the lock. notBefore (unix ms, 0 for
// none) accepts any result produced at or after that time regardless of the
// cooldown, and reports it as fresh: the client half of a run can outlast the
// cooldown, and the result it started alongside is still this run's.
func (p *Plugin) getDiagReport(force bool, notBefore int64) (*diagReport, bool, error) {
	m, err := cluster.NewMutex(p.API, p.metrics, "diag", cluster.MutexConfig{})
	if err != nil {
		return nil, false, fmt.Errorf("failed to create cluster mutex: %w", err)
	}
	lockCtx, cancel := context.WithTimeout(context.Background(), diagLockTimeout)
	defer cancel()
	if err := m.Lock(lockCtx); err != nil {
		return nil, false, fmt.Errorf("another diagnostic run is in progress, try again shortly: %w", err)
	}
	defer m.Unlock()

	if !force {
		if data, err := p.KVGet(diagResultKey, true); err == nil && len(data) > 0 {
			var cached diagReport
			if json.Unmarshal(data, &cached) == nil {
				fromThisRun := notBefore > 0 && cached.At >= notBefore
				if fromThisRun || time.Since(time.UnixMilli(cached.At)) < diagCooldown {
					return &cached, !fromThisRun, nil
				}
			}
		}
	}

	runCtx, runCancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer runCancel()
	report := p.runDiagChecks(runCtx)

	if data, err := json.Marshal(report); err == nil {
		p.metrics.IncStoreOp("KVSet")
		if appErr := p.API.KVSet(diagResultKey, data); appErr != nil {
			p.LogWarn("diag: failed to cache result", "err", appErr.Error())
		}
	}
	return report, false, nil
}

var diagStatusIcon = map[diagStatus]string{
	diagOK:   ":white_check_mark:",
	diagWarn: ":warning:",
	diagFail: ":x:",
	diagSkip: ":fast_forward:",
	diagInfo: ":information_source:",
}

var (
	// ICE candidate lines from livekit-client, e.g. "udp 172.16.0.3:7882 host (private)".
	diagCandidateRe = regexp.MustCompile(`(?i)^(udp|tcp|tls)\s+\S+:\d+\b`)
	// Any other IPv4 address, with or without a port.
	diagIPv4Re = regexp.MustCompile(`\b\d{1,3}(\.\d{1,3}){3}(:\d+)?\b`)
	// LiveKit server version, e.g. ", version 1.13.1".
	diagVersionRe = regexp.MustCompile(`(?i),?\s*version\s+v?\d+(?:\.\d+)*(?:[-+]\w+)?`)
)

// redactClientDetail removes server infrastructure details from a client check's
// text before a non-admin sees it. The client checks run in the user's browser
// but report on the server's side of the connection: its candidate addresses
// and version.
func redactClientDetail(detail string) string {
	var kept []string
	for _, part := range strings.Split(detail, "; ") {
		if diagCandidateRe.MatchString(strings.TrimSpace(part)) {
			continue
		}
		part = diagVersionRe.ReplaceAllString(part, "")
		part = diagIPv4Re.ReplaceAllString(part, "[address]")
		kept = append(kept, part)
	}
	return strings.Join(kept, "; ")
}

// renderDiagReport formats the report for the invoking user. Regular users get
// categories and actions only; admins also get the admin detail. Configured
// secrets are scrubbed from admin text as a last line of defence.
func (p *Plugin) renderDiagReport(report *diagReport, client *diagClientReport, userID string, isAdmin, cached bool) string {
	cfg := p.getConfiguration()

	var sb strings.Builder
	sb.WriteString("#### Calls diagnostics\n")
	if cached {
		age := time.Since(time.UnixMilli(report.At)).Round(time.Second)
		fmt.Fprintf(&sb, "_Showing the last result (%s old). Cooldown is %s", age, diagCooldown)
		if isAdmin {
			sb.WriteString("; run `/call diag force` to run again.")
		} else {
			sb.WriteString(".")
		}
		sb.WriteString("_\n")
	}
	sb.WriteString("\n| Check | Notes |\n| :-- | :-- |\n")

	var summary []string
	writeRow := func(status diagStatus, name, detail string) {
		detail = strings.ReplaceAll(strings.TrimSpace(detail), "\n", " ")
		fmt.Fprintf(&sb, "| %s %s | %s |\n", diagStatusIcon[status], name, strings.ReplaceAll(detail, "|", "\\|"))
		line := fmt.Sprintf("%s: %s", name, status)
		if detail != "" {
			line += " - " + detail
		}
		summary = append(summary, line)
	}

	for _, res := range report.Results {
		if res.Name == diagCheckSIP && !isAdmin && !p.isUserInAllowedTeams(userID, cfg.outboundAllowedTeams()) {
			continue
		}

		detail := res.Detail
		if res.Name == diagCheckSIP && !isAdmin {
			// Bare ok/not-ok for regular users.
			detail = ""
			switch res.Status {
			case diagOK:
			case diagInfo:
				detail = "Not set up."
			default:
				detail = "Not working."
			}
		}
		if isAdmin && res.AdminDetail != "" {
			if detail != "" {
				detail += " "
			}
			detail += res.AdminDetail
		}
		writeRow(res.Status, res.Name, detail)
	}

	switch {
	case client == nil:
		sb.WriteString("\n_Client connection checks were skipped: this client does not support them._\n")
		summary = append(summary, "", "Client connection checks skipped: client does not support them")
	case client.SkippedReason != "":
		fmt.Fprintf(&sb, "\n_Client connection checks were skipped: %s_\n", client.SkippedReason)
		summary = append(summary, "", "Client connection checks skipped: "+client.SkippedReason)
	default:
		sb.WriteString("\n**Your connection**\n\n| Check | Notes |\n| :-- | :-- |\n")
		summary = append(summary, "", "Your connection")
		for _, c := range client.Checks {
			detail := c.Detail
			if !isAdmin {
				detail = redactClientDetail(detail)
			}
			writeRow(c.Status, c.Name, detail)
		}
	}

	if report.failed() && !isAdmin {
		sb.WriteString("\nSomething on the server side failed. Ask a system admin to run `/call diag`.\n")
	}

	sb.WriteString("\nSummary for a support request:\n```\n" + strings.Join(summary, "\n") + "\n```\n")

	out := sb.String()
	for _, secret := range []string{cfg.LiveKitAPIKey, cfg.LiveKitAPISecret} {
		if secret != "" {
			out = strings.ReplaceAll(out, secret, "[redacted]")
		}
	}
	return out
}

// diagGate applies the same gate as /call start: the user must be able to post
// in the channel and start or join a call there.
func (p *Plugin) diagGate(userID, channelID string) error {
	if !p.API.HasPermissionToChannel(userID, channelID, model.PermissionCreatePost) {
		return fmt.Errorf("you do not have permission to run diagnostics in this channel")
	}

	channel, appErr := p.API.GetChannel(channelID)
	if appErr != nil {
		return appErr
	}
	callsChannel, err := p.store.GetCallsChannel(channelID, db.GetCallsChannelOpts{})
	if err != nil && !errors.Is(err, db.ErrNotFound) {
		return fmt.Errorf("failed to get channel state: %w", err)
	}
	var enabled *bool
	if callsChannel != nil {
		enabled = model.NewPointer(callsChannel.Enabled)
	}
	return p.userCanStartOrJoin(userID, enabled, channel.Type)
}

// sendDiagReport gets the server half (cached or fresh), merges the client half
// if there is one, and sends the result to the user as an ephemeral post.
func (p *Plugin) sendDiagReport(userID, channelID, rootID string, force bool, notBefore int64, client *diagClientReport) {
	post := &model.Post{ChannelId: channelID, RootId: rootID}

	report, cached, err := p.getDiagReport(force, notBefore)
	if err != nil {
		p.LogError("diag: failed to get report", "err", err.Error())
		post.Message = "Diagnostics failed: " + err.Error()
	} else {
		isAdmin := p.API.HasPermissionTo(userID, model.PermissionManageSystem)
		post.Message = p.renderDiagReport(report, client, userID, isAdmin, cached)
	}
	p.API.SendEphemeralPost(userID, post)
}

func (p *Plugin) handleDiagCommand(args *model.CommandArgs, fields []string) (*model.CommandResponse, error) {
	if err := p.diagGate(args.UserId, args.ChannelId); err != nil {
		return nil, err
	}

	isAdmin := p.API.HasPermissionTo(args.UserId, model.PermissionManageSystem)
	force := isAdmin && len(fields) > 2 && fields[2] == diagForceArg

	// The webhook probe can take ~10s, longer than a command should block, so
	// acknowledge now and post the report when it is ready. Reaching the server
	// means the client did not handle the command (e.g. mobile), so there is no
	// client half.
	go p.sendDiagReport(args.UserId, args.ChannelId, args.RootId, force, 0, nil)

	return &model.CommandResponse{
		ResponseType: model.CommandResponseTypeEphemeral,
		Text:         diagRunningMessage(diagServerEstimate),
	}, nil
}

// recordDiagWebhook handles a verified webhook for a selftest room. It is the
// only thing such events do: they never reach the call lifecycle handlers.
func (p *Plugin) recordDiagWebhook(event *livekit.WebhookEvent) {
	nonce, ok := parseSelftestRoom(event.GetRoom().GetName())
	if !ok {
		return
	}
	// Only the creation event proves delivery; room_finished from our own
	// deferred delete is ignored.
	if event.GetEvent() != webhook.EventRoomStarted {
		return
	}
	if appErr := p.API.KVSetWithExpiry(fmt.Sprintf(diagWebhookKeyFmt, nonce), []byte(event.GetEvent()), diagKVExpirySecs); appErr != nil {
		p.LogError("recordDiagWebhook: failed to record event", "err", appErr.Error())
	}
}

// recordDiagBadSignature notes a rejected webhook while a probe is in flight,
// so the probe can report a key mismatch rather than "not received". The
// payload is unverified, so nothing from it is trusted or stored.
func (p *Plugin) recordDiagBadSignature() {
	active, appErr := p.API.KVGet(diagProbeActiveKey)
	if appErr != nil || len(active) == 0 {
		return
	}
	data, err := json.Marshal(time.Now().UnixMilli())
	if err != nil {
		return
	}
	if appErr := p.API.KVSetWithExpiry(diagBadSigKey, data, diagKVExpirySecs); appErr != nil {
		p.LogWarn("recordDiagBadSignature: failed to record", "err", appErr.Error())
	}
}
