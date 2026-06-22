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

// createSIPParticipant dials an outbound phone number and adds the SIP participant to a LiveKit room.
func (p *Plugin) createSIPParticipant(trunkID, phoneNumber, roomName, displayName string) error {
	cfg := p.getConfiguration()
	sipClient := livekit.NewSIPProtobufClient(livekitHTTPURL(cfg.LiveKitURL), &http.Client{})

	// CreateSIPParticipant requires both SIP and video admin grants; the video
	// grant also lets LiveKit auto-create the room when it doesn't exist yet.
	at := auth.NewAccessToken(cfg.LiveKitAPIKey, cfg.LiveKitAPISecret)
	at.SetSIPGrant(&auth.SIPGrant{Admin: true, Call: true}).
		SetVideoGrant(&auth.VideoGrant{RoomAdmin: true, RoomCreate: true}).
		SetValidFor(30 * time.Second)
	token, err := at.ToJWT()
	if err != nil {
		return fmt.Errorf("failed to create SIP token: %w", err)
	}

	header := http.Header{}
	header.Set("Authorization", "Bearer "+token)
	ctx, err := twirp.WithHTTPRequestHeaders(context.Background(), header)
	if err != nil {
		return fmt.Errorf("failed to set twirp headers: %w", err)
	}

	resp, err := sipClient.CreateSIPParticipant(ctx, &livekit.CreateSIPParticipantRequest{
		SipTrunkId:          trunkID,
		SipCallTo:           phoneNumber,
		RoomName:            roomName,
		ParticipantIdentity: "sip:" + phoneNumber,
		ParticipantName:     displayName,
		PlayDialtone:        true,
	})
	if err != nil {
		return fmt.Errorf("failed to create SIP participant: %w", err)
	}

	p.LogDebug("created SIP participant for outbound call",
		"participantID", resp.ParticipantId, "phoneNumber", phoneNumber, "room", roomName)

	return nil
}
