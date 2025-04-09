// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"encoding/json"
	"os"
	"reflect"
	"testing"

	pluginMocks "github.com/mattermost/mattermost-plugin-calls/server/mocks/github.com/mattermost/mattermost/server/public/plugin"

	"github.com/mattermost/mattermost/server/public/plugin"
	"github.com/mattermost/rtcd/service/rtc"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
)

func TestFieldNameToEnvKey(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected string
	}{
		{
			name:     "camelCase",
			input:    "camelCase",
			expected: "CAMEL_CASE",
		},
		{
			name:     "PascalCase",
			input:    "PascalCase",
			expected: "PASCAL_CASE",
		},
		{
			name:     "acronyms",
			input:    "RTCDServiceURL",
			expected: "RTCD_SERVICE_URL",
		},
		{
			name:     "numbers",
			input:    "Field123Value",
			expected: "FIELD_123_VALUE",
		},
		{
			name:     "mixed",
			input:    "ICEHostPortOverride",
			expected: "ICE_HOST_PORT_OVERRIDE",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := fieldNameToEnvKey(tt.input)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestApplyEnvOverrides(t *testing.T) {
	// Setup
	mockAPI := &pluginMocks.MockAPI{}
	mockAPI.On("LogError", mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything)

	p := &Plugin{
		MattermostPlugin: plugin.MattermostPlugin{
			API: mockAPI,
		},
	}

	// Save original environment and restore after test
	originalEnv := os.Environ()
	defer func() {
		os.Clearenv()
		for _, e := range originalEnv {
			pair := splitEnvPair(e)
			os.Setenv(pair[0], pair[1])
		}
	}()

	// Clear environment and set test values
	os.Clearenv()
	os.Setenv("MM_CALLS_RTCD_SERVICE_URL", "https://rtcd.example.com")
	os.Setenv("MM_CALLS_JOB_SERVICE_URL", "https://jobs.example.com")
	os.Setenv("MM_CALLS_UDP_SERVER_PORT", "8443")
	os.Setenv("MM_CALLS_TCP_SERVER_PORT", "8444")
	os.Setenv("MM_CALLS_MAX_CALL_PARTICIPANTS", "25")
	os.Setenv("MM_CALLS_ENABLE_RECORDINGS", "true")
	os.Setenv("MM_CALLS_ENABLE_TRANSCRIPTIONS", "true")
	os.Setenv("MM_CALLS_ENABLE_RINGING", "true")

	// Test ICEServersConfigs JSON parsing
	iceServers := []rtc.ICEServerConfig{
		{
			URLs: []string{"stun:stun.example.com:3478"},
		},
		{
			URLs:       []string{"turn:turn.example.com:3478"},
			Username:   "user",
			Credential: "pass",
		},
	}
	iceServersJSON, err := json.Marshal(iceServers)
	require.NoError(t, err)
	os.Setenv("MM_CALLS_ICE_SERVERS_CONFIGS", string(iceServersJSON))

	// Create real config
	cfg := &configuration{}
	cfg.SetDefaults() // Initialize with defaults

	// Apply overrides
	overrides := p.applyEnvOverrides(cfg, "MM_CALLS")

	// Verify results
	assert.Equal(t, "https://rtcd.example.com", cfg.RTCDServiceURL)
	assert.Equal(t, "https://jobs.example.com", cfg.JobServiceURL)
	assert.Equal(t, 8443, *cfg.UDPServerPort)
	assert.Equal(t, 8444, *cfg.TCPServerPort)
	assert.Equal(t, 25, *cfg.MaxCallParticipants)
	assert.Equal(t, true, *cfg.EnableRecordings)
	assert.Equal(t, true, *cfg.EnableTranscriptions)
	assert.Equal(t, true, *cfg.EnableRinging)
	assert.Equal(t, 2, len(cfg.ICEServersConfigs))
	assert.Equal(t, "stun:stun.example.com:3478", cfg.ICEServersConfigs[0].URLs[0])
	assert.Equal(t, "turn:turn.example.com:3478", cfg.ICEServersConfigs[1].URLs[0])
	assert.Equal(t, "user", cfg.ICEServersConfigs[1].Username)
	assert.Equal(t, "pass", cfg.ICEServersConfigs[1].Credential)

	// Verify overrides map
	assert.Equal(t, "https://rtcd.example.com", overrides["RTCDServiceURL"])
	assert.Equal(t, "https://jobs.example.com", overrides["JobServiceURL"])
	assert.Equal(t, "8443", overrides["UDPServerPort"])
	assert.Equal(t, "8444", overrides["TCPServerPort"])
	assert.Equal(t, "25", overrides["MaxCallParticipants"])
	assert.Equal(t, "true", overrides["EnableRecordings"])
	assert.Equal(t, "true", overrides["EnableTranscriptions"])
	assert.Equal(t, "true", overrides["EnableRinging"])
	assert.Equal(t, string(iceServersJSON), overrides["ICEServersConfigs"])
}

func TestSetFieldFromEnv(t *testing.T) {
	// Setup
	mockAPI := &pluginMocks.MockAPI{}
	mockAPI.On("LogError", mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything)

	p := &Plugin{
		MattermostPlugin: plugin.MattermostPlugin{
			API: mockAPI,
		},
	}

	t.Run("invalid values", func(t *testing.T) {
		cfg := &configuration{}
		cfg.SetDefaults() // Initialize with defaults

		// Test invalid bool
		initialEnableRinging := *cfg.EnableRinging
		result := p.setFieldFromEnv(getField(cfg, "EnableRinging"), "not-a-bool")
		assert.False(t, result)
		assert.Equal(t, initialEnableRinging, *cfg.EnableRinging)

		// Test invalid int
		initialUDPPort := *cfg.UDPServerPort
		result = p.setFieldFromEnv(getField(cfg, "UDPServerPort"), "not-an-int")
		assert.False(t, result)
		assert.Equal(t, initialUDPPort, *cfg.UDPServerPort)

		// Test invalid JSON for ICEServersConfigs
		result = p.setFieldFromEnv(getField(cfg, "ICEServersConfigs"), "{invalid-json")
		assert.False(t, result)
	})

	t.Run("pointer fields", func(t *testing.T) {
		cfg := &configuration{}

		// Set EnableRinging to nil to test pointer initialization
		cfg.EnableRinging = nil

		// Test setting nil pointer field
		result := p.setFieldFromEnv(getField(cfg, "EnableRinging"), "true")
		assert.True(t, result)
		require.NotNil(t, cfg.EnableRinging)
		assert.Equal(t, true, *cfg.EnableRinging)

		// Test MaxCallParticipants
		cfg.MaxCallParticipants = nil
		result = p.setFieldFromEnv(getField(cfg, "MaxCallParticipants"), "42")
		assert.True(t, result)
		require.NotNil(t, cfg.MaxCallParticipants)
		assert.Equal(t, 42, *cfg.MaxCallParticipants)
	})
}

// Helper function to get a reflect.Value for a field by name
func getField(obj interface{}, fieldName string) reflect.Value {
	val := reflect.ValueOf(obj)
	if val.Kind() == reflect.Ptr {
		val = val.Elem()
	}
	return val.FieldByName(fieldName)
}

// Helper function to split environment variable pairs
func splitEnvPair(pair string) []string {
	for i := 0; i < len(pair); i++ {
		if pair[i] == '=' {
			return []string{pair[:i], pair[i+1:]}
		}
	}
	return []string{pair, ""}
}
