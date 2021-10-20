package main

import (
	"github.com/mattermost/mattermost-server/v6/model"
)

func (p *Plugin) OnActivate() error {
	p.setConfigDefaults()

	status, appErr := p.API.GetPluginStatus(manifest.Id)
	if appErr != nil {
		p.LogError(appErr.Error())
		return appErr
	}
	p.mut.Lock()
	p.nodeID = status.ClusterId
	p.mut.Unlock()

	p.LogDebug("activate", "ClusterID", status.ClusterId)

	if err := p.cleanUpState(); err != nil {
		p.LogError(err.Error())
		return err
	}

	go p.clusterEventsHandler()

	return nil
}

func (p *Plugin) OnDeactivate() error {
	p.LogDebug("deactivate")
	p.API.PublishWebSocketEvent(wsEventDeactivate, nil, &model.WebsocketBroadcast{})
	close(p.stopCh)
	return nil
}
