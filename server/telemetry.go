package main

import (
	"github.com/mattermost/mattermost-plugin-calls/server/telemetry"
)

const (
	evCallStarted     = "call_started"
	evCallEnded       = "call_ended"
	evCallUserJoined  = "call_user_joined"
	evCallUserLeft    = "call_user_left"
	evCallNotifyAdmin = "call_notify_admin"
)

func (p *Plugin) track(ev string, props map[string]interface{}) {
	p.mut.RLock()
	defer p.mut.RUnlock()
	if p.telemetry == nil {
		return
	}
	if err := p.telemetry.Track(ev, props); err != nil {
		p.LogError(err.Error())
	}
}

func (p *Plugin) uninitTelemetry() error {
	p.mut.Lock()
	defer p.mut.Unlock()
	if p.telemetry == nil {
		return nil
	}
	if err := p.telemetry.Close(); err != nil {
		return err
	}
	return nil
}

func (p *Plugin) initTelemetry(enableDiagnostics *bool) error {
	p.mut.Lock()
	defer p.mut.Unlock()
	if p.telemetry == nil && enableDiagnostics != nil && *enableDiagnostics {
		p.LogDebug("Initializing telemetry")
		// setup telemetry
		client, err := telemetry.NewClient(telemetry.ClientConfig{
			WriteKey:     rudderWriteKey,
			DataplaneURL: rudderDataplaneURL,
			DiagnosticID: p.API.GetDiagnosticId(),
			DefaultProps: map[string]interface{}{
				"ServerVersion": p.API.GetServerVersion(),
				"PluginVersion": manifest.Version,
				"PluginBuild":   buildHash,
			},
		})
		if err != nil {
			return err
		}
		p.telemetry = client
	} else if p.telemetry != nil && (enableDiagnostics == nil || !*enableDiagnostics) {
		p.LogDebug("Deinitializing telemetry")
		// destroy telemetry
		if err := p.telemetry.Close(); err != nil {
			return err
		}
		p.telemetry = nil
	}
	return nil
}
