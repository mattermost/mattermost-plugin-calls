package main

func (p *Plugin) OnActivate() error {
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
	close(p.stopCh)
	return nil
}
