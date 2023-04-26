// Copyright (c) 2022-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"os"
	"reflect"
	"strconv"
	"strings"

	"github.com/mattermost/rtcd/service/rtc"

	"github.com/mattermost/mattermost-server/v6/model"
)

// configuration captures the plugin's external configuration as exposed in the Mattermost server
// configuration, as well as values computed from the configuration. Any public fields will be
// deserialized from the Mattermost server configuration in OnConfigurationChange.
//
// As plugins are inherently concurrent (hooks being called asynchronously), and the plugin
// configuration can change at any time, access to the configuration must be synchronized. The
// strategy used in this plugin is to guard a pointer to the configuration, and clone the entire
// struct whenever it changes. You may replace this with whatever strategy you choose.
//
// If you add non-reference types to your configuration struct, be sure to rewrite Clone as a deep
// copy appropriate for your types.
type configuration struct {
	// The IP (or hostname) to be used as the host ICE candidate.
	ICEHostOverride string
	// The IP address used by the RTC server to listen on.
	UDPServerAddress string
	// UDP port used by the RTC server to listen to.
	UDPServerPort *int
	// The URL to a running RTCD service instance that should host the calls.
	// When set (non empty) all calls will be handled by the external service.
	RTCDServiceURL string
	// The secret key used to generate TURN short-lived authentication credentials
	TURNStaticAuthSecret string
	// The number of minutes that the generated TURN credentials will be valid for.
	TURNCredentialsExpirationMinutes *int
	// When set to true it will pass and use configured TURN candidates to server
	// initiated connections.
	ServerSideTURN *bool
	// The URL to a running calls-offloader job service instance.
	JobServiceURL string
	// The audio and video quality of call recordings.
	RecordingQuality string

	clientConfig
}

type clientConfig struct {
	// **DEPRECATED: use ICEServersConfigs** A comma separated list of ICE servers URLs (STUN/TURN) to use.
	ICEServers ICEServers

	// A list of ICE server configurations to use.
	ICEServersConfigs ICEServersConfigs
	// AllowEnableCalls is always true. DO NOT REMOVE; needed for mobile backward compatibility.
	// It allows channel admins to enable or disable calls in their channels.
	// It also allows participants of DMs/GMs to enable or disable calls.
	AllowEnableCalls *bool
	// DefaultEnabled is required for clients; it is called 'TestMode' in the client, such that:
	// TestMode="off" -> DefaultEnabled=true
	// TestMode="on" -> DefaultEnabled=false
	// When TestMode is set to off (DefaultEnabled=true), calls will be possible in all channels where they are not explicitly disabled.
	DefaultEnabled *bool
	// The maximum number of participants that can join a call. The zero value
	// means unlimited.
	MaxCallParticipants *int
	// Used to signal the client whether or not to generate TURN credentials. This is a client only option, generated server side.
	NeedsTURNCredentials *bool
	// When set to true it allows call participants to share their screen.
	AllowScreenSharing *bool
	// When set to true it enables the call recordings functionality
	EnableRecordings *bool
	// The maximum duration (in minutes) for call recordings.
	MaxRecordingDuration *int
	// When set to true it enables simulcast for screen sharing. This can help to improve screen sharing quality.
	EnableSimulcast *bool
}

const (
	defaultRecDurationMinutes = 60
	minRecDurationMinutes     = 15
	maxRecDurationMinutes     = 180
	minAllowedUDPPort         = 80
	maxAllowedUDPPort         = 49151
)

type ICEServers []string
type ICEServersConfigs rtc.ICEServers

func (cfgs *ICEServersConfigs) UnmarshalJSON(data []byte) error {
	if len(data) == 0 {
		return nil
	}
	unquoted, err := strconv.Unquote(string(data))
	if err != nil {
		return err
	}
	if unquoted == "" {
		return nil
	}

	var dst []rtc.ICEServerConfig
	err = json.Unmarshal([]byte(unquoted), &dst)
	*cfgs = dst

	return err
}

func (is *ICEServers) UnmarshalJSON(data []byte) error {
	*is = []string{}
	if len(data) == 0 {
		return nil
	}
	unquoted, err := strconv.Unquote(string(data))
	if err != nil {
		return err
	}
	if unquoted == "" {
		return nil
	}
	*is = strings.Split(strings.TrimSpace(unquoted), ",")
	return nil
}

func (c *configuration) getClientConfig() clientConfig {
	return clientConfig{
		AllowEnableCalls:     model.NewBool(true), // always true
		DefaultEnabled:       c.DefaultEnabled,
		ICEServers:           c.ICEServers,
		ICEServersConfigs:    c.getICEServers(true),
		MaxCallParticipants:  c.MaxCallParticipants,
		NeedsTURNCredentials: model.NewBool(c.TURNStaticAuthSecret != "" && len(c.ICEServersConfigs.getTURNConfigsForCredentials()) > 0),
		AllowScreenSharing:   c.AllowScreenSharing,
		EnableRecordings:     c.EnableRecordings,
		MaxRecordingDuration: c.MaxRecordingDuration,
		EnableSimulcast:      c.EnableSimulcast,
	}
}

func (c *configuration) SetDefaults() {
	if c.UDPServerPort == nil {
		c.UDPServerPort = model.NewInt(8443)
	}

	c.AllowEnableCalls = model.NewBool(true)

	if c.DefaultEnabled == nil {
		c.DefaultEnabled = model.NewBool(false)
	}
	if c.MaxCallParticipants == nil {
		c.MaxCallParticipants = new(int)
	}
	if c.TURNCredentialsExpirationMinutes == nil {
		c.TURNCredentialsExpirationMinutes = model.NewInt(1440)
	}
	if c.ServerSideTURN == nil {
		c.ServerSideTURN = new(bool)
	}
	if c.AllowScreenSharing == nil {
		c.AllowScreenSharing = new(bool)
		*c.AllowScreenSharing = true
	}
	if c.EnableRecordings == nil {
		c.EnableRecordings = new(bool)
	}
	if c.MaxRecordingDuration == nil {
		c.MaxRecordingDuration = model.NewInt(defaultRecDurationMinutes)
	}
	if c.RecordingQuality == "" {
		c.RecordingQuality = "medium"
	}
	if c.EnableSimulcast == nil {
		c.EnableSimulcast = new(bool)
	}
}

func (c *configuration) IsValid() error {
	if c.UDPServerAddress != "" && net.ParseIP(c.UDPServerAddress) == nil {
		return fmt.Errorf("UDPServerAddress parsing failed")
	}

	if c.UDPServerPort == nil {
		return fmt.Errorf("UDPServerPort should not be nil")
	}

	if *c.UDPServerPort < minAllowedUDPPort || *c.UDPServerPort > maxAllowedUDPPort {
		return fmt.Errorf("UDPServerPort is not valid: %d is not in allowed range [%d, %d]", *c.UDPServerPort, minAllowedUDPPort, maxAllowedUDPPort)
	}

	if c.MaxCallParticipants == nil || *c.MaxCallParticipants < 0 {
		return fmt.Errorf("MaxCallParticipants is not valid")
	}

	if c.TURNCredentialsExpirationMinutes != nil && *c.TURNCredentialsExpirationMinutes < 0 {
		return fmt.Errorf("TURNCredentialsExpirationMinutes is not valid")
	}

	if c.MaxRecordingDuration == nil || *c.MaxRecordingDuration < minRecDurationMinutes || *c.MaxRecordingDuration > maxRecDurationMinutes {
		return fmt.Errorf("MaxRecordingDuration is not valid: range should be [%d, %d]", minRecDurationMinutes, maxRecDurationMinutes)
	}

	if _, ok := recorderBaseConfigs[c.RecordingQuality]; !ok {
		return fmt.Errorf("RecordingQuality is not valid")
	}

	return nil
}

// Clone copies the configuration.
func (c *configuration) Clone() *configuration {
	var cfg configuration

	cfg.UDPServerAddress = c.UDPServerAddress
	cfg.ICEHostOverride = c.ICEHostOverride
	cfg.RTCDServiceURL = c.RTCDServiceURL
	cfg.JobServiceURL = c.JobServiceURL
	cfg.TURNStaticAuthSecret = c.TURNStaticAuthSecret
	cfg.RecordingQuality = c.RecordingQuality

	if c.UDPServerPort != nil {
		cfg.UDPServerPort = new(int)
		*cfg.UDPServerPort = *c.UDPServerPort
	}

	// AllowEnableCalls is always true
	cfg.AllowEnableCalls = model.NewBool(true)

	if c.DefaultEnabled != nil {
		cfg.DefaultEnabled = model.NewBool(*c.DefaultEnabled)
	}

	if c.ICEServers != nil {
		cfg.ICEServers = make(ICEServers, len(c.ICEServers))
		copy(cfg.ICEServers, c.ICEServers)
	}

	if c.ICEServersConfigs != nil {
		cfg.ICEServersConfigs = make([]rtc.ICEServerConfig, len(c.ICEServersConfigs))
		copy(cfg.ICEServersConfigs, c.ICEServersConfigs)
	}

	if c.MaxCallParticipants != nil {
		cfg.MaxCallParticipants = model.NewInt(*c.MaxCallParticipants)
	}

	if c.TURNCredentialsExpirationMinutes != nil {
		cfg.TURNCredentialsExpirationMinutes = model.NewInt(*c.TURNCredentialsExpirationMinutes)
	}

	if c.ServerSideTURN != nil {
		cfg.ServerSideTURN = model.NewBool(*c.ServerSideTURN)
	}

	if c.AllowScreenSharing != nil {
		cfg.AllowScreenSharing = model.NewBool(*c.AllowScreenSharing)
	}

	if c.EnableRecordings != nil {
		cfg.EnableRecordings = model.NewBool(*c.EnableRecordings)
	}

	if c.MaxRecordingDuration != nil {
		cfg.MaxRecordingDuration = model.NewInt(*c.MaxRecordingDuration)
	}

	if c.EnableSimulcast != nil {
		cfg.EnableSimulcast = model.NewBool(*c.EnableSimulcast)
	}

	return &cfg
}

func (c *configuration) getRTCDURL() string {
	if url := os.Getenv("MM_CALLS_RTCD_URL"); url != "" {
		return url
	}
	return c.RTCDServiceURL
}

func (c *configuration) getJobServiceURL() string {
	if url := os.Getenv("MM_CALLS_JOB_SERVICE_URL"); url != "" {
		return url
	}
	return c.JobServiceURL
}

func (c *configuration) recordingsEnabled() bool {
	if c.EnableRecordings != nil && *c.EnableRecordings {
		return true
	}
	return false
}

// getConfiguration retrieves the active configuration under lock, making it safe to use
// concurrently. The active configuration may change underneath the client of this method, but
// the struct returned by this API call is considered immutable.
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
//
// Do not call setConfiguration while holding the configurationLock, as sync.Mutex is not
// reentrant. In particular, avoid using the plugin API entirely, as this may in turn trigger a
// hook back into the plugin. If that hook attempts to acquire this lock, a deadlock may occur.
//
// This method panics if setConfiguration is called with the existing configuration. This almost
// certainly means that the configuration was modified without being cloned and may result in
// an unsafe access.
func (p *Plugin) setConfiguration(configuration *configuration) error {
	p.configurationLock.Lock()
	defer p.configurationLock.Unlock()

	if p.configuration == nil && configuration != nil {
		p.setOverrides(configuration)
	}

	if configuration != nil && p.configuration == configuration {
		// Ignore assignment if the configuration struct is empty. Go will optimize the
		// allocation for same to point at the same memory address, breaking the check
		// above.
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
	var cfg = new(configuration)

	serverConfig := p.API.GetConfig()
	if serverConfig != nil {
		if err := p.initTelemetry(serverConfig.LogSettings.EnableDiagnostics); err != nil {
			p.LogError(err.Error())
		}
	} else {
		p.LogError("OnConfigurationChange: failed to get server config")
	}

	// Load the public configuration fields from the Mattermost server configuration.
	if err := p.API.LoadPluginConfiguration(cfg); err != nil {
		return fmt.Errorf("OnConfigurationChange: failed to load plugin configuration: %w", err)
	}

	// Permanently override with envVar and cloud overrides
	p.setOverrides(cfg)

	return p.setConfiguration(cfg)
}

func (p *Plugin) setOverrides(cfg *configuration) {
	cfg.AllowEnableCalls = model.NewBool(true)

	if cfg.DefaultEnabled == nil {
		cfg.DefaultEnabled = model.NewBool(false)
	}

	if license := p.API.GetLicense(); license != nil && isCloud(license) {
		// On Cloud installations we want calls enabled in all channels so we
		// override it since the plugin's default is now false.
		*cfg.DefaultEnabled = true
	}

	if cfg.MaxCallParticipants == nil {
		cfg.MaxCallParticipants = model.NewInt(0)
	}

	// Allow env var to permanently override system console settings
	if maxPart := os.Getenv("MM_CALLS_MAX_PARTICIPANTS"); maxPart != "" {
		if max, err := strconv.Atoi(maxPart); err == nil {
			*cfg.MaxCallParticipants = max
		} else {
			p.LogError("setOverrides", "failed to parse MM_CALLS_MAX_PARTICIPANTS", err.Error())
		}
	} else if license := p.API.GetLicense(); license != nil && isCloud(license) {
		// otherwise, if this is a cloud installation, set it at the default
		if isCloudStarter(license) {
			*cfg.MaxCallParticipants = cloudStarterMaxParticipantsDefault
		} else {
			*cfg.MaxCallParticipants = cloudPaidMaxParticipantsDefault
		}
	}

	cfg.ICEHostOverride = strings.TrimSpace(cfg.ICEHostOverride)
	cfg.UDPServerAddress = strings.TrimSpace(cfg.UDPServerAddress)
	cfg.RTCDServiceURL = strings.TrimSpace(cfg.RTCDServiceURL)
	cfg.JobServiceURL = strings.TrimSpace(cfg.JobServiceURL)
}

func (p *Plugin) isSingleHandler() bool {
	cfg := p.API.GetConfig()
	pluginCfg := p.getConfiguration()

	if cfg == nil || pluginCfg == nil || p.licenseChecker == nil {
		return false
	}

	rtcdURL := pluginCfg.getRTCDURL()
	hasRTCD := rtcdURL != "" && p.licenseChecker.RTCDAllowed()

	if hasRTCD {
		return false
	}

	isHA := cfg.ClusterSettings.Enable != nil && *cfg.ClusterSettings.Enable
	hasEnvVar := os.Getenv("MM_CALLS_IS_HANDLER") != ""

	return !isHA || (isHA && hasEnvVar)
}

func (p *Plugin) isHA() bool {
	cfg := p.API.GetConfig()

	if cfg == nil {
		return false
	}

	return cfg.ClusterSettings.Enable != nil && *cfg.ClusterSettings.Enable
}

func (c *configuration) getICEServers(forClient bool) ICEServersConfigs {
	var iceServers ICEServersConfigs

	for _, cfg := range c.ICEServersConfigs {
		if forClient && cfg.IsTURN() && cfg.Username == "" && cfg.Credential == "" {
			continue
		}
		iceServers = append(iceServers, cfg)
	}

	if len(c.ICEServers) > 0 {
		iceServers = append(iceServers, rtc.ICEServerConfig{
			URLs: c.ICEServers,
		})
	}

	return iceServers
}

func (cfgs ICEServersConfigs) getTURNConfigsForCredentials() []rtc.ICEServerConfig {
	var configs []rtc.ICEServerConfig
	for _, cfg := range cfgs {
		if cfg.IsTURN() && cfg.Username == "" && cfg.Credential == "" {
			configs = append(configs, cfg)
		}
	}
	return configs
}
