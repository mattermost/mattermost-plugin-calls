// Copyright (c) 2022-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"github.com/mattermost/mattermost-server/v6/model"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestPortsRangeIsValid(t *testing.T) {
	tcs := []struct {
		name          string
		input         PortsRange
		expectedError string
	}{
		{
			name:          "empty input",
			input:         PortsRange(""),
			expectedError: "invalid empty input",
		},
		{
			name:          "not a range",
			input:         PortsRange("1000"),
			expectedError: "port range is not valid",
		},
		{
			name:          "not a range",
			input:         PortsRange("1000 2000"),
			expectedError: "port range is not valid",
		},
		{
			name:          "not a range",
			input:         PortsRange("1000/2000"),
			expectedError: "port range is not valid",
		},
		{
			name:          "not a range",
			input:         PortsRange("1000-2000-3000"),
			expectedError: "port range is not valid",
		},
		{
			name:          "bad min port",
			input:         PortsRange("0-2000"),
			expectedError: "port range is not valid",
		},
		{
			name:          "bad max port",
			input:         PortsRange("1000-90000"),
			expectedError: "port range is not valid",
		},
		{
			name:          "bad min port",
			input:         PortsRange("1000-500"),
			expectedError: "min port must be less than max port",
		},
		{
			name:  "valid",
			input: PortsRange("10000-11000"),
		},
	}

	for _, tc := range tcs {
		t.Run(tc.name, func(t *testing.T) {
			err := tc.input.IsValid()
			if tc.expectedError == "" {
				require.NoError(t, err)
			} else {
				require.EqualError(t, err, tc.expectedError)
			}
		})
	}
}

func TestGetClientConfig(t *testing.T) {
	cfg := &configuration{}
	cfg.SetDefaults()
	clientCfg := cfg.getClientConfig()

	// defaults
	require.Equal(t, model.NewBool(true), clientCfg.AllowEnableCalls)
	require.Equal(t, cfg.AllowEnableCalls, clientCfg.AllowEnableCalls)
	require.Equal(t, model.NewBool(false), clientCfg.DefaultEnabled)
	require.Equal(t, cfg.DefaultEnabled, clientCfg.DefaultEnabled)

	*cfg.AllowEnableCalls = false
	*cfg.DefaultEnabled = true
	clientCfg = cfg.getClientConfig()
	require.Equal(t, true, *clientCfg.AllowEnableCalls)
	require.Equal(t, cfg.DefaultEnabled, clientCfg.DefaultEnabled)
}
