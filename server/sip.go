// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/livekit/protocol/auth"
	"github.com/livekit/protocol/livekit"
	"github.com/twitchtv/twirp"
	"google.golang.org/protobuf/types/known/durationpb"
)

// callTypePhone marks a call placed through /phone-call in Call.Props.Type.
const callTypePhone = "phone"

// sipCallStatusActive is the sip.callStatus attribute value once the callee has answered.
const sipCallStatusActive = "active"

// phoneDisplayLabelMaxLen caps the user-supplied label on a dialed number.
const phoneDisplayLabelMaxLen = 64

// sipOutboundRingingTimeout cancels an unanswered outbound call so a ringing
// leg doesn't hold a trunk channel indefinitely.
const sipOutboundRingingTimeout = 60 * time.Second

// sipOutboundDialTimeout bounds the CreateSIPParticipant request. We don't set
// WaitUntilAnswered, so LiveKit returns as soon as the SIP leg is created; this
// only guards against an unresponsive LiveKit SIP service.
const sipOutboundDialTimeout = 5 * time.Second

// livekitHTTPURL converts the configured LiveKit WebSocket URL to an HTTP URL
// suitable for Twirp API calls.
func livekitHTTPURL(wsURL string) string {
	u := strings.TrimSpace(wsURL)
	u = strings.Replace(u, "wss://", "https://", 1)
	u = strings.Replace(u, "ws://", "http://", 1)
	return u
}

// sipRequestContext returns ctx carrying a short-lived LiveKit access token with
// the given grants, for use with the SIP twirp client.
func sipRequestContext(ctx context.Context, cfg *configuration, sipGrant *auth.SIPGrant, videoGrant *auth.VideoGrant) (context.Context, error) {
	at := auth.NewAccessToken(cfg.LiveKitAPIKey, cfg.LiveKitAPISecret)
	at.SetSIPGrant(sipGrant).SetValidFor(30 * time.Second)
	if videoGrant != nil {
		at.SetVideoGrant(videoGrant)
	}
	token, err := at.ToJWT()
	if err != nil {
		return nil, fmt.Errorf("failed to create SIP token: %w", err)
	}

	header := http.Header{}
	header.Set("Authorization", "Bearer "+token)
	ctx, err = twirp.WithHTTPRequestHeaders(ctx, header)
	if err != nil {
		return nil, fmt.Errorf("failed to set twirp headers: %w", err)
	}
	return ctx, nil
}

// createSIPParticipant dials an outbound phone number and adds the SIP participant to a LiveKit room.
// If LiveKit no longer knows a managed trunk (deleted out from under us), it
// reconciles once and retries with the recreated trunk.
func (p *Plugin) createSIPParticipant(trunkID, phoneNumber, roomName, displayName string) (*livekit.SIPParticipantInfo, error) {
	cfg := p.getConfiguration()

	resp, err := p.dialSIPParticipant(cfg, trunkID, phoneNumber, roomName, displayName)
	if err == nil || !isSIPTrunkNotFound(err) || !cfg.sipTrunkManaged() {
		return resp, err
	}

	p.invalidateSIPTrunk(trunkID)
	newID := p.resolveSIPTrunkID(cfg)
	if newID == "" || newID == trunkID {
		return nil, err
	}
	p.LogInfo("SIP trunk was missing; retrying dial with reconciled trunk", "oldTrunkID", trunkID, "trunkID", newID)
	return p.dialSIPParticipant(cfg, newID, phoneNumber, roomName, displayName)
}

func isSIPTrunkNotFound(err error) bool {
	var twerr twirp.Error
	return errors.As(err, &twerr) && twerr.Code() == twirp.NotFound
}

func (p *Plugin) dialSIPParticipant(cfg *configuration, trunkID, phoneNumber, roomName, displayName string) (*livekit.SIPParticipantInfo, error) {
	sipClient := livekit.NewSIPProtobufClient(livekitHTTPURL(cfg.getLiveKitPrivateURL()), &http.Client{})

	// CreateSIPParticipant requires both SIP and video admin grants; the video
	// grant also lets LiveKit auto-create the room when it doesn't exist yet.
	timeoutCtx, cancel := context.WithTimeout(context.Background(), sipOutboundDialTimeout)
	defer cancel()
	ctx, err := sipRequestContext(timeoutCtx, cfg, &auth.SIPGrant{Admin: true, Call: true},
		&auth.VideoGrant{RoomAdmin: true, RoomCreate: true})
	if err != nil {
		return nil, err
	}

	resp, err := sipClient.CreateSIPParticipant(ctx, &livekit.CreateSIPParticipantRequest{
		SipTrunkId:          trunkID,
		SipCallTo:           phoneNumber,
		RoomName:            roomName,
		ParticipantIdentity: "sip:" + phoneNumber,
		ParticipantName:     displayName,
		// The browser plays its own ringback until sip.callStatus reaches active.
		PlayDialtone:   false,
		RingingTimeout: durationpb.New(sipOutboundRingingTimeout),
	})
	if err != nil {
		return nil, fmt.Errorf("failed to create SIP participant: %w", err)
	}

	p.LogDebug("created SIP participant for outbound call",
		"participantID", resp.GetParticipantId(), "sipCallID", resp.GetSipCallId(),
		"phoneNumber", phoneNumber, "room", roomName)

	return resp, nil
}
