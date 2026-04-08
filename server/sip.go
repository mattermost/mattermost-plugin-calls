// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"time"

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

// createSIPDispatchRule creates a direct dispatch rule that routes inbound SIP
// calls to the given room (channelID) with a PIN prompt. It returns the rule ID.
func (p *Plugin) createSIPDispatchRule(channelID string) {
	cfg := p.getConfiguration()
	if cfg.LiveKitSIPPIN == "" {
		return
	}

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

	req := &livekit.CreateSIPDispatchRuleRequest{
		Rule: &livekit.SIPDispatchRule{
			Rule: &livekit.SIPDispatchRule_DispatchRuleDirect{
				DispatchRuleDirect: &livekit.SIPDispatchRuleDirect{
					RoomName: channelID,
					Pin:      cfg.LiveKitSIPPIN,
				},
			},
		},
		Name: fmt.Sprintf("calls-%s", channelID),
	}
	if cfg.LiveKitSIPTrunkID != "" {
		req.TrunkIds = []string{cfg.LiveKitSIPTrunkID}
	}

	resp, err := sipClient.CreateSIPDispatchRule(ctx, req)
	if err != nil {
		p.LogError("failed to create SIP dispatch rule", "err", err.Error(), "channelID", channelID)
		return
	}

	p.LogDebug("created SIP dispatch rule", "ruleID", resp.SipDispatchRuleId, "channelID", channelID)

	p.mut.Lock()
	p.sipDispatchRules[channelID] = resp.SipDispatchRuleId
	p.mut.Unlock()

	p.logSIPDiagnostics(sipClient, ctx)
}

// logSIPDiagnostics lists all inbound trunks and dispatch rules from the LiveKit
// server and logs them for debugging.
func (p *Plugin) logSIPDiagnostics(sipClient livekit.SIP, ctx context.Context) {
	trunksResp, err := sipClient.ListSIPInboundTrunk(ctx, &livekit.ListSIPInboundTrunkRequest{})
	if err != nil {
		p.LogError("SIP diagnostics: failed to list inbound trunks", "err", err.Error())
	} else {
		p.LogDebug("SIP diagnostics: inbound trunks", "count", len(trunksResp.Items))
		for _, t := range trunksResp.Items {
			p.LogDebug("SIP trunk",
				"id", t.GetSipTrunkId(),
				"name", t.GetName(),
				"numbers", fmt.Sprintf("%v", t.GetNumbers()),
				"allowedAddresses", fmt.Sprintf("%v", t.GetAllowedAddresses()),
				"allowedNumbers", fmt.Sprintf("%v", t.GetAllowedNumbers()),
			)
		}
	}

	rulesResp, err := sipClient.ListSIPDispatchRule(ctx, &livekit.ListSIPDispatchRuleRequest{})
	if err != nil {
		p.LogError("SIP diagnostics: failed to list dispatch rules", "err", err.Error())
	} else {
		p.LogDebug("SIP diagnostics: dispatch rules", "count", len(rulesResp.Items))
		for _, r := range rulesResp.Items {
			var roomName, pin string
			if rule := r.GetRule(); rule != nil {
				if d := rule.GetDispatchRuleDirect(); d != nil {
					roomName = d.GetRoomName()
					pin = d.GetPin()
				}
			}
			p.LogDebug("SIP dispatch rule",
				"id", r.GetSipDispatchRuleId(),
				"name", r.GetName(),
				"trunkIds", fmt.Sprintf("%v", r.GetTrunkIds()),
				"roomName", roomName,
				"hasPin", pin != "",
			)
		}
	}
}

// deleteSIPDispatchRule deletes the dispatch rule associated with the given channel.
func (p *Plugin) deleteSIPDispatchRule(channelID string) {
	p.mut.Lock()
	ruleID, ok := p.sipDispatchRules[channelID]
	if ok {
		delete(p.sipDispatchRules, channelID)
	}
	p.mut.Unlock()

	if !ok {
		return
	}

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
		p.LogError("failed to delete SIP dispatch rule", "err", err.Error(), "ruleID", ruleID, "channelID", channelID)
		return
	}

	p.LogDebug("deleted SIP dispatch rule", "ruleID", ruleID, "channelID", channelID)
}
