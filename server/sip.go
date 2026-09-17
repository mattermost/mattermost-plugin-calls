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
	"google.golang.org/protobuf/types/known/durationpb"
)

// sipOutboundRingingTimeout cancels an unanswered outbound call so a ringing
// leg doesn't hold a trunk channel indefinitely.
const sipOutboundRingingTimeout = 60 * time.Second

// sipOutboundDialTimeout bounds the CreateSIPParticipant request. We don't set
// WaitUntilAnswered, so LiveKit returns as soon as the SIP leg is created; this
// only guards against an unresponsive LiveKit SIP service.
const sipOutboundDialTimeout = 10 * time.Second

// livekitHTTPURL converts the configured LiveKit WebSocket URL to an HTTP URL
// suitable for Twirp API calls.
func livekitHTTPURL(wsURL string) string {
	u := strings.TrimSpace(wsURL)
	u = strings.Replace(u, "wss://", "https://", 1)
	u = strings.Replace(u, "ws://", "http://", 1)
	return u
}

// createSIPParticipant dials an outbound phone number and adds the SIP participant to a LiveKit room.
func (p *Plugin) createSIPParticipant(trunkID, phoneNumber, roomName, displayName string) (*livekit.SIPParticipantInfo, error) {
	cfg := p.getConfiguration()
	// getLiveKitURL (not the raw setting) to match every other server-side
	// LiveKit call, so a MM_CALLS_LIVEKIT_URL override applies here too.
	sipClient := livekit.NewSIPProtobufClient(livekitHTTPURL(cfg.getLiveKitURL()), &http.Client{})

	// CreateSIPParticipant requires both SIP and video admin grants; the video
	// grant also lets LiveKit auto-create the room when it doesn't exist yet.
	at := auth.NewAccessToken(cfg.LiveKitAPIKey, cfg.LiveKitAPISecret)
	at.SetSIPGrant(&auth.SIPGrant{Admin: true, Call: true}).
		SetVideoGrant(&auth.VideoGrant{RoomAdmin: true, RoomCreate: true}).
		SetValidFor(30 * time.Second)
	token, err := at.ToJWT()
	if err != nil {
		return nil, fmt.Errorf("failed to create SIP token: %w", err)
	}

	timeoutCtx, cancel := context.WithTimeout(context.Background(), sipOutboundDialTimeout)
	defer cancel()

	header := http.Header{}
	header.Set("Authorization", "Bearer "+token)
	ctx, err := twirp.WithHTTPRequestHeaders(timeoutCtx, header)
	if err != nil {
		return nil, fmt.Errorf("failed to set twirp headers: %w", err)
	}

	resp, err := sipClient.CreateSIPParticipant(ctx, &livekit.CreateSIPParticipantRequest{
		SipTrunkId:          trunkID,
		SipCallTo:           phoneNumber,
		RoomName:            roomName,
		ParticipantIdentity: "sip:" + phoneNumber,
		ParticipantName:     displayName,
		PlayDialtone:        true,
		RingingTimeout:      durationpb.New(sipOutboundRingingTimeout),
	})
	if err != nil {
		return nil, fmt.Errorf("failed to create SIP participant: %w", err)
	}

	p.LogDebug("created SIP participant for outbound call",
		"participantID", resp.GetParticipantId(), "sipCallID", resp.GetSipCallId(),
		"phoneNumber", phoneNumber, "room", roomName)

	return resp, nil
}
