package main

import (
	"net"
	"syscall"

	"github.com/mattermost/mattermost-server/v6/model"

	"github.com/pion/webrtc/v3"
)

func (p *Plugin) OnActivate() error {
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

	// Set size of UDP buffers.
	if err := udpServerConn.SetWriteBuffer(4194304); err != nil {
		p.LogError(err.Error())
		return err
	}

	if err := udpServerConn.SetReadBuffer(4194304); err != nil {
		p.LogError(err.Error())
		return err
	}
	connFile, err := udpServerConn.File()
	if err != nil {
		p.LogError(err.Error())
		return err
	}
	defer connFile.Close()
	writeBufSize, err := syscall.GetsockoptInt(int(connFile.Fd()), syscall.SOL_SOCKET, syscall.SO_SNDBUF)
	if err != nil {
		p.LogError(err.Error())
		return err
	}
	readBufSize, err := syscall.GetsockoptInt(int(connFile.Fd()), syscall.SOL_SOCKET, syscall.SO_RCVBUF)
	if err != nil {
		p.LogError(err.Error())
		return err
	}
	p.LogInfo("UDP buffers", "writeBufSize", writeBufSize, "readBufSize", readBufSize)

	hostIP, err := getPublicIP(udpServerConn, cfg.ICEServers)
	if err != nil {
		p.LogError(err.Error())
		return err
	}

	udpServerMux := webrtc.NewICEUDPMux(nil, udpServerConn)

	p.mut.Lock()
	p.nodeID = status.ClusterId
	p.udpServerMux = udpServerMux
	p.udpServerConn = udpServerConn
	p.hostIP = hostIP
	p.mut.Unlock()

	p.LogDebug("activate", "ClusterID", status.ClusterId, "HostIP", hostIP)

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

	// Purpusely not closing the UDP server connection here as it will cause
	// a deadlock (see https://go.dev/play/p/ywju17IO9ZZ).
	// The plugin's process will exit anyway so no need to explicitly do it here.

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
