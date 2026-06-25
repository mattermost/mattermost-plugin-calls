// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"testing"

	"github.com/livekit/protocol/livekit"
	"github.com/stretchr/testify/require"
)

func TestNormalizePhoneNumber(t *testing.T) {
	tests := []struct {
		name      string
		input     string
		expected  string
		expectErr bool
	}{
		{name: "empty", input: "", expected: ""},
		{name: "plain digits short", input: "12345", expected: "12345"},
		{name: "dashes prepends plus", input: "1-781-307-8753", expected: "+17813078753"},
		{name: "parens and spaces", input: "+1 (555) 123-4567", expected: "+15551234567"},
		{name: "tel prefix", input: "tel:+17813078753", expected: "+17813078753"},
		{name: "tel prefix no plus", input: "tel:17813078753", expected: "+17813078753"},
		{name: "already e164", input: "+447911123456", expected: "+447911123456"},
		{name: "surrounding whitespace", input: "  +1 555 0000  ", expected: "+15550000"},
		{name: "plus only first position kept", input: "1+555", expected: "1555"},
		// Vanity numbers are rejected, not silently mangled into a wrong number.
		{name: "vanity letters rejected", input: "1-800-FLOWERS", expectErr: true},
		{name: "vanity get-help rejected", input: "1-800-GET-HELP", expectErr: true},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got, err := normalizePhoneNumber(tc.input)
			if tc.expectErr {
				require.Error(t, err)
				return
			}
			require.NoError(t, err)
			require.Equal(t, tc.expected, got)
		})
	}
}

func TestSIPTerminalReason(t *testing.T) {
	tests := []struct {
		name          string
		dr            livekit.DisconnectReason
		reachedActive bool
		expected      string
	}{
		{"no answer", livekit.DisconnectReason_USER_UNAVAILABLE, false, sipReasonNoAnswer},
		{"busy/reject", livekit.DisconnectReason_USER_REJECTED, false, sipReasonBusy},
		{"trunk failure", livekit.DisconnectReason_SIP_TRUNK_FAILURE, false, sipReasonFailed},
		{"client hangup after answer", livekit.DisconnectReason_CLIENT_INITIATED, true, sipReasonEnded},
		{"client hangup before answer", livekit.DisconnectReason_CLIENT_INITIATED, false, sipReasonCanceled},
		{"room deleted after answer", livekit.DisconnectReason_ROOM_DELETED, true, sipReasonEnded},
		{"removed before answer", livekit.DisconnectReason_PARTICIPANT_REMOVED, false, sipReasonCanceled},
		{"unknown after answer", livekit.DisconnectReason_UNKNOWN_REASON, true, sipReasonEnded},
		{"unknown before answer", livekit.DisconnectReason_UNKNOWN_REASON, false, sipReasonFailed},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			require.Equal(t, tc.expected, sipTerminalReason(tc.dr, tc.reachedActive))
		})
	}
}

func TestSIPParticipantIdentity(t *testing.T) {
	require.Equal(t, "sip:+17813078753", sipParticipantIdentity("+17813078753"))
}

func TestLivekitHTTPURL(t *testing.T) {
	require.Equal(t, "https://livekit.example.com", livekitHTTPURL("wss://livekit.example.com"))
	require.Equal(t, "http://localhost:7880", livekitHTTPURL("ws://localhost:7880"))
	require.Equal(t, "https://livekit.example.com", livekitHTTPURL("  wss://livekit.example.com  "))
	require.Equal(t, "https://livekit.example.com", livekitHTTPURL("https://livekit.example.com"))
}
