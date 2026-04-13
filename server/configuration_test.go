// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"errors"
	"testing"

	"github.com/mattermost/mattermost-plugin-calls/server/enterprise"
	pluginMocks "github.com/mattermost/mattermost-plugin-calls/server/mocks/github.com/mattermost/mattermost/server/public/plugin"
	"github.com/mattermost/mattermost/server/public/plugin"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/stretchr/testify/mock"
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
			err:   "MaxCallParticipants is not valid",
		},
		{
			name: "invalid MaxCallParticipants",
			input: func() configuration {
				var cfg configuration
				cfg.SetDefaults()
				cfg.MaxCallParticipants = model.NewPointer(-1)
				return cfg
			}(),
			err: "MaxCallParticipants is not valid",
		},
		{
			name: "empty LiveKitURL",
			input: func() configuration {
				var cfg configuration
				cfg.SetDefaults()
				cfg.LiveKitURL = ""
				return cfg
			}(),
			err: "LiveKitURL should not be empty",
		},
		{
			name: "empty LiveKitAPIKey",
			input: func() configuration {
				var cfg configuration
				cfg.SetDefaults()
				cfg.LiveKitAPIKey = ""
				return cfg
			}(),
			err: "LiveKitAPIKey should not be empty",
		},
		{
			name: "empty LiveKitAPISecret",
			input: func() configuration {
				var cfg configuration
				cfg.SetDefaults()
				cfg.LiveKitAPISecret = ""
				return cfg
			}(),
			err: "LiveKitAPISecret should not be empty",
		},
		{
			name: "SIPPINLength too low",
			input: func() configuration {
				var cfg configuration
				cfg.SetDefaults()
				cfg.SIPPINLength = model.NewPointer(3)
				return cfg
			}(),
			err: "SIPPINLength must be between 4 and 16",
		},
		{
			name: "SIPPINLength too high",
			input: func() configuration {
				var cfg configuration
				cfg.SetDefaults()
				cfg.SIPPINLength = model.NewPointer(17)
				return cfg
			}(),
			err: "SIPPINLength must be between 4 and 16",
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

func TestSetDefaults(t *testing.T) {
	var cfg configuration
	cfg.SetDefaults()

	require.Equal(t, "ws://localhost:7880", cfg.LiveKitURL)
	require.Equal(t, "devkey", cfg.LiveKitAPIKey)
	require.Equal(t, "secret", cfg.LiveKitAPISecret)
	require.Equal(t, model.NewPointer(true), cfg.AllowEnableCalls)
	require.Equal(t, model.NewPointer(false), cfg.DefaultEnabled)
	require.Equal(t, model.NewPointer(0), cfg.MaxCallParticipants)
	require.Equal(t, model.NewPointer(false), cfg.EnableRinging)
	require.Equal(t, model.NewPointer(false), cfg.GuestAccessEnabled)
	require.Equal(t, model.NewPointer(0), cfg.GuestLinkDefaultExpiryHours)
	require.Equal(t, model.NewPointer(4), cfg.LiveKitGuestTokenTTLHours)
	require.Equal(t, model.NewPointer(9), cfg.SIPPINLength)
}

func TestClone(t *testing.T) {
	var cfg configuration
	cfg.SetDefaults()
	cfg.GuestAccessEnabled = model.NewPointer(true)
	cfg.GuestLinkDefaultExpiryHours = model.NewPointer(24)
	cfg.LiveKitGuestTokenTTLHours = model.NewPointer(8)

	cloned := cfg.Clone()
	require.Equal(t, cfg.LiveKitURL, cloned.LiveKitURL)
	require.Equal(t, cfg.LiveKitAPIKey, cloned.LiveKitAPIKey)
	require.Equal(t, *cfg.GuestAccessEnabled, *cloned.GuestAccessEnabled)
	require.Equal(t, *cfg.GuestLinkDefaultExpiryHours, *cloned.GuestLinkDefaultExpiryHours)
	require.Equal(t, *cfg.LiveKitGuestTokenTTLHours, *cloned.LiveKitGuestTokenTTLHours)

	// Mutating clone should not affect original.
	*cloned.GuestAccessEnabled = false
	require.True(t, *cfg.GuestAccessEnabled)
}

func TestGetClientConfig(t *testing.T) {
	mockAPI := &pluginMocks.MockAPI{}

	defer mockAPI.AssertExpectations(t)

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
	require.Equal(t, model.NewPointer(true), clientCfg.AllowEnableCalls)
	require.Equal(t, p.getConfiguration().AllowEnableCalls, clientCfg.AllowEnableCalls)
	require.Equal(t, model.NewPointer(false), clientCfg.DefaultEnabled)
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
}

func TestConfigurationWillBeSaved(t *testing.T) {
	setup := func(t *testing.T) (*Plugin, *pluginMocks.MockAPI) {
		t.Helper()
		mockAPI := &pluginMocks.MockAPI{}
		p := &Plugin{
			MattermostPlugin: plugin.MattermostPlugin{
				API: mockAPI,
			},
		}
		return p, mockAPI
	}

	pluginCfg := func(data map[string]interface{}) *model.Config {
		return &model.Config{
			PluginSettings: model.PluginSettings{
				Plugins: map[string]map[string]interface{}{
					manifest.Id: data,
				},
			},
		}
	}

	t.Run("nil config", func(t *testing.T) {
		p, mockAPI := setup(t)
		defer mockAPI.AssertExpectations(t)
		mockAPI.On("LogDebug", "ConfigurationWillBeSaved", "origin", mock.AnythingOfType("string")).Return()
		mockAPI.On("LogWarn", "newCfg should not be nil", "origin", mock.AnythingOfType("string")).Return()

		retCfg, err := p.ConfigurationWillBeSaved(nil)
		require.Nil(t, retCfg)
		require.NoError(t, err)
	})

	t.Run("valid empty config", func(t *testing.T) {
		p, mockAPI := setup(t)
		defer mockAPI.AssertExpectations(t)
		mockAPI.On("LogDebug", "ConfigurationWillBeSaved", "origin", mock.AnythingOfType("string")).Return()

		retCfg, err := p.ConfigurationWillBeSaved(pluginCfg(map[string]interface{}{}))
		require.Nil(t, retCfg)
		require.NoError(t, err)
	})

	t.Run("valid config with LiveKitURL", func(t *testing.T) {
		p, mockAPI := setup(t)
		defer mockAPI.AssertExpectations(t)
		mockAPI.On("LogDebug", "ConfigurationWillBeSaved", "origin", mock.AnythingOfType("string")).Return()

		retCfg, err := p.ConfigurationWillBeSaved(pluginCfg(map[string]interface{}{
			"livekiturl": "wss://lk.example.com",
		}))
		require.Nil(t, retCfg)
		require.NoError(t, err)
	})

	t.Run("sanitized secret field", func(t *testing.T) {
		p, mockAPI := setup(t)
		defer mockAPI.AssertExpectations(t)
		mockAPI.On("LogDebug", "ConfigurationWillBeSaved", "origin", mock.AnythingOfType("string")).Return()

		retCfg, err := p.ConfigurationWillBeSaved(pluginCfg(map[string]interface{}{
			"livekitapisecret": model.FakeSetting,
		}))
		require.Nil(t, retCfg)
		require.NoError(t, err)
	})

	t.Run("invalid MaxCallParticipants", func(t *testing.T) {
		p, mockAPI := setup(t)
		defer mockAPI.AssertExpectations(t)
		mockAPI.On("LogDebug", "ConfigurationWillBeSaved", "origin", mock.AnythingOfType("string")).Return()

		retCfg, err := p.ConfigurationWillBeSaved(pluginCfg(map[string]interface{}{
			"maxcallparticipants": float64(-1),
		}))
		require.Nil(t, retCfg)
		require.Error(t, err)
		var appErr *model.AppError
		require.True(t, errors.As(err, &appErr))
		require.Contains(t, appErr.Message, "MaxCallParticipants is not valid")
	})
}
