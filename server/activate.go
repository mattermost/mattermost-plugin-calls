// Copyright (c) 2022-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"fmt"
	"os"
	"time"

	"github.com/pkg/errors"

	"github.com/mattermost/mattermost-plugin-calls/server/enterprise"

	"github.com/mattermost/rtcd/service/rtc"

	fbClient "github.com/mattermost/focalboard/server/client"
	pluginapi "github.com/mattermost/mattermost-plugin-api"

	"github.com/mattermost/mattermost-server/v6/model"
)

func (p *Plugin) OnActivate() error {
	p.LogDebug("activating")

	if os.Getenv("MM_CALLS_DISABLE") == "true" {
		p.LogInfo("disable flag is set, exiting")
		return fmt.Errorf("disabled by environment flag")
	}

	pluginAPIClient := pluginapi.NewClient(p.API, p.Driver)
	p.pluginAPI = pluginAPIClient
	p.licenseChecker = enterprise.NewLicenseChecker(pluginAPIClient)

	if !p.isHAEnabled() {
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

	if rtcdURL := cfg.getRTCDURL(); rtcdURL != "" && p.licenseChecker.RTCDAllowed() {
		rtcdManager, err := p.newRTCDClientManager(rtcdURL)
		if err != nil {
			err = fmt.Errorf("failed to create rtcd manager: %w", err)
			p.LogError(err.Error())
			return err
		}

		p.LogDebug("rtcd client manager initialized successfully")

		p.rtcdManager = rtcdManager

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

	rtcServer, err := rtc.NewServer(rtc.ServerConfig{
		ICEPortUDP:      *cfg.UDPServerPort,
		ICEHostOverride: cfg.ICEHostOverride,
		ICEServers:      cfg.ICEServers,
	}, newLogger(p), p.metrics.RTCMetrics())
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

	botID, err := pluginAPIClient.Bot.EnsureBot(&model.Bot{
		Username:    "calls",
		DisplayName: "Calls Plugin Bot",
		Description: "Created by the Calls plugin.",
	})
	if err != nil {
		return errors.Wrap(err, "failed to ensure calls bot")
	}
	token := ""
	rawToken, appErr := p.API.KVGet(BotTokenKey)
	if appErr != nil {
		return errors.Wrap(appErr, "failed to get stored bot access token")
	}

	if rawToken == nil {
		accessToken, appErr := p.API.CreateUserAccessToken(&model.UserAccessToken{UserId: botID, Description: "For agenda plugin access to focalboard REST API"})
		if appErr != nil {
			return errors.Wrap(appErr, "failed to create access token for bot")
		}
		token = accessToken.Token
		appErr = p.API.KVSet(BotTokenKey, []byte(token))
		if appErr != nil {
			return errors.Wrap(appErr, "failed to store bot access token")
		}
		p.API.LogDebug("created access token for bot")
	} else {
		token = string(rawToken)
	}

	client := fbClient.NewClient("http://localhost:8065/plugins/focalboard", token)
	p.fbStore = NewFocalboardStore(p.API, client)

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

	if !p.isHAEnabled() {
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

	return nil
}
