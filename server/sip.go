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
)

// callTypePhone marks a Call (via Props.Type) as an outbound 1:1 phone call
// hosted on the caller's DM with the Calls bot.
const callTypePhone = "phone"

// sipCallStatusActive is the value of the SIP participant's sip.callStatus
// attribute (livekit.AttrSIPCallStatus) once the call has been answered. Any
// other value (dialing, ringing, …) means the leg has not connected yet.
const sipCallStatusActive = "active"

// Terminal reasons for a phone call. These are server-authoritative, ride the
// call_ended WS event, and are persisted to the call's props as the durable
// phone-call log. The webapp maps these to user-facing copy.
const (
	sipReasonEnded    = "ended"     // normal hangup by either side after the call was answered
	sipReasonCanceled = "canceled"  // local caller hung up before the call was answered
	sipReasonNoAnswer = "no_answer" // no-answer timer fired; never answered
	sipReasonBusy     = "busy"      // SIP 486 / callee rejected
	sipReasonDeclined = "declined"  // SIP 603 / remote reject
	sipReasonFailed   = "failed"    // network / trunk error / other SIP failure; never answered
)

// sipOutboundRingTimeout bounds how long an outbound leg may ring before the
// server cancels it, so an unanswered call never holds a trunk channel.
const sipOutboundRingTimeout = 60 * time.Second

// livekitHTTPURL converts the configured LiveKit WebSocket URL to an HTTP URL
// suitable for Twirp API calls.
func livekitHTTPURL(wsURL string) string {
	u := strings.TrimSpace(wsURL)
	u = strings.Replace(u, "wss://", "https://", 1)
	u = strings.Replace(u, "ws://", "http://", 1)
	return u
}

// sipParticipantIdentity is the LiveKit participant identity used for the SIP
// leg of an outbound phone call. It matches participant.Identity in the
// participant_joined/left webhooks, so it doubles as the CallSession UserID.
func sipParticipantIdentity(phoneNumber string) string {
	return "sip:" + phoneNumber
}

// createSIPParticipant dials an outbound phone number and adds the SIP
// participant to a LiveKit room. It is synchronous only through the dial RPC:
// it returns once LiveKit has created the SIP participant (in "dialing") and
// started the INVITE, not when the call is answered (WaitUntilAnswered=false).
// The returned sipCallID is the handle used to track and hang up the leg.
func (p *Plugin) createSIPParticipant(trunkID, phoneNumber, roomName, displayName string) (string, error) {
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
		return "", fmt.Errorf("failed to create SIP token: %w", err)
	}

	header := http.Header{}
	header.Set("Authorization", "Bearer "+token)
	ctx, err := twirp.WithHTTPRequestHeaders(context.Background(), header)
	if err != nil {
		return "", fmt.Errorf("failed to set twirp headers: %w", err)
	}

	// The no-answer timeout is server-owned (see armSIPNoAnswerTimer), so we
	// don't set RingingTimeout here. WaitUntilAnswered is false so the RPC
	// returns at INVITE time rather than blocking until the callee picks up.
	resp, err := sipClient.CreateSIPParticipant(ctx, &livekit.CreateSIPParticipantRequest{
		SipTrunkId:          trunkID,
		SipCallTo:           phoneNumber,
		RoomName:            roomName,
		ParticipantIdentity: sipParticipantIdentity(phoneNumber),
		ParticipantName:     displayName,
		PlayDialtone:        true,
		WaitUntilAnswered:   false,
	})
	if err != nil {
		return "", fmt.Errorf("failed to create SIP participant: %w", err)
	}

	p.LogDebug("created SIP participant for outbound call",
		"participantID", resp.ParticipantId, "sipCallID", resp.SipCallId, "phoneNumber", phoneNumber, "room", roomName)

	return resp.SipCallId, nil
}

// sipTerminalReason maps a SIP participant's LiveKit DisconnectReason to a
// phone-call terminal reason. LiveKit's DisconnectReason is coarse: it cannot
// distinguish a 486 Busy from a 603 Decline (both surface as USER_REJECTED), so
// we report the more common "busy" for that bucket. reachedActive is only
// consulted for client/server-initiated disconnects, where it separates a
// normal post-answer hangup ("ended") from a pre-answer drop ("canceled").
func sipTerminalReason(dr livekit.DisconnectReason, reachedActive bool) string {
	switch dr {
	case livekit.DisconnectReason_USER_UNAVAILABLE:
		// SIP callee did not respond in time.
		return sipReasonNoAnswer
	case livekit.DisconnectReason_USER_REJECTED:
		// SIP callee rejected the call (busy/decline).
		return sipReasonBusy
	case livekit.DisconnectReason_SIP_TRUNK_FAILURE:
		// SIP protocol failure or unexpected response.
		return sipReasonFailed
	case livekit.DisconnectReason_CLIENT_INITIATED,
		livekit.DisconnectReason_ROOM_DELETED,
		livekit.DisconnectReason_PARTICIPANT_REMOVED:
		// Normal hangup or server-driven teardown.
		if reachedActive {
			return sipReasonEnded
		}
		return sipReasonCanceled
	default:
		if reachedActive {
			return sipReasonEnded
		}
		return sipReasonFailed
	}
}

// armSIPNoAnswerTimer schedules a one-shot check that cancels an unanswered
// outbound leg. LiveKit does not webhook attribute changes, so the server
// detects "answered" with a single GetParticipant pull at the deadline rather
// than polling. Owning this server-side cancels the call even if the caller's
// browser closed mid-ring, so a stuck leg never holds a trunk channel.
func (p *Plugin) armSIPNoAnswerTimer(channelID, sipIdentity string) {
	time.AfterFunc(sipOutboundRingTimeout, func() {
		p.handleSIPNoAnswerTimeout(channelID, sipIdentity)
	})
}

func (p *Plugin) handleSIPNoAnswerTimeout(channelID, sipIdentity string) {
	state, err := p.lockCallReturnState(channelID)
	if err != nil {
		p.LogError("handleSIPNoAnswerTimeout: failed to lock call", "channelID", channelID, "err", err.Error())
		return
	}
	defer p.unlockCall(channelID)

	// The call may already have ended (answered then hung up, failed, or the
	// caller left) before the deadline — nothing to cancel.
	if state == nil || state.Call.EndAt > 0 {
		return
	}

	status, err := p.livekitGetSIPCallStatus(channelID, sipIdentity)
	if err != nil {
		// Can't determine the leg's state; leave the call alone rather than risk
		// tearing down a call that was in fact answered.
		p.LogError("handleSIPNoAnswerTimeout: failed to get SIP call status",
			"channelID", channelID, "identity", sipIdentity, "err", err.Error())
		return
	}
	if status == sipCallStatusActive {
		// Answered in time.
		return
	}

	p.LogInfo("outbound SIP call not answered within timeout, canceling",
		"channelID", channelID, "callID", state.Call.ID, "callStatus", status)

	if err := p.livekitRemoveParticipant(channelID, sipIdentity); err != nil && !errors.Is(err, errLiveKitNotConfigured) {
		p.LogError("handleSIPNoAnswerTimeout: failed to remove SIP participant",
			"channelID", channelID, "identity", sipIdentity, "err", err.Error())
	}

	p.endPhoneCall(state, sipReasonNoAnswer, "sip_no_answer")
}
