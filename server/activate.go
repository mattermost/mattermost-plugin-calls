package main

import (
	"net"

	"github.com/mattermost/mattermost-server/v6/model"

	"github.com/pion/ice/v2"
	"github.com/pion/webrtc/v3"
)

func (p *Plugin) OnActivate() error {
	if err := p.OnConfigurationChange(); err != nil {
		p.LogError(err.Error())
		return err
	}

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

	udpServerConn, err := net.ListenUDP("udp4", &net.UDPAddr{
		Port: *cfg.UDPServerPort,
	})
	if err != nil {
		p.LogError(err.Error())
		return err
	}

	if err := udpServerConn.SetWriteBuffer(4194304); err != nil {
		p.LogError(err.Error())
		return err
	}

	if err := udpServerConn.SetReadBuffer(4194304); err != nil {
		p.LogError(err.Error())
		return err
	}

	publicIP := p.getConfiguration().PublicIPOverride
	if publicIP == "" {
		publicIP, err = getPublicIP(udpServerConn, cfg.ICEServers)
		if err != nil {
			p.LogError(err.Error())
			return err
		}
	}

	udpServerMux := webrtc.NewICEUDPMux(nil, udpServerConn)
	sEngine := webrtc.SettingEngine{}
	sEngine.SetICEMulticastDNSMode(ice.MulticastDNSModeDisabled)
	sEngine.SetNAT1To1IPs([]string{publicIP}, webrtc.ICECandidateTypeHost)
	sEngine.SetICEUDPMux(udpServerMux)

	p.mut.Lock()
	p.nodeID = status.ClusterId
	p.rtcSettingsEngine = sEngine
	p.udpServerMux = udpServerMux
	p.udpServerConn = udpServerConn
	p.mut.Unlock()

	p.LogDebug("activate", "ClusterID", status.ClusterId, "PublicIP", publicIP)

	go p.clusterEventsHandler()

	return nil
}

func (p *Plugin) OnDeactivate() error {
	p.LogDebug("deactivate")
	p.API.PublishWebSocketEvent(wsEventDeactivate, nil, &model.WebsocketBroadcast{})
	close(p.stopCh)

	if p.udpServerMux != nil {
		p.udpServerMux.Close()
	}

	if p.udpServerConn != nil {
		p.udpServerConn.Close()
	}

	if err := p.cleanUpState(); err != nil {
		p.LogError(err.Error())
		return err
	}

	if err := p.unregisterCommands(); err != nil {
		p.LogError(err.Error())
		return err
	}

	return nil
}
