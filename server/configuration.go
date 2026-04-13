// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"errors"
	"fmt"
	"net/http"
	"os"
	"reflect"
	"strconv"
	"strings"

	"encoding/json"
	"maps"

	"github.com/mattermost/mattermost-plugin-calls/server/license"

	"github.com/mattermost/mattermost/server/public/model"
)

// configuration captures the plugin's external configuration as exposed in the Mattermost server
// configuration, as well as values computed from the configuration. Any public fields will be
// deserialized from the Mattermost server configuration in OnConfigurationChange.
type configuration struct {
	// LiveKit server WebSocket URL (e.g., ws://localhost:7880)
	LiveKitURL string
	// LiveKit API key for authentication
	LiveKitAPIKey string
	// LiveKit API secret for JWT token generation
	LiveKitAPISecret string
	// PIN required for inbound SIP callers. Empty disables SIP dispatch rule creation.
	LiveKitSIPPIN string
	// SIP trunk ID for inbound calls (e.g., ST_xxx or PN_xxx). Empty means wildcard (any trunk).
	LiveKitSIPTrunkID string
	// Enable guest access via shareable links.
	GuestAccessEnabled *bool
	// Default expiry in hours for new guest links. 0 means no expiry.
	GuestLinkDefaultExpiryHours *int
	// TTL in hours for generated LiveKit guest tokens. Default 4.
	LiveKitGuestTokenTTLHours *int

	ClientConfig
}

type ClientConfig struct {
	// AllowEnableCalls is always true. DO NOT REMOVE; needed for mobile backward compatibility.
	AllowEnableCalls *bool
	// DefaultEnabled is required for clients; it is called 'TestMode' in the client, such that:
	// TestMode="off" -> DefaultEnabled=true
	// TestMode="on" -> DefaultEnabled=false
	DefaultEnabled *bool
	// The maximum number of participants that can join a call. The zero value
	// means unlimited.
	MaxCallParticipants *int
	// When set to true it enables ringing for DM/GM channels.
	EnableRinging *bool
	// (Cloud) License information that isn't exposed to clients yet on the webapp
	SkuShortName string `json:"sku_short_name"`
	// Let the server determine whether or not host controls are allowed
	HostControlsAllowed bool
	// Let the server determine whether or not group calls are allowed
	GroupCallsAllowed bool
}

func (c *configuration) SetDefaults() {
	c.AllowEnableCalls = model.NewPointer(true)

	if c.DefaultEnabled == nil {
		c.DefaultEnabled = model.NewPointer(false)
	}
	if c.MaxCallParticipants == nil {
		c.MaxCallParticipants = model.NewPointer(0) // unlimited
	}
	if c.EnableRinging == nil {
		c.EnableRinging = model.NewPointer(false)
	}
	if c.LiveKitURL == "" {
		c.LiveKitURL = "ws://localhost:7880"
	}
	if c.LiveKitAPIKey == "" {
		c.LiveKitAPIKey = "devkey"
	}
	if c.LiveKitAPISecret == "" {
		c.LiveKitAPISecret = "secret"
	}
	if c.GuestAccessEnabled == nil {
		c.GuestAccessEnabled = model.NewPointer(false)
	}
	if c.GuestLinkDefaultExpiryHours == nil {
		c.GuestLinkDefaultExpiryHours = model.NewPointer(0)
	}
	if c.LiveKitGuestTokenTTLHours == nil {
		c.LiveKitGuestTokenTTLHours = model.NewPointer(4)
	}
}

func (c *configuration) IsValid() error {
	if c.MaxCallParticipants == nil || *c.MaxCallParticipants < 0 {
		return fmt.Errorf("MaxCallParticipants is not valid")
	}

	if c.LiveKitURL == "" {
		return fmt.Errorf("LiveKitURL should not be empty")
	}

	if c.LiveKitAPIKey == "" {
		return fmt.Errorf("LiveKitAPIKey should not be empty")
	}

	if c.LiveKitAPISecret == "" {
		return fmt.Errorf("LiveKitAPISecret should not be empty")
	}

	return nil
}

// Clone copies the configuration.
func (c *configuration) Clone() *configuration {
	var cfg configuration

	cfg.LiveKitURL = c.LiveKitURL
	cfg.LiveKitAPIKey = c.LiveKitAPIKey
	cfg.LiveKitAPISecret = c.LiveKitAPISecret
	cfg.LiveKitSIPPIN = c.LiveKitSIPPIN
	cfg.LiveKitSIPTrunkID = c.LiveKitSIPTrunkID

	if c.GuestAccessEnabled != nil {
		cfg.GuestAccessEnabled = model.NewPointer(*c.GuestAccessEnabled)
	}
	if c.GuestLinkDefaultExpiryHours != nil {
		cfg.GuestLinkDefaultExpiryHours = model.NewPointer(*c.GuestLinkDefaultExpiryHours)
	}
	if c.LiveKitGuestTokenTTLHours != nil {
		cfg.LiveKitGuestTokenTTLHours = model.NewPointer(*c.LiveKitGuestTokenTTLHours)
	}

	// AllowEnableCalls is always true
	cfg.AllowEnableCalls = model.NewPointer(true)

	if c.DefaultEnabled != nil {
		cfg.DefaultEnabled = model.NewPointer(*c.DefaultEnabled)
	}

	if c.MaxCallParticipants != nil {
		cfg.MaxCallParticipants = model.NewPointer(*c.MaxCallParticipants)
	}

	if c.EnableRinging != nil {
		cfg.EnableRinging = model.NewPointer(*c.EnableRinging)
	}

	return &cfg
}

func (p *Plugin) getClientConfig(c *configuration) ClientConfig {
	skuShortName := "starter"
	l := p.API.GetLicense()
	if l != nil {
		skuShortName = l.SkuShortName
	}

	return ClientConfig{
		AllowEnableCalls:    model.NewPointer(true), // always true
		DefaultEnabled:      c.DefaultEnabled,
		MaxCallParticipants: c.MaxCallParticipants,
		EnableRinging:       c.EnableRinging,
		SkuShortName:        skuShortName,
		HostControlsAllowed: p.licenseChecker.HostControlsAllowed(),
		GroupCallsAllowed:   p.licenseChecker.GroupCallsAllowed(),
	}
}

func (p *Plugin) getAdminClientConfig(c *configuration) configuration {
	p.configurationLock.Lock()
	defer p.configurationLock.Unlock()

	cfg := p.configuration.Clone()
	cfg.ClientConfig = p.getClientConfig(c)

	return *cfg
}

// getConfiguration retrieves the active configuration under lock, making it safe to use
// concurrently.
func (p *Plugin) getConfiguration() *configuration {
	p.configurationLock.Lock()
	defer p.configurationLock.Unlock()

	if p.configuration == nil {
		p.configuration = new(configuration)
		p.configuration.SetDefaults()
	}

	return p.configuration.Clone()
}

// setConfiguration replaces the active configuration under lock.
func (p *Plugin) setConfiguration(configuration *configuration) error {
	p.configurationLock.Lock()
	defer p.configurationLock.Unlock()

	if p.configuration == nil && configuration != nil {
		p.setOverrides(configuration)
	}

	if configuration != nil && p.configuration == configuration {
		if reflect.ValueOf(*configuration).NumField() == 0 {
			return nil
		}

		return errors.New("setConfiguration called with the existing configuration")
	}

	if err := configuration.IsValid(); err != nil {
		return fmt.Errorf("setConfiguration: configuration is not valid: %w", err)
	}

	p.configuration = configuration

	return nil
}

// OnConfigurationChange is invoked when configuration changes may have been made.
func (p *Plugin) OnConfigurationChange() error {
	serverConfig := p.API.GetConfig()
	if serverConfig == nil {
		p.LogError("OnConfigurationChange: failed to get server config")
	}

	if err := p.loadConfig(); err != nil {
		return fmt.Errorf("OnConfigurationChange: failed to load config: %w", err)
	}

	return nil
}

func (p *Plugin) loadConfig() error {
	cfg := new(configuration)

	// Load the public configuration fields from the Mattermost server configuration.
	if err := p.API.LoadPluginConfiguration(cfg); err != nil {
		return fmt.Errorf("loadConfig: failed to load plugin configuration: %w", err)
	}

	// Set defaults in case anything is missing.
	cfg.SetDefaults()

	// Permanently override with envVar and cloud overrides.
	p.setOverrides(cfg)

	return p.setConfiguration(cfg)
}

func (p *Plugin) ConfigurationWillBeSaved(newCfg *model.Config) (*model.Config, error) {
	p.LogDebug("ConfigurationWillBeSaved")

	if newCfg == nil {
		p.LogWarn("newCfg should not be nil")
		return nil, nil
	}

	configData := newCfg.PluginSettings.Plugins[manifest.Id]

	appErr := model.NewAppError("saveConfig", "app.save_config.error", nil, "", http.StatusBadRequest)
	appErr.SkipTranslation = true

	// Fields marked "secret": true in plugin.json are sanitized to model.FakeSetting by
	// Mattermost before being passed to this hook. Work on a copy with those fields removed.
	configDataForValidation := make(map[string]any, len(configData))
	maps.Copy(configDataForValidation, configData)
	for k, v := range configDataForValidation {
		if v == model.FakeSetting {
			delete(configDataForValidation, k)
		}
	}

	js, err := json.Marshal(configDataForValidation)
	if err != nil {
		err = fmt.Errorf("failed to marshal config data: %w", err)
		p.LogError(err.Error())
		appErr.Message = err.Error()
		return nil, appErr
	}

	var cfg configuration
	if err := json.Unmarshal(js, &cfg); err != nil {
		err = fmt.Errorf("failed to unmarshal config data: %w", err)
		p.LogError(err.Error())
		appErr.Message = err.Error()
		return nil, appErr
	}

	cfg.SetDefaults()

	if err := cfg.IsValid(); err != nil {
		appErr.Message = err.Error()
		return nil, appErr
	}

	return nil, nil
}

func (p *Plugin) setOverrides(cfg *configuration) {
	p.configEnvOverrides = p.applyEnvOverrides(cfg, "MM_CALLS")

	cfg.AllowEnableCalls = model.NewPointer(true)

	if l := p.API.GetLicense(); l != nil && license.IsCloud(l) {
		*cfg.DefaultEnabled = true
	}

	// nolint:revive
	if maxPart := os.Getenv("MM_CALLS_MAX_CALL_PARTICIPANTS"); maxPart != "" {
		// Nothing to do because we parsed this already through applyEnvOverrides.
	} else if maxPart := os.Getenv("MM_CALLS_MAX_PARTICIPANTS"); maxPart != "" {
		if maxVal, err := strconv.Atoi(maxPart); err == nil {
			*cfg.MaxCallParticipants = maxVal
		} else {
			p.LogError("setOverrides", "failed to parse MM_CALLS_MAX_PARTICIPANTS", err.Error())
		}
	} else if l := p.API.GetLicense(); l != nil && license.IsCloud(l) {
		if license.IsCloudStarter(l) {
			*cfg.MaxCallParticipants = cloudStarterMaxParticipantsDefault
		} else {
			*cfg.MaxCallParticipants = cloudPaidMaxParticipantsDefault
		}
	}

	cfg.LiveKitURL = strings.TrimSpace(cfg.LiveKitURL)
	cfg.LiveKitAPIKey = strings.TrimSpace(cfg.LiveKitAPIKey)
	cfg.LiveKitAPISecret = strings.TrimSpace(cfg.LiveKitAPISecret)
	cfg.LiveKitSIPPIN = strings.TrimSpace(cfg.LiveKitSIPPIN)
	cfg.LiveKitSIPTrunkID = strings.TrimSpace(cfg.LiveKitSIPTrunkID)
}

func (p *Plugin) isSingleHandler() bool {
	cfg := p.API.GetConfig()
	pluginCfg := p.getConfiguration()

	if cfg == nil || pluginCfg == nil || p.licenseChecker == nil {
		return false
	}

	return !p.isHA()
}

func (p *Plugin) isHA() bool {
	cfg := p.API.GetConfig()

	if cfg == nil {
		return false
	}

	return cfg.ClusterSettings.Enable != nil && *cfg.ClusterSettings.Enable
}
