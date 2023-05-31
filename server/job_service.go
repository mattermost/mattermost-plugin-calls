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
	"github.com/mattermost/mattermost-server/v6/model"

	"github.com/mattermost/rtcd/service/random"

	offloader "github.com/mattermost/calls-offloader/service"
	recorder "github.com/mattermost/calls-recorder/cmd/recorder/config"
)

const jobServiceConfigKey = "jobservice_config"
const runnerUpdateLockTimeout = 2 * time.Minute

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
	p.metrics.IncStoreOp("KVGet")
	data, appErr := p.API.KVGet(jobServiceConfigKey)
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

	if err := p.registerJobServiceClient(cfg); err != nil {
		return cfg, fmt.Errorf("failed to register job service client: %w", err)
	}

	return cfg, nil
}

func (p *Plugin) registerJobServiceClient(cfg offloader.ClientConfig) error {
	client, err := offloader.NewClient(cfg)
	if err != nil {
		return fmt.Errorf("failed to create job service client: %w", err)
	}
	defer client.Close()

	cfgData, err := json.Marshal(&cfg)
	if err != nil {
		return fmt.Errorf("failed to marshal job service client config: %w", err)
	}

	if err := client.Register(cfg.ClientID, cfg.AuthKey); err != nil {
		return fmt.Errorf("failed to register job service client: %w", err)
	}

	// TODO: guard against the "locked out" corner case that the server/plugin process exits
	// before being able to store the credentials but after a successful
	// registration.
	p.metrics.IncStoreOp("KVSet")
	if err := p.API.KVSet(jobServiceConfigKey, cfgData); err != nil {
		return fmt.Errorf("failed to store job service client config: %w", err)
	}

	p.LogDebug("job service client registered successfully", "clientID", cfg.ClientID)

	return nil
}

func (p *Plugin) newJobService(serviceURL string) (*jobService, error) {
	if serviceURL == "" {
		return nil, fmt.Errorf("serviceURL should not be empty")
	}

	// Remove trailing slash if present.
	serviceURL = strings.TrimSuffix(serviceURL, "/")

	// Here we need some coordination to avoid multiple plugin instances to
	// register at the same time (at most one would succeed).
	mutex, err := cluster.NewMutex(p.API, "job_service_registration")
	if err != nil {
		return nil, fmt.Errorf("failed to create cluster mutex: %w", err)
	}

	lockCtx, cancelCtx := context.WithTimeout(context.Background(), lockTimeout)
	defer cancelCtx()
	if err := mutex.LockWithContext(lockCtx); err != nil {
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

	err = client.Login(cfg.ClientID, cfg.AuthKey)
	if err == nil {
		return &jobService{
			ctx:    p,
			client: client,
		}, nil
	}

	// If login fails we attempt to re-register once as the jobs instance may
	// have restarted, potentially losing stored credentials.
	p.LogError("failed to login to job service", "err", err.Error())
	p.LogDebug("attempting to re-register the job service client")

	if err := p.registerJobServiceClient(cfg); err != nil {
		return nil, fmt.Errorf("failed to register job service client: %w", err)
	}

	if err := client.Login(cfg.ClientID, cfg.AuthKey); err != nil {
		return nil, fmt.Errorf("login failed: %w", err)
	}

	return &jobService{
		ctx:    p,
		client: client,
	}, nil
}

func (s *jobService) RunJob(cfg offloader.JobConfig) (offloader.Job, error) {
	return s.client.CreateJob(cfg)
}

func (s *jobService) StopJob(jobID string) error {
	return s.client.StopJob(jobID)
}

func (s *jobService) GetJob(jobID string) (offloader.Job, error) {
	return s.client.GetJob(jobID)
}

func (s *jobService) GetJobLogs(jobID string) ([]byte, error) {
	return s.client.GetJobLogs(jobID)
}

func (s *jobService) UpdateJobRunner(runner string) error {
	// Here we need some coordination to avoid multiple plugin instances to
	// update the runner concurrently.
	mutex, err := cluster.NewMutex(s.ctx.API, "job_service_runner_update")
	if err != nil {
		return fmt.Errorf("failed to create cluster mutex: %w", err)
	}

	lockCtx, cancelCtx := context.WithTimeout(context.Background(), runnerUpdateLockTimeout)
	defer cancelCtx()
	if err := mutex.LockWithContext(lockCtx); err != nil {
		return fmt.Errorf("failed to acquire cluster lock: %w", err)
	}
	defer mutex.Unlock()

	return s.client.UpdateJobRunner(runner)
}

func (s *jobService) RunRecordingJob(callID, postID, authToken string) (string, error) {
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
	baseRecorderCfg.AuthToken = authToken

	job, err := s.RunJob(offloader.JobConfig{
		Type:           offloader.JobTypeRecording,
		MaxDurationSec: maxDuration,
		Runner:         recordingJobRunner,
		InputData:      baseRecorderCfg.ToMap(),
	})
	if err != nil {
		return "", err
	}

	return job.ID, nil
}
