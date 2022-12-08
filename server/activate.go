// Copyright (c) 2022-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"fmt"
	"os"
	"time"

	"github.com/mattermost/mattermost-plugin-calls/server/enterprise"

	"github.com/mattermost/rtcd/service/rtc"

	pluginapi "github.com/mattermost/mattermost-plugin-api"
	"github.com/mattermost/mattermost-server/v6/model"
)

func (p *Plugin) createBotSession() (*model.Session, error) {
	botID, err := p.pluginAPI.Bot.EnsureBot(&model.Bot{
		Username:    "calls",
		DisplayName: "Calls",
		Description: "Calls Bot",
		OwnerId:     manifest.Id,
	})
	if err != nil {
		return nil, err
	}

	session := &model.Session{
		UserId:    botID,
		ExpiresAt: 0,
	}

	session, err = p.pluginAPI.Session.Create(session)
	if err != nil {
		return nil, err
	}

	return session, nil
}

func (p *Plugin) OnActivate() error {
	p.LogDebug("activating")

	if os.Getenv("MM_CALLS_DISABLE") == "true" {
		p.LogInfo("disable flag is set, exiting")
		return fmt.Errorf("disabled by environment flag")
	}

	pluginAPIClient := pluginapi.NewClient(p.API, p.Driver)
	p.pluginAPI = pluginAPIClient
	p.licenseChecker = enterprise.NewLicenseChecker(pluginAPIClient)

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

	cfg := p.getConfiguration()
	if err := cfg.IsValid(); err != nil {
		p.LogError(err.Error())
		return err
	}

	// On Cloud installations we want calls enabled in all channels so we
	// override it since the plugin's default is now false.
	if isCloud(p.pluginAPI.System.GetLicense()) {
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

	if p.licenseChecker.RecordingsAllowed() && cfg.recordingsEnabled() {
		p.jobService, err = p.newJobService(cfg.getJobServiceURL())
		if err != nil {
			err = fmt.Errorf("failed to create job service: %w", err)
			p.LogError(err.Error())
			return err
		}

		p.LogDebug("job service initialized successfully")
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

	if os.Getenv("MM_CALLS_IS_HANDLER") != "" {
		go func() {
			p.LogInfo("calls handler, setting state", "clusterID", status.ClusterId)
			if err := p.setHandlerID(status.ClusterId); err != nil {
				p.LogError(err.Error())
				return
			}
			ticker := time.NewTicker(handlerKeyCheckInterval)
			defer ticker.Stop()
			for {
				select {
				case <-ticker.C:
					if err := p.setHandlerID(status.ClusterId); err != nil {
						p.LogError(err.Error())
						return
					}
				case <-p.stopCh:
					return
				}
			}
		}()
	}

	rtcServerConfig := rtc.ServerConfig{
		ICEPortUDP:      *cfg.UDPServerPort,
		ICEHostOverride: cfg.ICEHostOverride,
		ICEServers:      rtc.ICEServers(cfg.getICEServers(false)),
		TURNConfig: rtc.TURNConfig{
			CredentialsExpirationMinutes: *cfg.TURNCredentialsExpirationMinutes,
		},
	}
	if *cfg.ServerSideTURN {
		rtcServerConfig.TURNConfig.StaticAuthSecret = cfg.TURNStaticAuthSecret
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
