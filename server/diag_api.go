// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"golang.org/x/time/rate"

	"github.com/mattermost/mattermost/server/public/model"

	"github.com/livekit/protocol/auth"
)

// Client half of /call diag. The webapp runs livekit-client's ConnectionCheck
// against a throwaway room with a diag token, then posts its results back so
// the server can merge both halves into one ephemeral post. See MM-71387.

const (
	// diagIdentityPrefix marks diag participants. It deliberately does not
	// follow the userID___sessionID format, so it can never resolve to a call
	// session.
	diagIdentityPrefix = "diag-"
	diagTokenTTL       = 10 * time.Minute

	diagRequestMaxBytes = 32 * 1024
	diagMaxClientChecks = 12
	diagMaxNameLen      = 60
	diagMaxDetailLen    = 300
	diagMaxReasonLen    = 200
)

// diagClientCheck is one result from the invoking user's own browser.
type diagClientCheck struct {
	Name   string     `json:"name"`
	Status diagStatus `json:"status"`
	Detail string     `json:"detail,omitempty"`
}

type diagClientReport struct {
	Checks        []diagClientCheck `json:"checks"`
	SkippedReason string            `json:"skipped_reason,omitempty"`
}

func truncate(s string, n int) string {
	r := []rune(strings.TrimSpace(s))
	if len(r) > n {
		return string(r[:n])
	}
	return string(r)
}

// sanitize bounds what a client can put in the report. The result is only ever
// shown back to the same user, but it is still untrusted input.
func (c *diagClientReport) sanitize() *diagClientReport {
	out := &diagClientReport{SkippedReason: truncate(c.SkippedReason, diagMaxReasonLen)}
	for _, check := range c.Checks {
		if len(out.Checks) == diagMaxClientChecks {
			break
		}
		switch check.Status {
		case diagOK, diagWarn, diagFail, diagSkip, diagInfo:
		default:
			check.Status = diagSkip
		}
		out.Checks = append(out.Checks, diagClientCheck{
			Name:   truncate(check.Name, diagMaxNameLen),
			Status: check.Status,
			Detail: truncate(check.Detail, diagMaxDetailLen),
		})
	}
	return out
}

// getDiagTokenLimiter limits diag token minting per user, on top of the plugin
// API limiter that already covers every route.
func (p *Plugin) getDiagTokenLimiter(userID string) *rate.Limiter {
	key := "diag:" + userID

	p.apiLimitersMut.RLock()
	limiter := p.apiLimiters[key]
	p.apiLimitersMut.RUnlock()
	if limiter == nil {
		limiter = rate.NewLimiter(rate.Every(10*time.Second), 3)
		p.apiLimitersMut.Lock()
		p.apiLimiters[key] = limiter
		p.apiLimitersMut.Unlock()
	}
	return limiter
}

// mintDiagToken returns a token that can only join the given throwaway room.
// It grants join, publish and subscribe and nothing else, and expires quickly.
// No call session is created for it.
func (p *Plugin) mintDiagToken(userID, nonce string) (string, string, error) {
	cfg := p.getConfiguration()
	lkURL := cfg.getLiveKitURL()
	if lkURL == "" || cfg.LiveKitAPIKey == "" || cfg.LiveKitAPISecret == "" {
		return "", "", errLiveKitNotConfigured
	}

	grant := &auth.VideoGrant{
		RoomJoin: true,
		Room:     newSelftestRoomName(nonce),
	}
	grant.SetCanPublish(true)
	grant.SetCanSubscribe(true)
	grant.SetCanPublishData(false)

	token, err := auth.NewAccessToken(cfg.LiveKitAPIKey, cfg.LiveKitAPISecret).
		SetVideoGrant(grant).
		SetIdentity(diagIdentityPrefix + userID).
		SetValidFor(diagTokenTTL).
		ToJWT()
	if err != nil {
		return "", "", fmt.Errorf("failed to generate LiveKit token: %w", err)
	}
	return token, lkURL, nil
}

type diagTokenRequest struct {
	ChannelID string `json:"channel_id"`
	RootID    string `json:"root_id"`
	Force     bool   `json:"force"`
}

type diagTokenResponse struct {
	Token string `json:"token"`
	URL   string `json:"url"`
	// StartedAt is when the server half was started (unix ms). The client
	// sends it back with its results so the report can tell the result belongs
	// to this run, however long the client checks took.
	StartedAt int64 `json:"started_at"`
}

// handleDiagToken mints a diag token for the client half and starts the
// server half in the background, so the two run in parallel.
func (p *Plugin) handleDiagToken(w http.ResponseWriter, r *http.Request) {
	var res httpResponse
	defer p.httpAudit("handleDiagToken", &res, w, r)

	userID := r.Header.Get("Mattermost-User-Id")
	if userID == "" {
		res.Err = "Unauthorized"
		res.Code = http.StatusUnauthorized
		return
	}

	var req diagTokenRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, diagRequestMaxBytes)).Decode(&req); err != nil {
		res.Err = "Invalid request body"
		res.Code = http.StatusBadRequest
		return
	}
	if !model.IsValidId(req.ChannelID) {
		res.Err = "Invalid channel_id"
		res.Code = http.StatusBadRequest
		return
	}

	if err := p.diagGate(userID, req.ChannelID); err != nil {
		res.Err = err.Error()
		res.Code = http.StatusForbidden
		return
	}

	if !p.getDiagTokenLimiter(userID).Allow() {
		res.Err = "too many requests"
		res.Code = http.StatusTooManyRequests
		return
	}

	nonce := model.NewId()
	token, lkURL, err := p.mintDiagToken(userID, nonce)
	if err != nil {
		res.Err = err.Error()
		res.Code = http.StatusServiceUnavailable
		return
	}

	startedAt := time.Now().UnixMilli()
	force := req.Force && p.API.HasPermissionTo(userID, model.PermissionManageSystem)
	go func() {
		if _, _, err := p.getDiagReport(force, 0); err != nil {
			p.LogWarn("diag: background server checks failed", "err", err.Error())
		}
	}()

	p.API.SendEphemeralPost(userID, &model.Post{
		ChannelId: req.ChannelID,
		RootId:    req.RootID,
		Message:   diagRunningMessage(diagClientEstimate),
	})

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(diagTokenResponse{Token: token, URL: lkURL, StartedAt: startedAt}); err != nil {
		p.LogError("failed to encode diag token response", "err", err.Error())
	}
}

type diagReportRequest struct {
	ChannelID string           `json:"channel_id"`
	RootID    string           `json:"root_id"`
	StartedAt int64            `json:"started_at"`
	Client    diagClientReport `json:"client"`
}

// handleDiagReport takes the client half, merges it with the server half and
// sends the result as one ephemeral post. The server half is normally already
// done by now; if the token step failed it runs here.
func (p *Plugin) handleDiagReport(w http.ResponseWriter, r *http.Request) {
	var res httpResponse
	defer p.httpAudit("handleDiagReport", &res, w, r)

	userID := r.Header.Get("Mattermost-User-Id")
	if userID == "" {
		res.Err = "Unauthorized"
		res.Code = http.StatusUnauthorized
		return
	}

	var req diagReportRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, diagRequestMaxBytes)).Decode(&req); err != nil {
		res.Err = "Invalid request body"
		res.Code = http.StatusBadRequest
		return
	}
	if !model.IsValidId(req.ChannelID) {
		res.Err = "Invalid channel_id"
		res.Code = http.StatusBadRequest
		return
	}

	if err := p.diagGate(userID, req.ChannelID); err != nil {
		res.Err = err.Error()
		res.Code = http.StatusForbidden
		return
	}

	go p.sendDiagReport(userID, req.ChannelID, req.RootID, false, req.StartedAt, req.Client.sanitize())

	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write([]byte("{}"))
}
