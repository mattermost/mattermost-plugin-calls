package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"time"

	rtcd "github.com/mattermost/rtcd/service"

	"github.com/mattermost/mattermost-plugin-api/cluster"
)

const rtcdConfigKey = "rtcd_config"

func (p *Plugin) getStoredRTCDConfig() (rtcd.ClientConfig, error) {
	var cfg rtcd.ClientConfig
	p.metrics.IncStoreOp("KVGet")
	data, appErr := p.API.KVGet(rtcdConfigKey)
	if appErr != nil {
		return cfg, fmt.Errorf("failed to get rtcd config: %w", appErr)
	}
	if len(data) == 0 {
		return cfg, nil
	}
	if err := json.Unmarshal(data, &cfg); err != nil {
		return cfg, fmt.Errorf("failed to unmarshal rtcd config: %w", err)
	}
	return cfg, nil
}

func (p *Plugin) getRTCDClientConfig(rtcdURL string) (rtcd.ClientConfig, error) {
	var cfg rtcd.ClientConfig

	// Give precedence to environment to override everything else.
	cfg.ClientID = os.Getenv("CALLS_RTCD_CLIENT_ID")
	cfg.AuthKey = os.Getenv("CALLS_RTCD_AUTH_KEY")
	cfg.URL = rtcdURL
	if rtcdURL = os.Getenv("CALLS_RTCD_URL"); rtcdURL != "" {
		cfg.URL = rtcdURL
	}

	// Parsing the URL in case it's already containing credentials.
	if cfg.ClientID == "" && cfg.AuthKey == "" {
		u, clientID, authKey, err := parseURL(cfg.URL)
		if err != nil {
			return cfg, fmt.Errorf("failed to parse URL: %w", err)
		}
		cfg.ClientID = clientID
		cfg.AuthKey = authKey
		cfg.URL = u
	}

	// if no URL has been provided until now we fail with error.
	if cfg.URL == "" {
		return cfg, fmt.Errorf("rtcd URL is missing")
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

	client, err := rtcd.NewClient(cfg)
	if err != nil {
		return cfg, fmt.Errorf("failed to create rtcd client: %w", err)
	}
	defer client.Close()

	// Here we need some coordination to avoid multiple plugin instances to
	// register at the same time (at most one would succeed).
	mutex, err := cluster.NewMutex(p.API, "rtcd_registration")
	if err != nil {
		return cfg, fmt.Errorf("failed to create cluster mutex: %w", err)
	}

	lockCtx, cancelCtx := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancelCtx()
	if err := mutex.LockWithContext(lockCtx); err != nil {
		return cfg, fmt.Errorf("failed to acquire cluster lock: %w", err)
	}
	defer mutex.Unlock()

	if storedCfg, err := p.getStoredRTCDConfig(); err != nil {
		return cfg, fmt.Errorf("failed to get rtcd credentials: %w", err)
	} else if storedCfg.URL == cfg.URL && storedCfg.ClientID == cfg.ClientID {
		return storedCfg, nil
	}

	cfg.AuthKey, err = client.Register(cfg.ClientID)
	if err != nil {
		return cfg, fmt.Errorf("failed to register rtcd client: %w", err)
	}

	cfgData, err := json.Marshal(&cfg)
	if err != nil {
		return cfg, fmt.Errorf("failed to marshal rtcd client config: %w", err)
	}

	if err := p.API.KVSet(rtcdConfigKey, cfgData); err != nil {
		return cfg, fmt.Errorf("failed to store rtcd client config: %w", err)
	}

	return cfg, nil
}
