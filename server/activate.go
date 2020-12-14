package main

func (p *Plugin) OnActivate() error {
	p.API.LogInfo("activate")
	return nil
}

func (p *Plugin) OnDeactivate() error {
	p.API.LogInfo("deactivate")
	close(p.stopCh)
	return nil
}
