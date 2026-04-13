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
	"time"

	"github.com/mattermost/mattermost-plugin-calls/server/db"
	"github.com/mattermost/mattermost-plugin-calls/server/public"

	"github.com/mattermost/mattermost/server/public/model"

	"github.com/gorilla/mux"
)

type createGuestLinkRequest struct {
	ChannelID string `json:"channel_id"`
	MaxUses   int    `json:"max_uses"`
	ExpiresIn int64  `json:"expires_in"` // duration in milliseconds from now
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

	link := &public.GuestLink{
		ID:        model.NewId(),
		ChannelID: req.ChannelID,
		Type:      public.GuestLinkTypeURL,
		CreatedBy: userID,
		CreateAt:  now,
		ExpiresAt: expiresAt,
		MaxUses:   req.MaxUses,
		Secret:    secret,
		Props:     public.GuestLinkProps{},
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
