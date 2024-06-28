// Copyright (c) 2022-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"os"
	"reflect"
	"strconv"
	"strings"

	"github.com/mattermost/mattermost-plugin-calls/server/license"

	transcriber "github.com/mattermost/calls-transcriber/cmd/transcriber/config"
	"github.com/mattermost/rtcd/service/rtc"

	"github.com/mattermost/mattermost/server/public/model"
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
	// An optional port number to override the one used in ICE host candidates
	// in place of the one used to listen on.
	ICEHostPortOverride *int
	// The local IP address used by the RTC server to listen on for UDP
	// connections.
	UDPServerAddress string
	// The local IP address used by the RTC server to listen on for TCP
	// connections.
	TCPServerAddress string
	// UDP port used by the RTC server to listen to.
	UDPServerPort *int
	// TCP port used by the RTC server to listen to.
	TCPServerPort *int
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
	// When set to true the RTC service will work in dual-stack mode, listening for IPv6
	// connections and generating candidates in addition to IPv4 ones.
	EnableIPv6 *bool
	// Ringing is default off (for now -- 8.0), allow sysadmins to turn it on.
	// When set to true it enables ringing for DM/GM channels.
	EnableRinging *bool
	// The speech-to-text model size to use to transcribe calls.
	TranscriberModelSize transcriber.ModelSize
	// The speech-to-text API to use to transcribe calls.
	TranscribeAPI transcriber.TranscribeAPI
	// Azure Speech Services API key
	TranscribeAPIAzureSpeechKey string
	// Azure Speech Services API region
	TranscribeAPIAzureSpeechRegion string
	// The number of threads to use to transcriber calls.
	TranscriberNumThreads *int
	// When set to true live captions will be enabled when starting transcription jobs.
	EnableLiveCaptions *bool
	// The speech-to-text model size to use to transcribe live captions.
	LiveCaptionsModelSize transcriber.ModelSize
	// The number of transcribers to use for processing audio tracks into live captions.
	LiveCaptionsNumTranscribers *int
	// The number of threads per transcriber to use for processing audio tracks into live captions.
	LiveCaptionsNumThreadsPerTranscriber *int
	// The language to be passed to the live captions transcriber.
	LiveCaptionsLanguage string

	adminClientConfig

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
	// When set to true it enables the call transcriptions functionality
	EnableTranscriptions *bool
	// When set to true it enables the live captions functionality
	EnableLiveCaptions *bool
	// The maximum duration (in minutes) for call recordings.
	MaxRecordingDuration *int
	// When set to true it enables simulcast for screen sharing. This can help to improve screen sharing quality.
	EnableSimulcast *bool
	// When set to true it enables ringing for DM/GM channels.
	EnableRinging *bool
	// (Cloud) License information that isn't exposed to clients yet on the webapp
	SkuShortName string `json:"sku_short_name"`
	// Let the server determine whether or not host controls are allowed (through license checks or otherwise)
	HostControlsAllowed bool
}

type adminClientConfig struct {
	clientConfig

	// The speech-to-text API to use to transcribe calls.
	TranscribeAPI transcriber.TranscribeAPI
}

const (
	defaultRecDurationMinutes = 60
	minRecDurationMinutes     = 15
	maxRecDurationMinutes     = 180
	minAllowedPort            = 80
	maxAllowedPort            = 49151
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

func (c *configuration) SetDefaults() {
	if c.UDPServerPort == nil {
		c.UDPServerPort = model.NewInt(8443)
	}
	if c.TCPServerPort == nil {
		c.TCPServerPort = model.NewInt(8443)
	}

	c.AllowEnableCalls = model.NewBool(true)

	if c.DefaultEnabled == nil {
		c.DefaultEnabled = model.NewBool(false)
	}
	if c.MaxCallParticipants == nil {
		c.MaxCallParticipants = model.NewInt(0) // unlimited
	}
	if c.TURNCredentialsExpirationMinutes == nil {
		c.TURNCredentialsExpirationMinutes = model.NewInt(1440)
	}
	if c.ServerSideTURN == nil {
		c.ServerSideTURN = model.NewBool(false)
	}
	if c.AllowScreenSharing == nil {
		c.AllowScreenSharing = model.NewBool(true)
	}
	if c.EnableRecordings == nil {
		c.EnableRecordings = model.NewBool(false)
	}
	if c.EnableTranscriptions == nil {
		c.EnableTranscriptions = model.NewBool(false)
	}
	if c.TranscriberNumThreads == nil {
		c.TranscriberNumThreads = model.NewInt(transcriber.NumThreadsDefault)
	}
	if c.MaxRecordingDuration == nil {
		c.MaxRecordingDuration = model.NewInt(defaultRecDurationMinutes)
	}
	if c.RecordingQuality == "" {
		c.RecordingQuality = "medium"
	}
	if c.EnableSimulcast == nil {
		c.EnableSimulcast = model.NewBool(false)
	}
	if c.EnableIPv6 == nil {
		c.EnableIPv6 = model.NewBool(false)
	}
	if c.EnableRinging == nil {
		c.EnableRinging = model.NewBool(false)
	}
	if c.TranscriberModelSize == "" {
		c.TranscriberModelSize = transcriber.ModelSizeDefault
	}
	if c.TranscribeAPI == "" {
		c.TranscribeAPI = transcriber.TranscribeAPIDefault
	}
	if c.EnableLiveCaptions == nil {
		c.EnableLiveCaptions = model.NewBool(false)
	}
	if c.LiveCaptionsModelSize == "" {
		c.LiveCaptionsModelSize = transcriber.LiveCaptionsModelSizeDefault
	}
	if c.LiveCaptionsNumTranscribers == nil {
		c.LiveCaptionsNumTranscribers = model.NewInt(transcriber.LiveCaptionsNumTranscribersDefault)
	}
	if c.LiveCaptionsNumThreadsPerTranscriber == nil {
		c.LiveCaptionsNumThreadsPerTranscriber = model.NewInt(transcriber.LiveCaptionsNumThreadsPerTranscriberDefault)
	}
	if c.LiveCaptionsLanguage == "" {
		c.LiveCaptionsLanguage = transcriber.LiveCaptionsLanguageDefault
	}
}

func (c *configuration) IsValid() error {
	if c.UDPServerAddress != "" && net.ParseIP(c.UDPServerAddress) == nil {
		return fmt.Errorf("UDPServerAddress parsing failed")
	}

	if c.TCPServerAddress != "" && net.ParseIP(c.TCPServerAddress) == nil {
		return fmt.Errorf("TCPServerAddress parsing failed")
	}

	if c.UDPServerPort == nil {
		return fmt.Errorf("UDPServerPort should not be nil")
	}

	if c.TCPServerPort == nil {
		return fmt.Errorf("TCPServerPort should not be nil")
	}

	if *c.UDPServerPort < minAllowedPort || *c.UDPServerPort > maxAllowedPort {
		return fmt.Errorf("UDPServerPort is not valid: %d is not in allowed range [%d, %d]", *c.UDPServerPort, minAllowedPort, maxAllowedPort)
	}

	if *c.TCPServerPort < minAllowedPort || *c.TCPServerPort > maxAllowedPort {
		return fmt.Errorf("TCPServerPort is not valid: %d is not in allowed range [%d, %d]", *c.TCPServerPort, minAllowedPort, maxAllowedPort)
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

	if c.transcriptionsEnabled() {
		if ok := c.TranscriberModelSize.IsValid(); !ok {
			return fmt.Errorf("TranscriberModelSize is not valid")
		}

		if ok := c.TranscribeAPI.IsValid(); !ok {
			return fmt.Errorf("TranscribeAPI is not valid")
		}

		if c.TranscriberNumThreads == nil || *c.TranscriberNumThreads <= 0 {
			return fmt.Errorf("TranscriberNumThreads is not valid: should be greater than 0")
		}
	}

	if c.ICEHostPortOverride != nil && *c.ICEHostPortOverride != 0 && (*c.ICEHostPortOverride < minAllowedPort || *c.ICEHostPortOverride > maxAllowedPort) {
		return fmt.Errorf("ICEHostPortOverride is not valid: %d is not in allowed range [%d, %d]", *c.ICEHostPortOverride, minAllowedPort, maxAllowedPort)
	}

	if c.liveCaptionsEnabled() {
		if ok := c.LiveCaptionsModelSize.IsValid(); !ok {
			return fmt.Errorf("LiveCaptionsModelSize is not valid")
		}
		// Note: we're only testing for gross validity here; actual validity of threads vs. cpus is done
		// in the transcriber's validity checks (when it has numCPUs)
		if c.LiveCaptionsNumTranscribers == nil || *c.LiveCaptionsNumTranscribers <= 0 {
			return fmt.Errorf("LiveCaptionsNumTranscribers is not valid: should be greater than 0")
		}

		if c.LiveCaptionsNumThreadsPerTranscriber == nil || *c.LiveCaptionsNumThreadsPerTranscriber <= 0 {
			return fmt.Errorf("LiveCaptionsNumThreadsPerTranscriber is not valid: should be greater than 0")
		}
		if c.LiveCaptionsLanguage != "" && len(c.LiveCaptionsLanguage) != 2 {
			return fmt.Errorf("LiveCaptionsLanguage is not valid: should be a 2-letter ISO 639 set 1 language code, or blank for default")
		}
	}
	return nil
}

// Clone copies the configuration.
func (c *configuration) Clone() *configuration {
	var cfg configuration

	cfg.UDPServerAddress = c.UDPServerAddress
	cfg.TCPServerAddress = c.TCPServerAddress
	cfg.ICEHostOverride = c.ICEHostOverride
	cfg.RTCDServiceURL = c.RTCDServiceURL
	cfg.JobServiceURL = c.JobServiceURL
	cfg.TURNStaticAuthSecret = c.TURNStaticAuthSecret
	cfg.RecordingQuality = c.RecordingQuality
	cfg.TranscriberModelSize = c.TranscriberModelSize
	cfg.TranscribeAPI = c.TranscribeAPI
	cfg.TranscribeAPIAzureSpeechKey = c.TranscribeAPIAzureSpeechKey
	cfg.TranscribeAPIAzureSpeechRegion = c.TranscribeAPIAzureSpeechRegion
	cfg.LiveCaptionsModelSize = c.LiveCaptionsModelSize
	cfg.LiveCaptionsLanguage = c.LiveCaptionsLanguage

	if c.UDPServerPort != nil {
		cfg.UDPServerPort = model.NewInt(*c.UDPServerPort)
	}

	if c.TCPServerPort != nil {
		cfg.TCPServerPort = model.NewInt(*c.TCPServerPort)
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

	if c.EnableTranscriptions != nil {
		cfg.EnableTranscriptions = model.NewBool(*c.EnableTranscriptions)
	}

	if c.TranscriberNumThreads != nil {
		cfg.TranscriberNumThreads = model.NewInt(*c.TranscriberNumThreads)
	}

	if c.EnableLiveCaptions != nil {
		cfg.EnableLiveCaptions = model.NewBool(*c.EnableLiveCaptions)
	}

	if c.MaxRecordingDuration != nil {
		cfg.MaxRecordingDuration = model.NewInt(*c.MaxRecordingDuration)
	}

	if c.EnableSimulcast != nil {
		cfg.EnableSimulcast = model.NewBool(*c.EnableSimulcast)
	}

	if c.EnableIPv6 != nil {
		cfg.EnableIPv6 = model.NewBool(*c.EnableIPv6)
	}

	if c.EnableRinging != nil {
		cfg.EnableRinging = model.NewBool(*c.EnableRinging)
	}

	if c.ICEHostPortOverride != nil {
		cfg.ICEHostPortOverride = model.NewInt(*c.ICEHostPortOverride)
	}

	if c.LiveCaptionsNumTranscribers != nil {
		cfg.LiveCaptionsNumTranscribers = model.NewInt(*c.LiveCaptionsNumTranscribers)
	}

	if c.LiveCaptionsNumThreadsPerTranscriber != nil {
		cfg.LiveCaptionsNumThreadsPerTranscriber = model.NewInt(*c.LiveCaptionsNumThreadsPerTranscriber)
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

func (c *configuration) transcriptionsEnabled() bool {
	if c.recordingsEnabled() && c.EnableTranscriptions != nil && *c.EnableTranscriptions {
		return true
	}
	return false
}

func (c *configuration) liveCaptionsEnabled() bool {
	if c.recordingsEnabled() && c.transcriptionsEnabled() &&
		c.EnableLiveCaptions != nil && *c.EnableLiveCaptions {
		return true
	}
	return false
}

func (p *Plugin) getClientConfig(c *configuration) clientConfig {
	skuShortName := "starter"
	license := p.API.GetLicense()
	if license != nil {
		skuShortName = license.SkuShortName
	}

	return clientConfig{
		AllowEnableCalls:     model.NewBool(true), // always true
		DefaultEnabled:       c.DefaultEnabled,
		ICEServers:           c.ICEServers,
		ICEServersConfigs:    c.getICEServers(true),
		MaxCallParticipants:  c.MaxCallParticipants,
		NeedsTURNCredentials: model.NewBool(c.TURNStaticAuthSecret != "" && len(c.ICEServersConfigs.getTURNConfigsForCredentials()) > 0),
		AllowScreenSharing:   c.AllowScreenSharing,
		EnableRecordings:     c.EnableRecordings,
		EnableTranscriptions: c.EnableTranscriptions,
		EnableLiveCaptions:   c.EnableLiveCaptions,
		MaxRecordingDuration: c.MaxRecordingDuration,
		EnableSimulcast:      c.EnableSimulcast,
		EnableRinging:        c.EnableRinging,
		SkuShortName:         skuShortName,
		HostControlsAllowed:  p.licenseChecker.HostControlsAllowed(),
	}
}

func (p *Plugin) getAdminClientConfig(c *configuration) adminClientConfig {
	return adminClientConfig{
		clientConfig:  p.getClientConfig(c),
		TranscribeAPI: c.TranscribeAPI,
	}
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
	serverConfig := p.API.GetConfig()
	if serverConfig != nil {
		if err := p.initTelemetry(serverConfig.LogSettings.EnableDiagnostics); err != nil {
			p.LogError(err.Error())
		}
	} else {
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

	js, err := json.Marshal(configData)
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

	// Setting defaults prevents errors in case the plugin is updated after a new
	// setting has been added. In this case the default value will be used.
	cfg.SetDefaults()

	if err := cfg.IsValid(); err != nil {
		appErr.Message = err.Error()
		return nil, appErr
	}

	return nil, nil
}

func (p *Plugin) setOverrides(cfg *configuration) {
	cfg.AllowEnableCalls = model.NewBool(true)

	if l := p.API.GetLicense(); l != nil && license.IsCloud(l) {
		// On Cloud installations we want calls enabled in all channels so we
		// override it since the plugin's default is now false.
		*cfg.DefaultEnabled = true
	}

	// Allow env var to permanently override system console settings
	if maxPart := os.Getenv("MM_CALLS_MAX_PARTICIPANTS"); maxPart != "" {
		if max, err := strconv.Atoi(maxPart); err == nil {
			*cfg.MaxCallParticipants = max
		} else {
			p.LogError("setOverrides", "failed to parse MM_CALLS_MAX_PARTICIPANTS", err.Error())
		}
	} else if l := p.API.GetLicense(); l != nil && license.IsCloud(l) {
		// otherwise, if this is a cloud installation, set it at the default
		if license.IsCloudStarter(l) {
			*cfg.MaxCallParticipants = cloudStarterMaxParticipantsDefault
		} else {
			*cfg.MaxCallParticipants = cloudPaidMaxParticipantsDefault
		}
	}

	cfg.ICEHostOverride = strings.TrimSpace(cfg.ICEHostOverride)
	cfg.UDPServerAddress = strings.TrimSpace(cfg.UDPServerAddress)
	cfg.TCPServerAddress = strings.TrimSpace(cfg.TCPServerAddress)
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

	return !p.isHA()
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
