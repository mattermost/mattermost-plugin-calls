// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestNormalizePhoneNumber(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected string
	}{
		{"empty", "", ""},
		{"plain digits short", "12345", "12345"},
		{"dashes prepends plus", "1-781-307-8753", "+17813078753"},
		{"parens and spaces", "+1 (555) 123-4567", "+15551234567"},
		{"tel prefix", "tel:+17813078753", "+17813078753"},
		{"tel prefix no plus", "tel:17813078753", "+17813078753"},
		{"already e164", "+447911123456", "+447911123456"},
		{"surrounding whitespace", "  +1 555 0000  ", "+15550000"},
		{"plus only first position kept", "1+555", "1555"},
		{"letters stripped", "1-800-FLOWERS", "1800"},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			require.Equal(t, tc.expected, normalizePhoneNumber(tc.input))
		})
	}
}

func TestIsNumberInAllowlist(t *testing.T) {
	tests := []struct {
		name     string
		list     string
		number   string
		expected bool
	}{
		{"empty list blocks all", "", "+17813078753", false},
		{"exact match", "+17813078753", "+17813078753", true},
		{"normalized match formatted entry", "+1 781-307-8753", "+17813078753", true},
		{"newline separator", "+17813078753\n+14155551234", "+14155551234", true},
		{"comma separator", "+17813078753,+14155551234", "+14155551234", true},
		{"semicolon separator", "+17813078753;+14155551234", "+14155551234", true},
		{"mixed separators", "+17813078753,+14155551234\n+12125550100;+19175550199", "+12125550100", true},
		{"not in list", "+17813078753,+14155551234", "+19995550000", false},
		{"whitespace around entries", "  +17813078753 , +14155551234 ", "+14155551234", true},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			cfg := &configuration{SIPOutboundAllowlist: tc.list}
			require.Equal(t, tc.expected, cfg.isNumberInAllowlist(tc.number))
		})
	}
}

func TestLivekitHTTPURL(t *testing.T) {
	require.Equal(t, "https://livekit.example.com", livekitHTTPURL("wss://livekit.example.com"))
	require.Equal(t, "http://localhost:7880", livekitHTTPURL("ws://localhost:7880"))
	require.Equal(t, "https://livekit.example.com", livekitHTTPURL("  wss://livekit.example.com  "))
	require.Equal(t, "https://livekit.example.com", livekitHTTPURL("https://livekit.example.com"))
}
