// Copyright (c) 2022-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/mattermost/mattermost-plugin-calls/server/cluster"
	"github.com/mattermost/mattermost/server/public/model"

	"github.com/mattermost/rtcd/service/random"

	offloader "github.com/mattermost/calls-offloader/public"
	"github.com/mattermost/calls-offloader/public/job"

	recorder "github.com/mattermost/calls-recorder/cmd/recorder/config"
	transcriber "github.com/mattermost/calls-transcriber/cmd/transcriber/config"
)

const (
	jobServiceConfigKey             = "jobservice_config"
	runnerUpdateLockTimeout         = 2 * time.Minute
	maxReinitializationAttempts     = 10
	reinitializationAttemptInterval = time.Second
)

var (
	recorderJobRunner    = ""
	transcriberJobRunner = ""
)

var (
	recorderBaseConfigs = map[string]recorder.RecorderConfig{
		"low": {
			Width:        1280,
			Height:       720,
			VideoRate:    1000,
			AudioRate:    64,
			FrameRate:    15,
			VideoPreset:  recorder.H264PresetUltraFast,
			OutputFormat: recorder.AVFormatMP4,
		},
		"medium": {
			Width:        1280,
			Height:       720,
			VideoRate:    1500,
			AudioRate:    64,
			FrameRate:    20,
			VideoPreset:  recorder.H264PresetVeryFast,
			OutputFormat: recorder.AVFormatMP4,
		},
		"high": {
			Width:        1920,
			Height:       1080,
			VideoRate:    2500,
			AudioRate:    64,
			FrameRate:    20,
			VideoPreset:  recorder.H264PresetVeryFast,
			OutputFormat: recorder.AVFormatMP4,
		},
	}
)

type jobService struct {
	ctx    *Plugin
	client *offloader.Client
}

func (p *Plugin) getStoredJobServiceClientConfig() (offloader.ClientConfig, error) {
	var cfg offloader.ClientConfig
	data, appErr := p.KVGet(jobServiceConfigKey, false)
	if appErr != nil {
		return cfg, fmt.Errorf("failed to get job service client config: %w", appErr)
	}
	if len(data) == 0 {
		return cfg, nil
	}
	if err := json.Unmarshal(data, &cfg); err != nil {
		return cfg, fmt.Errorf("failed to unmarshal job service client config: %w", err)
	}
	return cfg, nil
}

func (p *Plugin) getJobServiceClientConfig(serviceURL string) (offloader.ClientConfig, error) {
	var cfg offloader.ClientConfig

	// Give precedence to environment to override everything else.
	cfg.ClientID = os.Getenv("MM_CALLS_JOB_SERVICE_CLIENT_ID")
	cfg.AuthKey = os.Getenv("MM_CALLS_JOB_SERVICE_AUTH_KEY")
	cfg.URL = strings.TrimSuffix(os.Getenv("MM_CALLS_JOB_SERVICE_URL"), "/")

	if cfg.URL == "" {
		cfg.URL = serviceURL
	}

	// Parsing the URL in case it's already containing credentials.
	u, clientID, authKey, err := parseURL(cfg.URL)
	if err != nil {
		return cfg, fmt.Errorf("failed to parse URL: %w", err)
	}
	if cfg.ClientID == "" && cfg.AuthKey == "" {
		cfg.ClientID = clientID
		cfg.AuthKey = authKey
	}
	// Updating to the clean URL (with credentials stripped if present).
	cfg.URL = u

	// if no URL has been provided until now we fail with error.
	if cfg.URL == "" {
		return cfg, fmt.Errorf("URL is missing")
	}

	// Use the telemetry ID if none is explicitly given.
	if cfg.ClientID == "" {
		cfg.ClientID = p.API.GetDiagnosticId()
	}

	// If no client id has been provided until now we fail with error.
	if cfg.ClientID == "" {
		return cfg, fmt.Errorf("client id is missing")
	}

	// If the auth key is set we proceed and return the config.
	// Otherwise we need to either fetch the config from the k/v store
	// or register the client.
	if cfg.AuthKey != "" {
		return cfg, nil
	}

	storedCfg, err := p.getStoredJobServiceClientConfig()
	if err != nil {
		return cfg, fmt.Errorf("failed to get job service credentials: %w", err)
	}

	if storedCfg.URL == cfg.URL && storedCfg.ClientID == cfg.ClientID {
		return storedCfg, nil
	}

	if storedCfg.AuthKey != "" {
		p.LogDebug("auth key found in db stored job service config")
		cfg.AuthKey = storedCfg.AuthKey
	} else {
		p.LogDebug("auth key missing from job service config, generating a new one")
		cfg.AuthKey, err = random.NewSecureString(32)
		if err != nil {
			return cfg, fmt.Errorf("failed to generate auth key: %w", err)
		}
	}

	cfgData, err := json.Marshal(&cfg)
	if err != nil {
		return cfg, fmt.Errorf("failed to marshal job service client config: %w", err)
	}

	// Saving auth credentials.
	p.metrics.IncStoreOp("KVSet")
	if err := p.API.KVSet(jobServiceConfigKey, cfgData); err != nil {
		return cfg, fmt.Errorf("failed to store job service client config: %w", err)
	}

	return cfg, nil
}

func (p *Plugin) newJobService(serviceURL string) (*jobService, error) {
	if serviceURL == "" {
		return nil, fmt.Errorf("serviceURL should not be empty")
	}

	// Remove trailing slash if present.
	serviceURL = strings.TrimSuffix(serviceURL, "/")

	// Here we need some coordination to avoid multiple plugin instances to
	// register at the same time (at most one would succeed).
	mutex, err := cluster.NewMutex(p.API, p.metrics, "job_service_registration", cluster.MutexConfig{})
	if err != nil {
		return nil, fmt.Errorf("failed to create cluster mutex: %w", err)
	}

	lockCtx, cancelCtx := context.WithTimeout(context.Background(), lockTimeout)
	defer cancelCtx()
	if err := mutex.Lock(lockCtx); err != nil {
		return nil, fmt.Errorf("failed to acquire cluster lock: %w", err)
	}
	defer mutex.Unlock()

	cfg, err := p.getJobServiceClientConfig(serviceURL)
	if err != nil {
		return nil, fmt.Errorf("failed to get job service client config: %w", err)
	}

	client, err := offloader.NewClient(cfg)
	if err != nil {
		return nil, fmt.Errorf("failed to create client: %w", err)
	}

	if err := p.jobServiceVersionCheck(client); err != nil {
		return nil, err
	}

	return &jobService{
		ctx:    p,
		client: client,
	}, nil
}

func (p *Plugin) getJobService() *jobService {
	p.mut.RLock()
	defer p.mut.RUnlock()
	return p.jobService
}

func (s *jobService) StopJob(channelID, jobID, botUserID, botConnID string) error {
	if channelID == "" {
		return fmt.Errorf("channelID should not be empty")
	}

	if jobID == "" {
		return fmt.Errorf("jobID should not be empty")
	}

	if botUserID == "" {
		return fmt.Errorf("botUserID should not be empty")
	}

	// A job can be stopped before the bot is able to join. In such case there's
	// no point in sending an event. The bot isn't allowed to join back.
	if botConnID == "" {
		s.ctx.LogDebug("stopping job with empty connID", "channelID", channelID)
		return nil
	}

	s.ctx.publishWebSocketEvent(wsEventJobStop, map[string]interface{}{
		"job_id": jobID,
	}, &WebSocketBroadcast{UserID: botUserID, ReliableClusterSend: true})

	// DEPRECATED in favor of the new wsEventJobStop event.
	// Since MM-52346, stopping a job really means signaling the bot it's time to leave
	// the call. We do this implicitly by sending a fake call end event.
	s.ctx.publishWebSocketEvent(wsEventCallEnd, map[string]interface{}{
		"channelID": channelID,
	}, &WebSocketBroadcast{ConnectionID: botConnID, ReliableClusterSend: true})

	return nil
}

func (s *jobService) Init(runners []string) error {
	if len(runners) == 0 {
		return fmt.Errorf("unexpected empty runners")
	}

	// Here we need some coordination to avoid multiple plugin instances to
	// initialize the service concurrently.
	mutex, err := cluster.NewMutex(s.ctx.API, s.ctx.metrics, "job_service_runner_update", cluster.MutexConfig{})
	if err != nil {
		return fmt.Errorf("failed to create cluster mutex: %w", err)
	}

	lockCtx, cancelCtx := context.WithTimeout(context.Background(), runnerUpdateLockTimeout)
	defer cancelCtx()
	if err := mutex.Lock(lockCtx); err != nil {
		return fmt.Errorf("failed to acquire cluster lock: %w", err)
	}
	defer mutex.Unlock()

	return s.client.Init(job.ServiceConfig{
		Runners: runners,
	})
}

func (s *jobService) RunJob(jobType job.Type, callID, postID, jobID, authToken string) (string, error) {
	cfg := s.ctx.getConfiguration()
	if cfg == nil {
		return "", fmt.Errorf("failed to get plugin configuration")
	}

	serverCfg := s.ctx.API.GetConfig()
	if serverCfg == nil {
		return "", fmt.Errorf("failed to get server configuration")
	}

	var siteURL string
	if serverCfg.ServiceSettings.SiteURL == nil {
		s.ctx.LogWarn("SiteURL is not set, using default")
		siteURL = model.ServiceSettingsDefaultSiteURL
	} else {
		siteURL = *serverCfg.ServiceSettings.SiteURL
	}

	jobCfg := job.Config{
		Type: jobType,
	}

	switch jobType {
	case job.TypeRecording:
		baseRecorderCfg := recorderBaseConfigs[cfg.RecordingQuality]
		baseRecorderCfg.SiteURL = siteURL
		if siteURLOverride := os.Getenv("MM_CALLS_RECORDER_SITE_URL"); siteURLOverride != "" {
			s.ctx.LogInfo("using SiteURL override for recorder job", "siteURL", siteURL, "siteURLOverride", siteURLOverride)
			baseRecorderCfg.SiteURL = siteURLOverride
		}
		baseRecorderCfg.CallID = callID
		baseRecorderCfg.PostID = postID
		baseRecorderCfg.RecordingID = jobID
		baseRecorderCfg.AuthToken = authToken

		if err := baseRecorderCfg.IsValid(); err != nil {
			return "", fmt.Errorf("recorder config is not valid: %w", err)
		}

		jobCfg.Runner = recorderJobRunner
		jobCfg.MaxDurationSec = int64(*cfg.MaxRecordingDuration * 60)
		jobCfg.InputData = baseRecorderCfg.ToMap()
	case job.TypeTranscribing:
		var transcriberConfig transcriber.CallTranscriberConfig
		transcriberConfig.SetDefaults()
		transcriberConfig.SiteURL = siteURL
		if siteURLOverride := os.Getenv("MM_CALLS_TRANSCRIBER_SITE_URL"); siteURLOverride != "" {
			s.ctx.LogInfo("using SiteURL override for transcriber job", "siteURL", siteURL, "siteURLOverride", siteURLOverride)
			transcriberConfig.SiteURL = siteURLOverride
		}
		transcriberConfig.CallID = callID
		transcriberConfig.PostID = postID
		transcriberConfig.TranscriptionID = jobID
		transcriberConfig.AuthToken = authToken
		transcriberConfig.ModelSize = cfg.TranscriberModelSize
		transcriberConfig.TranscribeAPI = cfg.TranscribeAPI
		if cfg.TranscribeAPI == transcriber.TranscribeAPIAzure {
			transcriberConfig.TranscribeAPIOptions = map[string]any{
				"AZURE_SPEECH_KEY":    cfg.TranscribeAPIAzureSpeechKey,
				"AZURE_SPEECH_REGION": cfg.TranscribeAPIAzureSpeechRegion,
			}
		}
		transcriberConfig.LiveCaptionsOn = cfg.liveCaptionsEnabled()
		transcriberConfig.LiveCaptionsModelSize = cfg.LiveCaptionsModelSize
		transcriberConfig.LiveCaptionsNumTranscribers = *cfg.LiveCaptionsNumTranscribers
		transcriberConfig.NumThreads = *cfg.TranscriberNumThreads
		transcriberConfig.LiveCaptionsNumThreadsPerTranscriber = *cfg.LiveCaptionsNumThreadsPerTranscriber
		transcriberConfig.LiveCaptionsLanguage = cfg.LiveCaptionsLanguage

		if err := transcriberConfig.IsValid(); err != nil {
			return "", fmt.Errorf("transcriber config is not valid: %w", err)
		}

		jobCfg.Runner = transcriberJobRunner
		// Setting the max duration to double the value of the recording's setting as
		// the transcribing process will extend well after the call has ended.
		// This way we account for a worst case of 1x real-time (i.e. taking 1 hour to
		// transcribe a 1 hour long call).
		jobCfg.MaxDurationSec = int64(*cfg.MaxRecordingDuration*60) * 2
		jobCfg.InputData = transcriberConfig.ToMap()
	}

	jb, err := s.client.CreateJob(jobCfg)
	if err != nil {
		return "", err
	}

	return jb.ID, nil
}

func (s *jobService) Close() error {
	return s.client.Close()
}

func (p *Plugin) jobServiceVersionCheck(client *offloader.Client) error {
	// Version compatibility check.
	info, err := client.GetVersionInfo()
	if err != nil {
		return fmt.Errorf("failed to get job service version info: %w", err)
	}

	minServiceVersion, ok := manifest.Props["min_offloader_version"].(string)
	if !ok {
		return fmt.Errorf("failed to get min_offloader_version from manifest")
	}

	// Always support dev builds.
	if info.BuildVersion == "" || info.BuildVersion == "master" || strings.HasPrefix(info.BuildVersion, "dev") {
		p.LogInfo("skipping version compatibility check", "buildVersion", info.BuildVersion)
		return nil
	}

	if err := checkMinVersion(minServiceVersion, info.BuildVersion); err != nil {
		return fmt.Errorf("minimum version check failed: %w", err)
	}

	p.LogDebug("job service version compatibility check succeeded",
		"min_offloader_version", minServiceVersion,
		"curr_offloader_version", info.BuildVersion)

	return nil
}

func (p *Plugin) initJobService() error {
	p.LogDebug("initializing job service")

	registry := job.ImageRegistryDefault
	if val := os.Getenv("MM_CALLS_JOB_SERVICE_IMAGE_REGISTRY"); val != "" {
		registry = val
	}

	recorderVersion, ok := manifest.Props["calls_recorder_version"].(string)
	if !ok {
		return fmt.Errorf("failed to get recorder version from manifest")
	}
	recorderJobRunner = fmt.Sprintf("%s/%s:%s", registry, job.RecordingJobPrefix, recorderVersion)
	runners := []string{recorderJobRunner}

	transcriberVersion, ok := manifest.Props["calls_transcriber_version"].(string)
	if !ok {
		return fmt.Errorf("failed to get transcriber version from manifest")
	}
	transcriberJobRunner = fmt.Sprintf("%s/%s:%s", registry, job.TranscribingJobPrefix, transcriberVersion)

	// We only initialize the transcriber runner (image prefetch) if transcriptions are enabled.
	// We still need to set the runner above in case they are enabled at a later point.
	if cfg := p.getConfiguration(); cfg.transcriptionsEnabled() {
		runners = append(runners, transcriberJobRunner)
	}

	jobService, err := p.newJobService(p.getConfiguration().getJobServiceURL())
	if err != nil {
		return fmt.Errorf("failed to create job service: %w", err)
	}

	if err := jobService.Init(runners); err != nil {
		return err
	}

	p.mut.Lock()
	p.jobService = jobService
	p.mut.Unlock()

	return nil
}
