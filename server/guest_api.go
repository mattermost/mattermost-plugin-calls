// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"golang.org/x/time/rate"

	"github.com/livekit/protocol/auth"

	"github.com/mattermost/mattermost-plugin-calls/server/db"
	"github.com/mattermost/mattermost-plugin-calls/server/public"

	"github.com/mattermost/mattermost/server/public/model"

	"github.com/gorilla/mux"
)

type createGuestLinkRequest struct {
	ChannelID  string `json:"channel_id"`
	MaxUses    int    `json:"max_uses"`
	ExpiresIn  int64  `json:"expires_in"`  // duration in milliseconds from now
	AllowStart *bool  `json:"allow_start"` // whether guests can start a call (default true)
}

type guestLinkResponse struct {
	ID        string `json:"id"`
	ChannelID string `json:"channel_id"`
	Type      string `json:"type"`
	CreatedBy string `json:"created_by"`
	CreateAt  int64  `json:"create_at"`
	ExpiresAt int64  `json:"expires_at"`
	MaxUses   int    `json:"max_uses"`
	UseCount  int    `json:"use_count"`
	URL       string `json:"url,omitempty"`
}

func guestLinkToResponse(link *public.GuestLink, siteURL string) guestLinkResponse {
	resp := guestLinkResponse{
		ID:        link.ID,
		ChannelID: link.ChannelID,
		Type:      link.Type,
		CreatedBy: link.CreatedBy,
		CreateAt:  link.CreateAt,
		ExpiresAt: link.ExpiresAt,
		MaxUses:   link.MaxUses,
		UseCount:  link.UseCount,
	}
	if link.Type == public.GuestLinkTypeURL {
		resp.URL = fmt.Sprintf("%s/plugins/%s/public/standalone/guest.html?token=%s", siteURL, manifest.Id, link.Secret)
	}
	return resp
}

func generateSecret() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("failed to generate secret: %w", err)
	}
	return base64.URLEncoding.WithPadding(base64.NoPadding).EncodeToString(b), nil
}

func (p *Plugin) handleCreateGuestLink(w http.ResponseWriter, r *http.Request) {
	var res httpResponse
	defer p.httpAudit("handleCreateGuestLink", &res, w, r)

	userID := r.Header.Get("Mattermost-User-Id")

	cfg := p.getConfiguration()
	if cfg.GuestAccessEnabled == nil || !*cfg.GuestAccessEnabled {
		res.Err = "guest access is not enabled"
		res.Code = http.StatusForbidden
		return
	}

	var req createGuestLinkRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, requestBodyMaxSizeBytes)).Decode(&req); err != nil {
		res.Err = "invalid request body"
		res.Code = http.StatusBadRequest
		return
	}

	if req.ChannelID == "" {
		res.Err = "missing channel_id"
		res.Code = http.StatusBadRequest
		return
	}

	if !p.API.HasPermissionToChannel(userID, req.ChannelID, model.PermissionCreatePost) {
		res.Err = "Forbidden"
		res.Code = http.StatusForbidden
		return
	}

	secret, err := generateSecret()
	if err != nil {
		res.Err = err.Error()
		res.Code = http.StatusInternalServerError
		return
	}

	now := time.Now().UnixMilli()

	var expiresAt int64
	if req.ExpiresIn > 0 {
		expiresAt = now + req.ExpiresIn
	} else if cfg.GuestLinkDefaultExpiryHours != nil && *cfg.GuestLinkDefaultExpiryHours > 0 {
		expiresAt = now + int64(*cfg.GuestLinkDefaultExpiryHours)*int64(time.Hour/time.Millisecond)
	}

	allowStart := true
	if req.AllowStart != nil {
		allowStart = *req.AllowStart
	}

	link := &public.GuestLink{
		ID:        model.NewId(),
		ChannelID: req.ChannelID,
		Type:      public.GuestLinkTypeURL,
		CreatedBy: userID,
		CreateAt:  now,
		ExpiresAt: expiresAt,
		MaxUses:   req.MaxUses,
		Secret:    secret,
		Props:     public.GuestLinkProps{"allow_start": allowStart},
	}

	if err := p.store.CreateGuestLink(link); err != nil {
		res.Err = fmt.Errorf("failed to create guest link: %w", err).Error()
		res.Code = http.StatusInternalServerError
		return
	}

	siteURL := p.API.GetConfig().ServiceSettings.SiteURL
	if siteURL == nil {
		siteURL = model.NewPointer("")
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	if err := json.NewEncoder(w).Encode(guestLinkToResponse(link, *siteURL)); err != nil {
		p.LogError(err.Error())
	}
}

func (p *Plugin) handleGetGuestLinks(w http.ResponseWriter, r *http.Request) {
	var res httpResponse
	defer p.httpAudit("handleGetGuestLinks", &res, w, r)

	userID := r.Header.Get("Mattermost-User-Id")
	channelID := mux.Vars(r)["channel_id"]

	cfg := p.getConfiguration()
	if cfg.GuestAccessEnabled == nil || !*cfg.GuestAccessEnabled {
		res.Err = "guest access is not enabled"
		res.Code = http.StatusForbidden
		return
	}

	if !p.API.HasPermissionToChannel(userID, channelID, model.PermissionReadChannel) {
		res.Err = "Forbidden"
		res.Code = http.StatusForbidden
		return
	}

	links, err := p.store.GetActiveGuestLinksByChannel(channelID, db.GetGuestLinkOpts{})
	if err != nil {
		res.Err = fmt.Errorf("failed to get guest links: %w", err).Error()
		res.Code = http.StatusInternalServerError
		return
	}

	siteURL := p.API.GetConfig().ServiceSettings.SiteURL
	if siteURL == nil {
		siteURL = model.NewPointer("")
	}

	resp := make([]guestLinkResponse, 0, len(links))
	for _, link := range links {
		resp = append(resp, guestLinkToResponse(link, *siteURL))
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(resp); err != nil {
		p.LogError(err.Error())
	}
}

func (p *Plugin) handleRevokeGuestLink(w http.ResponseWriter, r *http.Request) {
	var res httpResponse
	defer p.httpAudit("handleRevokeGuestLink", &res, w, r)

	userID := r.Header.Get("Mattermost-User-Id")
	linkID := mux.Vars(r)["link_id"]

	cfg := p.getConfiguration()
	if cfg.GuestAccessEnabled == nil || !*cfg.GuestAccessEnabled {
		res.Err = "guest access is not enabled"
		res.Code = http.StatusForbidden
		return
	}

	link, err := p.store.GetGuestLink(linkID, db.GetGuestLinkOpts{})
	if err != nil {
		if errors.Is(err, db.ErrNotFound) {
			res.Err = "guest link not found"
			res.Code = http.StatusNotFound
			return
		}
		res.Err = fmt.Errorf("failed to get guest link: %w", err).Error()
		res.Code = http.StatusInternalServerError
		return
	}

	// Allow the creator or system admin to revoke.
	if link.CreatedBy != userID {
		if !p.API.HasPermissionTo(userID, model.PermissionManageSystem) {
			res.Err = "no permission to revoke this link"
			res.Code = http.StatusForbidden
			return
		}
	}

	if err := p.store.DeleteGuestLink(linkID); err != nil {
		res.Err = fmt.Errorf("failed to revoke guest link: %w", err).Error()
		res.Code = http.StatusInternalServerError
		return
	}

	res.Code = http.StatusOK
	res.Msg = "guest link revoked"
}

type guestJoinRequest struct {
	Secret      string `json:"secret"`
	DisplayName string `json:"display_name"`
}

type guestJoinResponse struct {
	LiveKitToken string `json:"livekit_token"`
	LiveKitURL   string `json:"livekit_url"`
	CallTitle    string `json:"call_title"`
	SessionID    string `json:"session_id"`
}

func (p *Plugin) checkGuestRateLimit(ip string) error {
	p.guestAPILimitersMut.RLock()
	limiter := p.guestAPILimiters[ip]
	p.guestAPILimitersMut.RUnlock()
	if limiter == nil {
		// 5 requests per minute, burst of 5.
		limiter = rate.NewLimiter(rate.Every(12*time.Second), 5)
		p.guestAPILimitersMut.Lock()
		p.guestAPILimiters[ip] = limiter
		p.guestAPILimitersMut.Unlock()
	}

	if !limiter.Allow() {
		return fmt.Errorf("too many requests")
	}

	return nil
}

func clientIP(r *http.Request) string {
	// Check X-Forwarded-For first (set by reverse proxies).
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		if ip, _, ok := strings.Cut(xff, ","); ok {
			return strings.TrimSpace(ip)
		}
		return strings.TrimSpace(xff)
	}
	// Fall back to RemoteAddr.
	if ip, _, ok := strings.Cut(r.RemoteAddr, ":"); ok {
		return ip
	}
	return r.RemoteAddr
}

func (p *Plugin) handleGuestJoin(w http.ResponseWriter, r *http.Request) {
	var res httpResponse
	defer p.httpAudit("handleGuestJoin", &res, w, r)

	cfg := p.getConfiguration()
	if cfg.GuestAccessEnabled == nil || !*cfg.GuestAccessEnabled {
		res.Err = "guest access is not enabled"
		res.Code = http.StatusForbidden
		return
	}

	ip := clientIP(r)
	if err := p.checkGuestRateLimit(ip); err != nil {
		res.Err = err.Error()
		res.Code = http.StatusTooManyRequests
		return
	}

	var req guestJoinRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, requestBodyMaxSizeBytes)).Decode(&req); err != nil {
		res.Err = "invalid request body"
		res.Code = http.StatusBadRequest
		return
	}

	if req.Secret == "" {
		res.Err = "missing secret"
		res.Code = http.StatusBadRequest
		return
	}

	if req.DisplayName == "" {
		res.Err = "missing display_name"
		res.Code = http.StatusBadRequest
		return
	}

	// Look up link by secret, using writer for consistency after increment.
	link, err := p.store.GetGuestLinkBySecret(req.Secret, db.GetGuestLinkOpts{FromWriter: true})
	if err != nil {
		if errors.Is(err, db.ErrNotFound) {
			res.Err = "invalid or expired link"
			res.Code = http.StatusNotFound
			return
		}
		res.Err = "failed to validate link"
		res.Code = http.StatusInternalServerError
		p.LogError("handleGuestJoin: failed to get link by secret", "err", err.Error())
		return
	}

	now := time.Now().UnixMilli()

	// Validate link state.
	if link.IsRevoked() {
		res.Err = "this link has been revoked"
		res.Code = http.StatusGone
		return
	}
	if link.IsExpired(now) {
		res.Err = "this link has expired"
		res.Code = http.StatusGone
		return
	}
	if link.IsExhausted() {
		res.Err = "this link has reached its usage limit"
		res.Code = http.StatusGone
		return
	}

	// Check if call is active; if not, optionally start one.
	active, err := p.store.GetCallActive(link.ChannelID, db.GetCallOpts{FromWriter: true})
	if err != nil {
		res.Err = "failed to check call status"
		res.Code = http.StatusInternalServerError
		p.LogError("handleGuestJoin: failed to check call active", "err", err.Error())
		return
	}
	if !active {
		if !link.GetAllowStart() {
			res.Err = "no active call in this channel"
			res.Code = http.StatusConflict
			return
		}

		if err := p.startCallFromGuest(link.ChannelID, req.DisplayName); err != nil {
			res.Err = "failed to start call"
			res.Code = http.StatusInternalServerError
			p.LogError("handleGuestJoin: failed to start call from guest", "err", err.Error())
			return
		}
	}

	// Atomically increment use count.
	if err := p.store.IncrementGuestLinkUseCount(link.ID); err != nil {
		res.Err = "failed to process link"
		res.Code = http.StatusInternalServerError
		p.LogError("handleGuestJoin: failed to increment use count", "err", err.Error())
		return
	}

	// Create guest session.
	sessionID := model.NewId()
	guestSession := &public.GuestSession{
		ID:          sessionID,
		LinkID:      link.ID,
		Type:        link.Type,
		ChannelID:   link.ChannelID,
		DisplayName: req.DisplayName,
		CreateAt:    now,
		IPAddress:   ip,
		Props:       public.GuestSessionProps{},
	}

	if err := p.store.CreateGuestSession(guestSession); err != nil {
		res.Err = "failed to create session"
		res.Code = http.StatusInternalServerError
		p.LogError("handleGuestJoin: failed to create guest session", "err", err.Error())
		return
	}

	// Generate scoped LiveKit token.
	ttlHours := 4
	if cfg.LiveKitGuestTokenTTLHours != nil && *cfg.LiveKitGuestTokenTTLHours > 0 {
		ttlHours = *cfg.LiveKitGuestTokenTTLHours
	}

	at := auth.NewAccessToken(cfg.LiveKitAPIKey, cfg.LiveKitAPISecret)
	grant := &auth.VideoGrant{
		RoomJoin: true,
		Room:     link.ChannelID,
	}
	at.SetVideoGrant(grant).
		SetIdentity("guest:" + sessionID).
		SetName(req.DisplayName).
		SetValidFor(time.Duration(ttlHours) * time.Hour)

	token, err := at.ToJWT()
	if err != nil {
		res.Err = "failed to generate token"
		res.Code = http.StatusInternalServerError
		p.LogError("handleGuestJoin: failed to generate LiveKit token", "err", err.Error())
		return
	}

	// Get call title if available.
	var callTitle string
	channel, appErr := p.API.GetChannel(link.ChannelID)
	if appErr == nil {
		callTitle = channel.DisplayName
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(guestJoinResponse{
		LiveKitToken: token,
		LiveKitURL:   cfg.LiveKitURL,
		CallTitle:    callTitle,
		SessionID:    sessionID,
	}); err != nil {
		p.LogError(err.Error())
	}
}

// startCallFromGuest creates a new call in the channel initiated by a guest.
// The call is owned by the bot user since guests don't have Mattermost accounts.
func (p *Plugin) startCallFromGuest(channelID, guestDisplayName string) error {
	now := time.Now().UnixMilli()

	state := &callState{
		Call: public.Call{
			ID:        model.NewId(),
			CreateAt:  now,
			StartAt:   now,
			OwnerID:   p.getBotID(),
			ChannelID: channelID,
			Props: public.CallProps{
				NodeID: p.nodeID,
			},
		},
		sessions: map[string]*public.CallSession{},
	}

	if err := p.store.CreateCall(&state.Call); err != nil {
		return fmt.Errorf("failed to create call: %w", err)
	}

	postID, threadID, err := p.createCallStartedPost(state, p.getBotID(), channelID, "", "")
	if err != nil {
		p.LogError("startCallFromGuest: failed to create call started post", "err", err.Error())
	} else {
		state.Call.PostID = postID
		state.Call.ThreadID = threadID
		if err := p.store.UpdateCall(&state.Call); err != nil {
			p.LogError("startCallFromGuest: failed to update call", "err", err.Error())
		}
	}

	p.publishWebSocketEvent(wsEventCallStart, map[string]interface{}{
		"id":        state.Call.ID,
		"channelID": channelID,
		"start_at":  state.Call.StartAt,
		"thread_id": state.Call.ThreadID,
		"post_id":   state.Call.PostID,
		"owner_id":  state.Call.OwnerID,
		"host_id":   state.Call.GetHostID(),
	}, &WebSocketBroadcast{ChannelID: channelID, ReliableClusterSend: true})

	p.LogDebug("call started by guest", "channelID", channelID, "guestName", guestDisplayName)

	return nil
}
