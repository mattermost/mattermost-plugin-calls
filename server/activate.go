package main

import (
	"fmt"
	"os"
	"strconv"
	"time"

	"github.com/mattermost/mattermost-plugin-calls/server/enterprise"

	"github.com/mattermost/rtcd/service/rtc"

	pluginapi "github.com/mattermost/mattermost-plugin-api"
)

func (p *Plugin) OnActivate() error {
	p.LogDebug("activating")

	if os.Getenv("MM_CALLS_DISABLE") == "true" {
		p.LogInfo("disable flag is set, exiting")
		return fmt.Errorf("disabled by environment flag")
	}

	maxPart := os.Getenv("MM_CALLS_CLOUD_MAX_PARTICIPANTS")
	if maxPart != "" {
		if max, err := strconv.Atoi(maxPart); err == nil {
			cloudMaxParticipants = max
		} else {
			p.LogError("activate", "MM_CALLS_CLOUD_MAX_PARTICIPANTS error during parsing:", err.Error())
		}
	}

	pluginAPIClient := pluginapi.NewClient(p.API, p.Driver)
	p.pluginAPI = pluginAPIClient
	p.licenseChecker = enterprise.NewLicenseChecker(pluginAPIClient)

	if err := p.cleanUpState(); err != nil {
		p.LogError(err.Error())
		return err
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

	if cfg.RTCDServiceURL != "" && p.licenseChecker.RTCDAllowed() {
		rtcdManager, err := p.newRTCDClientManager(cfg.RTCDServiceURL)
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

	if err := p.cleanUpState(); err != nil {
		p.LogError(err.Error())
	}

	if err := p.unregisterCommands(); err != nil {
		p.LogError(err.Error())
	}

	if err := p.uninitTelemetry(); err != nil {
		p.LogError(err.Error())
	}

	return nil
}
