// Copyright (c) 2022-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"context"
	"fmt"
	"os"
	"path/filepath"

	"github.com/mattermost/mattermost-plugin-calls/server/cluster"
	"github.com/mattermost/mattermost-plugin-calls/server/enterprise"
	"github.com/mattermost/mattermost-plugin-calls/server/license"

	"github.com/mattermost/rtcd/service/rtc"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/shared/i18n"
)

func (p *Plugin) createBotSession() (*model.Session, error) {
	m, err := cluster.NewMutex(p.API, p.metrics, "ensure_bot", cluster.MutexConfig{})
	if err != nil {
		return nil, err
	}
	lockCtx, cancelCtx := context.WithTimeout(context.Background(), lockTimeout)
	defer cancelCtx()
	if err := m.Lock(lockCtx); err != nil {
		return nil, fmt.Errorf("failed to lock cluster mutex: %w", err)
	}
	defer m.Unlock()

	botID, err := p.API.EnsureBotUser(&model.Bot{
		Username:    "calls",
		DisplayName: "Calls",
		Description: "Calls Bot",
		OwnerId:     manifest.Id,
	})
	if err != nil {
		return nil, err
	}

	session, appErr := p.API.CreateSession(&model.Session{
		UserId:    botID,
		ExpiresAt: 0,
	})
	if appErr != nil {
		return nil, appErr
	}

	return session, nil
}

func (p *Plugin) OnActivate() (retErr error) {
	p.LogDebug("activating")

	if os.Getenv("MM_CALLS_DISABLE") == "true" {
		p.LogInfo("disable flag is set, exiting")
		return fmt.Errorf("disabled by environment flag")
	}

	bundlePath, err := p.API.GetBundlePath()
	if err != nil {
		return fmt.Errorf("failed to get bundle path: %w", err)
	}

	if err := i18n.TranslationsPreInit(filepath.Join(bundlePath, "assets/i18n")); err != nil {
		return fmt.Errorf("failed to load translation files: %w", err)
	}

	if err := p.initDB(); err != nil {
		p.LogError(err.Error())
		return err
	}
	defer func() {
		if retErr != nil {
			if err := p.store.Close(); err != nil {
				p.LogError("failed to close store", "err", err.Error())
			}
		}
	}()

	p.licenseChecker = enterprise.NewLicenseChecker(p.API)

	if p.isSingleHandler() {
		if err := p.cleanUpState(); err != nil {
			p.LogError(err.Error())
			return err
		}
	}

	if err := p.registerCommands(); err != nil {
		p.LogError(err.Error())
		return err
	}

	status, appErr := p.API.GetPluginStatus(manifest.Id)
	if appErr != nil {
		p.LogError(appErr.Error())
		return appErr
	}

	if err := p.loadConfig(); err != nil {
		p.LogError(err.Error())
		return err
	}

	cfg := p.getConfiguration()
	if err := cfg.IsValid(); err != nil {
		p.LogError(err.Error())
		return err
	}

	// On Cloud installations we want calls enabled in all channels so we
	// override it since the plugin's default is now false.
	if license.IsCloud(p.API.GetLicense()) {
		cfg.DefaultEnabled = new(bool)
		*cfg.DefaultEnabled = true
		if err := p.setConfiguration(cfg); err != nil {
			err = fmt.Errorf("failed to set configuration: %w", err)
			p.LogError(err.Error())
			return err
		}
	}

	session, err := p.createBotSession()
	if err != nil {
		p.LogError(err.Error())
		return err
	}
	p.botSession = session

	if appErr := p.API.SetProfileImage(session.UserId, pluginIconData); appErr != nil {
		p.LogError(appErr.Error())
	}

	if p.licenseChecker.RecordingsAllowed() && cfg.recordingsEnabled() {
		go func() {
			if err := p.initJobService(); err != nil {
				err = fmt.Errorf("failed to initialize job service: %w", err)
				p.LogError(err.Error())
				return
			}
			p.LogDebug("job service initialized successfully")
		}()
	}

	if rtcdURL := cfg.getRTCDURL(); rtcdURL != "" && p.licenseChecker.RTCDAllowed() {
		rtcdManager, err := p.newRTCDClientManager(rtcdURL)
		if err != nil {
			err = fmt.Errorf("failed to create rtcd manager: %w", err)
			p.LogError(err.Error())
			return err
		}

		p.LogDebug("rtcd client manager initialized successfully")

		p.rtcdManager = rtcdManager

		go p.clusterEventsHandler()

		p.LogDebug("activated", "ClusterID", status.ClusterId)

		return nil
	}

	rtcServerConfig := rtc.ServerConfig{
		ICEAddressUDP:   cfg.UDPServerAddress,
		ICEAddressTCP:   cfg.TCPServerAddress,
		ICEPortUDP:      *cfg.UDPServerPort,
		ICEPortTCP:      *cfg.TCPServerPort,
		ICEHostOverride: cfg.ICEHostOverride,
		ICEServers:      rtc.ICEServers(cfg.getICEServers(false)),
		TURNConfig: rtc.TURNConfig{
			CredentialsExpirationMinutes: *cfg.TURNCredentialsExpirationMinutes,
		},
		EnableIPv6: *cfg.EnableIPv6,
	}
	if *cfg.ServerSideTURN {
		rtcServerConfig.TURNConfig.StaticAuthSecret = cfg.TURNStaticAuthSecret
	}
	if cfg.ICEHostPortOverride != nil {
		rtcServerConfig.ICEHostPortOverride = rtc.ICEHostPortOverride(fmt.Sprintf("%d", *cfg.ICEHostPortOverride))
	}
	rtcServer, err := rtc.NewServer(rtcServerConfig, newLogger(p), p.metrics.RTCMetrics())
	if err != nil {
		p.LogError(err.Error())
		return err
	}

	if err := rtcServer.Start(); err != nil {
		p.LogError(err.Error())
		return err
	}

	p.mut.Lock()
	p.nodeID = status.ClusterId
	p.rtcServer = rtcServer
	p.mut.Unlock()

	go p.clusterEventsHandler()
	go p.wsWriter()

	p.LogDebug("activated", "ClusterID", status.ClusterId)

	return nil
}

func (p *Plugin) OnDeactivate() error {
	p.LogDebug("deactivate")
	close(p.stopCh)

	if err := p.store.Close(); err != nil {
		p.LogError(err.Error())
	}

	if p.rtcdManager != nil {
		if err := p.rtcdManager.Close(); err != nil {
			p.LogError(err.Error())
		}
	}

	if p.rtcServer != nil {
		if err := p.rtcServer.Stop(); err != nil {
			p.LogError(err.Error())
		}
	}

	if p.isSingleHandler() {
		if err := p.cleanUpState(); err != nil {
			p.LogError(err.Error())
		}
	}

	if err := p.unregisterCommands(); err != nil {
		p.LogError(err.Error())
	}

	if err := p.uninitTelemetry(); err != nil {
		p.LogError(err.Error())
	}

	if p.botSession != nil {
		if err := p.API.RevokeSession(p.botSession.Id); err != nil {
			p.LogError(err.Error())
		}
	}

	return nil
}
