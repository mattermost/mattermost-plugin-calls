// Copyright (c) 2022-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"testing"

	transcriber "github.com/mattermost/calls-transcriber/cmd/transcriber/config"
	"github.com/mattermost/mattermost-plugin-calls/server/enterprise"
	pluginMocks "github.com/mattermost/mattermost-plugin-calls/server/mocks/github.com/mattermost/mattermost/server/public/plugin"
	"github.com/mattermost/mattermost/server/public/plugin"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/stretchr/testify/require"
)

func TestConfigurationIsValid(t *testing.T) {
	var defaultConfig configuration
	defaultConfig.SetDefaults()

	tcs := []struct {
		name  string
		input configuration
		err   string
	}{
		{
			name:  "empty",
			input: configuration{},
			err:   "UDPServerPort should not be nil",
		},
		{
			name: "invalid UDPServerAddress",
			input: func() configuration {
				var cfg configuration
				cfg.SetDefaults()
				cfg.UDPServerAddress = "invalid"
				return cfg
			}(),
			err: "UDPServerAddress parsing failed",
		},
		{
			name: "missing UDPServerPort",
			input: func() configuration {
				var cfg configuration
				cfg.SetDefaults()
				cfg.UDPServerPort = nil
				return cfg
			}(),
			err: "UDPServerPort should not be nil",
		},
		{
			name: "UDPServerPort not in range",
			input: func() configuration {
				var cfg configuration
				cfg.SetDefaults()
				cfg.UDPServerPort = model.NewInt(45)
				return cfg
			}(),
			err: "UDPServerPort is not valid: 45 is not in allowed range [80, 49151]",
		},
		{
			name: "udp port in range",
			input: func() configuration {
				var cfg configuration
				cfg.SetDefaults()
				cfg.UDPServerPort = model.NewInt(443)
				return cfg
			}(),
		},
		{
			name: "invalid MaxCallParticipants",
			input: func() configuration {
				var cfg configuration
				cfg.SetDefaults()
				cfg.MaxCallParticipants = model.NewInt(-1)
				return cfg
			}(),
			err: "MaxCallParticipants is not valid",
		},
		{
			name: "invalid TURNCredentialsExpirationMinutes",
			input: func() configuration {
				var cfg configuration
				cfg.SetDefaults()
				cfg.TURNCredentialsExpirationMinutes = model.NewInt(-1)
				return cfg
			}(),
			err: "TURNCredentialsExpirationMinutes is not valid",
		},
		{
			name: "MaxRecordingDuration not in range",
			input: func() configuration {
				var cfg configuration
				cfg.SetDefaults()
				cfg.MaxRecordingDuration = model.NewInt(1)
				return cfg
			}(),
			err: "MaxRecordingDuration is not valid: range should be [15, 180]",
		},
		{
			name: "invalid RecordingQuality",
			input: func() configuration {
				var cfg configuration
				cfg.SetDefaults()
				cfg.RecordingQuality = "invalid"
				return cfg
			}(),
			err: "RecordingQuality is not valid",
		},
		{
			name: "invalid ICEHostPortOverride",
			input: func() configuration {
				var cfg configuration
				cfg.SetDefaults()
				cfg.ICEHostPortOverride = model.NewInt(45)
				return cfg
			}(),
			err: "ICEHostPortOverride is not valid: 45 is not in allowed range [80, 49151]",
		},
		{
			name: "invalid LiveCaptionsModelSize",
			input: func() configuration {
				var cfg configuration
				cfg.SetDefaults()
				cfg.EnableRecordings = model.NewBool(true)
				cfg.EnableTranscriptions = model.NewBool(true)
				cfg.EnableLiveCaptions = model.NewBool(true)
				cfg.LiveCaptionsModelSize = ""
				return cfg
			}(),
			err: "LiveCaptionsModelSize is not valid",
		},
		{
			name: "invalid LiveCaptionsNumTranscribers",
			input: func() configuration {
				var cfg configuration
				cfg.SetDefaults()
				cfg.EnableRecordings = model.NewBool(true)
				cfg.EnableTranscriptions = model.NewBool(true)
				cfg.EnableLiveCaptions = model.NewBool(true)
				cfg.LiveCaptionsNumTranscribers = model.NewInt(0)
				return cfg
			}(),
			err: "LiveCaptionsNumTranscribers is not valid: should be greater than 0",
		},
		{
			name: "invalid LiveCaptionsNumThreadsPerTranscriber",
			input: func() configuration {
				var cfg configuration
				cfg.SetDefaults()
				cfg.EnableRecordings = model.NewBool(true)
				cfg.EnableTranscriptions = model.NewBool(true)
				cfg.EnableLiveCaptions = model.NewBool(true)
				cfg.LiveCaptionsNumThreadsPerTranscriber = model.NewInt(0)
				return cfg
			}(),
			err: "LiveCaptionsNumThreadsPerTranscriber is not valid: should be greater than 0",
		},
		{
			name: "blank LiveCaptionsLanguage is valid",
			input: func() configuration {
				var cfg configuration
				cfg.SetDefaults()
				cfg.EnableRecordings = model.NewBool(true)
				cfg.EnableTranscriptions = model.NewBool(true)
				cfg.EnableLiveCaptions = model.NewBool(true)
				cfg.LiveCaptionsLanguage = ""
				return cfg
			}(),
		},
		{
			name: "invalid LiveCaptionsLanguage",
			input: func() configuration {
				var cfg configuration
				cfg.SetDefaults()
				cfg.EnableRecordings = model.NewBool(true)
				cfg.EnableTranscriptions = model.NewBool(true)
				cfg.EnableLiveCaptions = model.NewBool(true)
				cfg.LiveCaptionsLanguage = "inv"
				return cfg
			}(),
			err: "LiveCaptionsLanguage is not valid: should be a 2-letter ISO 639 set 1 language code, or blank for default",
		},
		{
			name: "invalid TranscriberNumThreads",
			input: func() configuration {
				var cfg configuration
				cfg.SetDefaults()
				cfg.EnableRecordings = model.NewBool(true)
				cfg.EnableTranscriptions = model.NewBool(true)
				cfg.TranscriberNumThreads = model.NewInt(0)
				return cfg
			}(),
			err: "TranscriberNumThreads is not valid: should be greater than 0",
		},
		{
			name:  "defaults",
			input: defaultConfig,
		},
	}

	for _, tc := range tcs {
		t.Run(tc.name, func(t *testing.T) {
			err := tc.input.IsValid()
			if tc.err == "" {
				require.NoError(t, err)
			} else {
				require.EqualError(t, err, tc.err)
			}
		})
	}
}

func TestGetClientConfig(t *testing.T) {
	mockAPI := &pluginMocks.MockAPI{}

	p := &Plugin{
		MattermostPlugin: plugin.MattermostPlugin{
			API: mockAPI,
		},
		licenseChecker: enterprise.NewLicenseChecker(mockAPI),
	}

	mockAPI.On("GetLicense").Return(&model.License{
		SkuShortName: "starter",
	})
	mockAPI.On("GetConfig").Return(&model.Config{})

	clientCfg := p.getClientConfig(p.getConfiguration())

	// defaults
	require.Equal(t, model.NewBool(true), clientCfg.AllowEnableCalls)
	require.Equal(t, p.getConfiguration().AllowEnableCalls, clientCfg.AllowEnableCalls)
	require.Equal(t, model.NewBool(false), clientCfg.DefaultEnabled)
	require.Equal(t, p.getConfiguration().DefaultEnabled, clientCfg.DefaultEnabled)

	*p.configuration.AllowEnableCalls = false
	*p.configuration.DefaultEnabled = true
	clientCfg = p.getClientConfig(p.getConfiguration())
	require.Equal(t, true, *clientCfg.AllowEnableCalls)
	require.Equal(t, p.getConfiguration().DefaultEnabled, clientCfg.DefaultEnabled)

	// Host controls
	require.Equal(t, false, clientCfg.HostControlsAllowed)
	mockAPI.On("GetLicense").Unset()
	mockAPI.On("GetLicense").Return(&model.License{
		SkuShortName: "professional",
	})
	clientCfg = p.getClientConfig(p.getConfiguration())
	require.Equal(t, true, clientCfg.HostControlsAllowed)

	// admin config
	adminClientCfg := p.getAdminClientConfig(p.getConfiguration())
	require.Equal(t, transcriber.TranscribeAPI(transcriber.TranscribeAPIWhisperCPP), adminClientCfg.TranscribeAPI)
}
