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
)

const (
	jobServiceConfigKey             = "jobservice_config"
	runnerUpdateLockTimeout         = 2 * time.Minute
	maxReinitializationAttempts     = 10
	reinitializationAttemptInterval = time.Second
)

var (
	recordingJobRunner  = ""
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

	if storedCfg, err := p.getStoredJobServiceClientConfig(); err != nil {
		return cfg, fmt.Errorf("failed to get job service credentials: %w", err)
	} else if storedCfg.URL == cfg.URL && storedCfg.ClientID == cfg.ClientID {
		return storedCfg, nil
	}

	if cfg.AuthKey == "" {
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

func (s *jobService) StopJob(channelID string) error {
	// Since MM-52346, stopping a job really means signaling the bot it's time to leave
	// the call. We do this implicitly by sending a fake call end event.
	s.ctx.publishWebSocketEvent(wsEventCallEnd, map[string]interface{}{
		"channelID": channelID,
	}, &model.WebsocketBroadcast{UserId: s.ctx.getBotID(), ReliableClusterSend: true})
	return nil
}

func (s *jobService) Init(runner string) error {
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
		Runner: runner,
	})
}

func (s *jobService) RunRecordingJob(callID, postID, recordingID, authToken string) (string, error) {
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

	maxDuration := int64(*cfg.MaxRecordingDuration * 60)

	baseRecorderCfg := recorderBaseConfigs[cfg.RecordingQuality]
	baseRecorderCfg.SiteURL = siteURL
	baseRecorderCfg.CallID = callID
	baseRecorderCfg.ThreadID = postID
	baseRecorderCfg.RecordingID = recordingID
	baseRecorderCfg.AuthToken = authToken

	jobCfg := job.Config{
		Type:           job.TypeRecording,
		MaxDurationSec: maxDuration,
		Runner:         recordingJobRunner,
		InputData:      baseRecorderCfg.ToMap(),
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
	recorderVersion, ok := manifest.Props["calls_recorder_version"].(string)
	if !ok {
		return fmt.Errorf("failed to get recorder version from manifest")
	}
	recordingJobRunner = "mattermost/calls-recorder:" + recorderVersion

	jobService, err := p.newJobService(p.getConfiguration().getJobServiceURL())
	if err != nil {
		return fmt.Errorf("failed to create job service: %w", err)
	}

	if err := jobService.Init(recordingJobRunner); err != nil {
		return err
	}

	p.mut.Lock()
	p.jobService = jobService
	p.mut.Unlock()

	return nil
}
