// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/mattermost/mattermost-plugin-calls/server/db"

	"github.com/livekit/protocol/auth"
	"github.com/livekit/protocol/livekit"
	"github.com/twitchtv/twirp"
)

// livekitHTTPURL converts the configured LiveKit WebSocket URL to an HTTP URL
// suitable for Twirp API calls.
func livekitHTTPURL(wsURL string) string {
	u := strings.TrimSpace(wsURL)
	u = strings.Replace(u, "wss://", "https://", 1)
	u = strings.Replace(u, "ws://", "http://", 1)
	return u
}

// newSIPAdminToken generates a short-lived LiveKit JWT with SIP admin privileges.
func newSIPAdminToken(apiKey, apiSecret string) (string, error) {
	at := auth.NewAccessToken(apiKey, apiSecret)
	at.SetSIPGrant(&auth.SIPGrant{Admin: true}).
		SetValidFor(30 * time.Second)

	return at.ToJWT()
}

// createPersistentSIPDispatchRule creates a dispatch rule for a guest SIP invite.
// Unlike createSIPDispatchRule (which is tied to call lifecycle), this rule persists
// until the guest link is revoked.
func (p *Plugin) createPersistentSIPDispatchRule(channelID, pin, trunkID string) (string, error) {
	cfg := p.getConfiguration()
	httpURL := livekitHTTPURL(cfg.LiveKitURL)
	sipClient := livekit.NewSIPProtobufClient(httpURL, &http.Client{})

	token, err := newSIPAdminToken(cfg.LiveKitAPIKey, cfg.LiveKitAPISecret)
	if err != nil {
		return "", fmt.Errorf("failed to create SIP admin token: %w", err)
	}

	ctx := context.Background()
	header := http.Header{}
	header.Set("Authorization", "Bearer "+token)
	ctx, err = twirp.WithHTTPRequestHeaders(ctx, header)
	if err != nil {
		return "", fmt.Errorf("failed to set twirp headers: %w", err)
	}

	req := &livekit.CreateSIPDispatchRuleRequest{
		Rule: &livekit.SIPDispatchRule{
			Rule: &livekit.SIPDispatchRule_DispatchRuleDirect{
				DispatchRuleDirect: &livekit.SIPDispatchRuleDirect{
					RoomName: channelID,
					Pin:      pin,
				},
			},
		},
		Name: fmt.Sprintf("calls-guest-%s", channelID),
	}
	if trunkID != "" {
		req.TrunkIds = []string{trunkID}
	}

	resp, err := sipClient.CreateSIPDispatchRule(ctx, req)
	if err != nil {
		return "", fmt.Errorf("failed to create SIP dispatch rule: %w", err)
	}

	p.LogDebug("created persistent SIP dispatch rule",
		"ruleID", resp.SipDispatchRuleId, "channelID", channelID)

	return resp.SipDispatchRuleId, nil
}

// deleteSIPDispatchRuleByID deletes a specific dispatch rule by its ID.
func (p *Plugin) deleteSIPDispatchRuleByID(ruleID string) {
	cfg := p.getConfiguration()
	httpURL := livekitHTTPURL(cfg.LiveKitURL)
	sipClient := livekit.NewSIPProtobufClient(httpURL, &http.Client{})

	token, err := newSIPAdminToken(cfg.LiveKitAPIKey, cfg.LiveKitAPISecret)
	if err != nil {
		p.LogError("failed to create SIP admin token", "err", err.Error())
		return
	}

	ctx := context.Background()
	header := http.Header{}
	header.Set("Authorization", "Bearer "+token)
	ctx, err = twirp.WithHTTPRequestHeaders(ctx, header)
	if err != nil {
		p.LogError("failed to set twirp headers", "err", err.Error())
		return
	}

	_, err = sipClient.DeleteSIPDispatchRule(ctx, &livekit.DeleteSIPDispatchRuleRequest{
		SipDispatchRuleId: ruleID,
	})
	if err != nil {
		p.LogError("failed to delete SIP dispatch rule", "err", err.Error(), "ruleID", ruleID)
		return
	}

	p.LogDebug("deleted SIP dispatch rule", "ruleID", ruleID)
}



// reconcileSIPDispatchRules ensures that all active SIP guest links in the DB
// have corresponding dispatch rules in LiveKit, and removes orphaned rules.
func (p *Plugin) reconcileSIPDispatchRules() {
	cfg := p.getConfiguration()
	if cfg.LiveKitSIPTrunkID == "" {
		return
	}

	links, err := p.store.GetAllActiveSIPGuestLinks(db.GetGuestLinkOpts{})
	if err != nil {
		p.LogError("reconcileSIPDispatchRules: failed to get active SIP links", "err", err.Error())
		return
	}

	if len(links) == 0 {
		p.LogDebug("reconcileSIPDispatchRules: no active SIP guest links")
		return
	}

	httpURL := livekitHTTPURL(cfg.LiveKitURL)
	sipClient := livekit.NewSIPProtobufClient(httpURL, &http.Client{})

	token, err := newSIPAdminToken(cfg.LiveKitAPIKey, cfg.LiveKitAPISecret)
	if err != nil {
		p.LogError("reconcileSIPDispatchRules: failed to create SIP admin token", "err", err.Error())
		return
	}

	ctx := context.Background()
	header := http.Header{}
	header.Set("Authorization", "Bearer "+token)
	ctx, err = twirp.WithHTTPRequestHeaders(ctx, header)
	if err != nil {
		p.LogError("reconcileSIPDispatchRules: failed to set twirp headers", "err", err.Error())
		return
	}

	// Get existing rules from LiveKit.
	rulesResp, err := sipClient.ListSIPDispatchRule(ctx, &livekit.ListSIPDispatchRuleRequest{})
	if err != nil {
		p.LogError("reconcileSIPDispatchRules: failed to list dispatch rules", "err", err.Error())
		return
	}

	existingRules := make(map[string]string) // roomName -> ruleID for calls-guest-* rules
	for _, r := range rulesResp.Items {
		if strings.HasPrefix(r.GetName(), "calls-guest-") {
			if d := r.GetRule().GetDispatchRuleDirect(); d != nil {
				existingRules[d.GetRoomName()] = r.GetSipDispatchRuleId()
			}
		}
	}

	// Re-create missing dispatch rules for active links.
	for _, link := range links {
		if _, exists := existingRules[link.ChannelID]; exists {
			p.LogDebug("reconcileSIPDispatchRules: dispatch rule exists",
				"channelID", link.ChannelID, "linkID", link.ID)
			delete(existingRules, link.ChannelID)
			continue
		}

		trunkID := cfg.LiveKitSIPTrunkID
		if link.TrunkID != nil && *link.TrunkID != "" {
			trunkID = *link.TrunkID
		}

		ruleID, err := p.createPersistentSIPDispatchRule(link.ChannelID, link.Secret, trunkID)
		if err != nil {
			p.LogError("reconcileSIPDispatchRules: failed to re-create dispatch rule",
				"err", err.Error(), "channelID", link.ChannelID, "linkID", link.ID)
			continue
		}
		p.LogDebug("reconcileSIPDispatchRules: re-created dispatch rule",
			"channelID", link.ChannelID, "linkID", link.ID, "ruleID", ruleID)
	}

	// Delete orphaned rules (rules in LiveKit with no matching active link).
	for roomName, ruleID := range existingRules {
		p.LogDebug("reconcileSIPDispatchRules: deleting orphaned dispatch rule",
			"roomName", roomName, "ruleID", ruleID)
		p.deleteSIPDispatchRuleByID(ruleID)
	}

	p.LogDebug("reconcileSIPDispatchRules: completed", "activeLinks", len(links))
}
