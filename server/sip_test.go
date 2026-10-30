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
		cc       string
		extMax   int
		expected string
		wantErr  bool
	}{
		{name: "bare national gets country code", input: "555-123-4567", cc: "1", expected: "+15551234567"},
		{name: "parenthesized national", input: "(555) 123-4567", cc: "1", expected: "+15551234567"},
		{name: "country code not double-prefixed", input: "1-781-307-8753", cc: "1", expected: "+17813078753"},
		{name: "tel prefix with country code", input: "tel:17813078753", cc: "1", expected: "+17813078753"},
		{name: "already e164 unchanged", input: "+447911123456", cc: "1", expected: "+447911123456"},
		{name: "e164 with formatting", input: "+1 (555) 123-4567", cc: "1", expected: "+15551234567"},
		{name: "e164 unchanged with no country code", input: "tel:+17813078753", cc: "", expected: "+17813078753"},
		{name: "empty country code passes digits through", input: "312-555-0174", cc: "", expected: "3125550174"},
		{name: "extension at boundary", input: "5-1234", cc: "1", extMax: 5, expected: "51234"},
		{name: "extension below boundary", input: "1234", cc: "1", extMax: 5, expected: "1234"},
		{name: "above boundary is not an extension", input: "555-123-4567", cc: "1", extMax: 5, expected: "+15551234567"},
		{name: "7 digits rejected", input: "123-4567", cc: "1", extMax: 5, wantErr: true},
		{name: "9 digits rejected", input: "555123456", cc: "1", extMax: 5, wantErr: true},
		{name: "11 digits not starting with country code rejected", input: "25551234567", cc: "1", wantErr: true},
		{name: "too many digits rejected", input: "+1234567890123456", cc: "1", wantErr: true},
		{name: "too many digits no plus rejected", input: "1234567890123456", cc: "", wantErr: true},
		{name: "empty", input: "", cc: "1", wantErr: true},
		{name: "letters only", input: "call me", cc: "1", wantErr: true},
		{name: "plus only", input: "+", cc: "1", wantErr: true},
		{name: "short digits with no extension config", input: "12345", cc: "", wantErr: true},
		{name: "plus only first position kept", input: "1+5551234567", cc: "1", expected: "+15551234567"},
		{name: "letters stripped", input: "1-800-FLOWERS", cc: "1", wantErr: true},
		{name: "non-NANP country code prepended", input: "07911 123456", cc: "44", expected: "+4407911123456"},
		{name: "non-NANP country code not double-prefixed", input: "44 7911 123456", cc: "44", expected: "+447911123456"},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got, err := normalizePhoneNumber(tc.input, tc.cc, tc.extMax)
			if tc.wantErr {
				require.Error(t, err)
				require.Empty(t, got)
				return
			}
			require.NoError(t, err)
			require.Equal(t, tc.expected, got)
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
		{"multiple newlines", "+17813078753\n+14155551234\n+12125550100", "+12125550100", true},
		{"not in list", "+17813078753\n+14155551234", "+19995550000", false},
		{"whitespace around entries", "  +17813078753 \n +14155551234 ", "+14155551234", true},
		{"name after number", "+14155551234 Alice Smith", "+14155551234", true},
		{"formatted number with name", "+1 415-555-1234 John Doe", "+14155551234", true},
		{"hash marker", "+14155551234 # Bob Jones", "+14155551234", true},
		{"digit-leading name needs hash", "+14155551234 # 3rd floor lobby", "+14155551234", true},
		{"digits in name ignored", "+14155551234 Room 12", "+14155551234", true},
		{"digit-leading name without hash alters number", "+14155551234 3rd floor", "+14155551234", false},
		{"name-only line ignored", "Alice Smith\n# note", "+14155551234", false},
		{"names with multiple lines", "+17813078753 Alice\n+14155551234 Bob", "+14155551234", true},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			cfg := &configuration{SIPOutboundAllowlist: tc.list}
			require.Equal(t, tc.expected, cfg.isNumberInAllowlist(tc.number))
		})
	}
}

func TestIsNumberInAllowlistCountryCode(t *testing.T) {
	cfg := &configuration{SIPOutboundAllowlist: "555-123-4567\nnot a number", SIPTrunkDefaultCountryCode: "1"}
	require.True(t, cfg.isNumberInAllowlist("+15551234567"))
	require.False(t, cfg.isNumberInAllowlist("+5551234567"))
}

func TestLivekitHTTPURL(t *testing.T) {
	require.Equal(t, "https://livekit.example.com", livekitHTTPURL("wss://livekit.example.com"))
	require.Equal(t, "http://localhost:7880", livekitHTTPURL("ws://localhost:7880"))
	require.Equal(t, "https://livekit.example.com", livekitHTTPURL("  wss://livekit.example.com  "))
	require.Equal(t, "https://livekit.example.com", livekitHTTPURL("https://livekit.example.com"))
}

func TestParseAllowlistEntry(t *testing.T) {
	tests := []struct {
		line, number, name string
	}{
		{"+14155551234", "+14155551234", ""},
		{"+1 415-555-1234 John Doe", "+1 415-555-1234", "John Doe"},
		{"+14155551234 # Bob Jones", "+14155551234", "Bob Jones"},
		{"+14155551234 # 3rd floor", "+14155551234", "3rd floor"},
		{"Alice", "", "Alice"},
		{"", "", ""},
	}

	for _, tc := range tests {
		t.Run(tc.line, func(t *testing.T) {
			number, name := parseAllowlistEntry(tc.line)
			require.Equal(t, tc.number, number)
			require.Equal(t, tc.name, name)
		})
	}
}
