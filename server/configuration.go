// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"maps"
	"net/http"
	"os"
	"reflect"
	"strconv"
	"strings"

	"github.com/mattermost/mattermost-plugin-calls/server/license"

	transcriber "github.com/mattermost/calls-transcriber/cmd/transcriber/config"

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
	// The URL to a running calls-offloader job service instance.
	JobServiceURL string
	// The audio and video quality of call recordings.
	RecordingQuality string
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
	// The URL of the LiveKit server (e.g. wss://livekit.example.com).
	LiveKitURL string
	// The API key used to authenticate with the LiveKit server.
	LiveKitAPIKey string
	// The API secret used to authenticate with the LiveKit server.
	LiveKitAPISecret string
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

	ClientConfig
}

type ClientConfig struct {
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
	// When set to true it enables using the AV1 codec to encode screen sharing tracks.
	EnableAV1 *bool
	// Let the server determine whether or not group calls are allowed (through license checks or otherwise)
	GroupCallsAllowed bool
	// When set to true it enables experimental support for using the data channel for signaling.
	EnableDCSignaling *bool
	// When set to try it enables video calls in direct message channels.
	EnableVideo *bool
}

const (
	defaultRecDurationMinutes = 60
	minRecDurationMinutes     = 15
	maxRecDurationMinutes     = 180
)

func (c *configuration) SetDefaults() {
	c.AllowEnableCalls = model.NewPointer(true)

	if c.DefaultEnabled == nil {
		c.DefaultEnabled = model.NewPointer(false)
	}
	if c.MaxCallParticipants == nil {
		c.MaxCallParticipants = model.NewPointer(0) // unlimited
	}
	if c.AllowScreenSharing == nil {
		c.AllowScreenSharing = model.NewPointer(true)
	}
	if c.EnableRecordings == nil {
		c.EnableRecordings = model.NewPointer(false)
	}
	if c.EnableTranscriptions == nil {
		c.EnableTranscriptions = model.NewPointer(false)
	}
	if c.TranscriberNumThreads == nil {
		c.TranscriberNumThreads = model.NewPointer(transcriber.NumThreadsDefault)
	}
	if c.MaxRecordingDuration == nil {
		c.MaxRecordingDuration = model.NewPointer(defaultRecDurationMinutes)
	}
	if c.RecordingQuality == "" {
		c.RecordingQuality = "medium"
	}
	if c.EnableSimulcast == nil {
		c.EnableSimulcast = model.NewPointer(false)
	}
	if c.EnableRinging == nil {
		c.EnableRinging = model.NewPointer(false)
	}
	if c.TranscriberModelSize == "" {
		c.TranscriberModelSize = transcriber.ModelSizeDefault
	}
	if c.TranscribeAPI == "" {
		c.TranscribeAPI = transcriber.TranscribeAPIDefault
	}
	if c.EnableLiveCaptions == nil {
		c.EnableLiveCaptions = model.NewPointer(false)
	}
	if c.LiveCaptionsModelSize == "" {
		c.LiveCaptionsModelSize = transcriber.LiveCaptionsModelSizeDefault
	}
	if c.LiveCaptionsNumTranscribers == nil {
		c.LiveCaptionsNumTranscribers = model.NewPointer(transcriber.LiveCaptionsNumTranscribersDefault)
	}
	if c.LiveCaptionsNumThreadsPerTranscriber == nil {
		c.LiveCaptionsNumThreadsPerTranscriber = model.NewPointer(transcriber.LiveCaptionsNumThreadsPerTranscriberDefault)
	}
	if c.LiveCaptionsLanguage == "" {
		c.LiveCaptionsLanguage = transcriber.LiveCaptionsLanguageDefault
	}
	if c.EnableAV1 == nil {
		c.EnableAV1 = model.NewPointer(false)
	}
	if c.EnableDCSignaling == nil {
		c.EnableDCSignaling = model.NewPointer(false)
	}
	if c.EnableVideo == nil {
		c.EnableVideo = model.NewPointer(false)
	}
}

func (c *configuration) IsValid() error {
	if c.MaxCallParticipants == nil || *c.MaxCallParticipants < 0 {
		return fmt.Errorf("MaxCallParticipants is not valid")
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

	cfg.JobServiceURL = c.JobServiceURL
	cfg.RecordingQuality = c.RecordingQuality
	cfg.TranscriberModelSize = c.TranscriberModelSize
	cfg.TranscribeAPI = c.TranscribeAPI
	cfg.TranscribeAPIAzureSpeechKey = c.TranscribeAPIAzureSpeechKey
	cfg.TranscribeAPIAzureSpeechRegion = c.TranscribeAPIAzureSpeechRegion
	cfg.LiveCaptionsModelSize = c.LiveCaptionsModelSize
	cfg.LiveCaptionsLanguage = c.LiveCaptionsLanguage
	cfg.LiveKitURL = c.LiveKitURL
	cfg.LiveKitAPIKey = c.LiveKitAPIKey
	cfg.LiveKitAPISecret = c.LiveKitAPISecret

	// AllowEnableCalls is always true
	cfg.AllowEnableCalls = model.NewPointer(true)

	if c.DefaultEnabled != nil {
		cfg.DefaultEnabled = model.NewPointer(*c.DefaultEnabled)
	}

	if c.MaxCallParticipants != nil {
		cfg.MaxCallParticipants = model.NewPointer(*c.MaxCallParticipants)
	}

	if c.AllowScreenSharing != nil {
		cfg.AllowScreenSharing = model.NewPointer(*c.AllowScreenSharing)
	}

	if c.EnableRecordings != nil {
		cfg.EnableRecordings = model.NewPointer(*c.EnableRecordings)
	}

	if c.EnableTranscriptions != nil {
		cfg.EnableTranscriptions = model.NewPointer(*c.EnableTranscriptions)
	}

	if c.TranscriberNumThreads != nil {
		cfg.TranscriberNumThreads = model.NewPointer(*c.TranscriberNumThreads)
	}

	if c.EnableLiveCaptions != nil {
		cfg.EnableLiveCaptions = model.NewPointer(*c.EnableLiveCaptions)
	}

	if c.MaxRecordingDuration != nil {
		cfg.MaxRecordingDuration = model.NewPointer(*c.MaxRecordingDuration)
	}

	if c.EnableSimulcast != nil {
		cfg.EnableSimulcast = model.NewPointer(*c.EnableSimulcast)
	}

	if c.EnableRinging != nil {
		cfg.EnableRinging = model.NewPointer(*c.EnableRinging)
	}

	if c.LiveCaptionsNumTranscribers != nil {
		cfg.LiveCaptionsNumTranscribers = model.NewPointer(*c.LiveCaptionsNumTranscribers)
	}

	if c.LiveCaptionsNumThreadsPerTranscriber != nil {
		cfg.LiveCaptionsNumThreadsPerTranscriber = model.NewPointer(*c.LiveCaptionsNumThreadsPerTranscriber)
	}

	if c.EnableAV1 != nil {
		cfg.EnableAV1 = model.NewPointer(*c.EnableAV1)
	}

	if c.EnableDCSignaling != nil {
		cfg.EnableDCSignaling = model.NewPointer(*c.EnableDCSignaling)
	}

	if c.EnableVideo != nil {
		cfg.EnableVideo = model.NewPointer(*c.EnableVideo)
	}

	return &cfg
}

func (c *configuration) getLiveKitURL() string {
	if url := os.Getenv("MM_CALLS_LIVEKIT_URL"); url != "" {
		return url
	}
	return c.LiveKitURL
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

func (p *Plugin) getClientConfig(c *configuration) ClientConfig {
	skuShortName := "starter"
	license := p.API.GetLicense()
	if license != nil {
		skuShortName = license.SkuShortName
	}

	return ClientConfig{
		AllowEnableCalls:     model.NewPointer(true), // always true
		DefaultEnabled:       c.DefaultEnabled,
		MaxCallParticipants:  c.MaxCallParticipants,
		AllowScreenSharing:   c.AllowScreenSharing,
		EnableRecordings:     c.EnableRecordings,
		EnableTranscriptions: c.EnableTranscriptions,
		EnableLiveCaptions:   c.EnableLiveCaptions,
		MaxRecordingDuration: c.MaxRecordingDuration,
		EnableSimulcast:      c.EnableSimulcast,
		EnableRinging:        c.EnableRinging,
		SkuShortName:         skuShortName,
		HostControlsAllowed:  p.licenseChecker.HostControlsAllowed(),
		EnableAV1:            c.EnableAV1,
		GroupCallsAllowed:    p.licenseChecker.GroupCallsAllowed(),
		EnableDCSignaling:    c.EnableDCSignaling,
		EnableVideo:          c.EnableVideo,
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
	// Mattermost before being passed to this hook. Work on a copy with those fields removed
	// so they are skipped during unmarshal and validation without mutating newCfg (which
	// the server will save). The fields were already valid when originally saved.
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
	p.configEnvOverrides = p.applyEnvOverrides(cfg, "MM_CALLS")

	cfg.AllowEnableCalls = model.NewPointer(true)

	if l := p.API.GetLicense(); l != nil && license.IsCloud(l) {
		// On Cloud installations we want calls enabled in all channels so we
		// override it since the plugin's default is now false.
		*cfg.DefaultEnabled = true
	}

	// nolint:revive
	if maxPart := os.Getenv("MM_CALLS_MAX_CALL_PARTICIPANTS"); maxPart != "" {
		// Nothing to do because we parsed this already through applyEnvOverrides.
	} else if maxPart := os.Getenv("MM_CALLS_MAX_PARTICIPANTS"); maxPart != "" {
		// v1.8.0 (MM-62732) MM_CALLS_MAX_PARTICIPANTS is DEPRECATED in favor of MM_CALLS_MAX_CALL_PARTICIPANTS.
		// Allow env var to permanently override system console settings
		if maxVal, err := strconv.Atoi(maxPart); err == nil {
			*cfg.MaxCallParticipants = maxVal
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

	cfg.JobServiceURL = strings.TrimSpace(cfg.JobServiceURL)
	cfg.LiveKitURL = strings.TrimSpace(cfg.LiveKitURL)
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
