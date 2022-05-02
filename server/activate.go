package main

import (
	"fmt"
	"os"
	"time"

	"github.com/mattermost/rtcd/logger"
	"github.com/mattermost/rtcd/service/rtc"

	pluginapi "github.com/mattermost/mattermost-plugin-api"
	"github.com/mattermost/mattermost-server/v6/model"
)

func (p *Plugin) OnActivate() error {
	p.LogDebug("activating")

	pluginAPIClient := pluginapi.NewClient(p.API, p.Driver)
	p.pluginAPI = pluginAPIClient

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

	if cfg.RTCDServiceURL != "" {
		client, err := p.newRTCDClient(cfg.RTCDServiceURL)
		if err != nil {
			err = fmt.Errorf("failed to create rtcd client: %w", err)
			p.LogError(err.Error())
			return err
		}

		p.LogDebug("rtcd client connected successfully")

		p.rtcdClient = client
		go func() {
			for err := range p.rtcdClient.ErrorCh() {
				p.LogError(err.Error())
			}
		}()
	} else {
		if os.Getenv("CALLS_IS_HANDLER") != "" {
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

		var err error
		publicHost := cfg.ICEHostOverride
		if publicHost == "" {
			publicHost, err = getPublicIP(*cfg.UDPServerPort, cfg.ICEServers)
			if err != nil {
				p.LogError(err.Error())
				return err
			}
		}

		log, err := logger.New(logger.Config{
			EnableConsole: true,
			ConsoleLevel:  "DEBUG",
		})
		if err != nil {
			p.LogError(err.Error())
			return err
		}

		rtcServer, err := rtc.NewServer(rtc.ServerConfig{
			ICEPortUDP:      *cfg.UDPServerPort,
			ICEHostOverride: publicHost,
		}, log, p.metrics.RTCMetrics())
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
		p.hostIP = publicHost
		p.log = log
		p.mut.Unlock()

		go p.clusterEventsHandler()

		p.LogDebug("activate", "ClusterID", status.ClusterId, "publicHost", publicHost)
	}

	go p.wsWriter()

	p.LogDebug("activated")

	return nil
}

func (p *Plugin) OnDeactivate() error {
	p.LogDebug("deactivate")
	p.API.PublishWebSocketEvent(wsEventDeactivate, nil, &model.WebsocketBroadcast{ReliableClusterSend: true})
	close(p.stopCh)

	if p.rtcdClient != nil {
		if err := p.rtcdClient.Close(); err != nil {
			p.LogError(err.Error())
		}
	}

	if p.rtcServer != nil {
		if err := p.rtcServer.Stop(); err != nil {
			p.LogError(err.Error())
		}
	}

	if p.log != nil {
		if err := p.log.Shutdown(); err != nil {
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
