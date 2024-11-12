// Copyright (c) 2022-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"path"

	"github.com/pkg/errors"
	"gopkg.in/yaml.v3"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/plugin"
)

type SupportPacket struct {
	Version string `yaml:"version"`
	// The total number calls.
	TotalCalls int64 `yaml:"total_calls"`
	// The total number of active calls.
	TotalActiveCalls int64 `yaml:"total_active_calls"`
	// The total number of active sessions.
	TotalActiveSessions int64 `yaml:"total_active_sessions"`
	// The average calls duration in seconds.
	AvgDuration int64 `yaml:"avg_duration"`
	// The average peak number of participants in calls.
	AvgParticipants int64 `yaml:"avg_participants"`
}

func (p *Plugin) GenerateSupportData(_ *plugin.Context) ([]*model.FileData, error) {
	stats, err := p.store.GetCallsStats()
	if err != nil {
		return nil, errors.Wrap(err, "Failed to get calls stats")
	}

	diagnostics := SupportPacket{
		Version:             manifest.Version,
		TotalCalls:          stats.TotalCalls,
		TotalActiveCalls:    stats.TotalCalls,
		TotalActiveSessions: stats.TotalActiveSessions,
		AvgDuration:         stats.AvgDuration,
		AvgParticipants:     stats.AvgParticipants,
	}
	b, err := yaml.Marshal(diagnostics)
	if err != nil {
		return nil, errors.Wrap(err, "Failed to marshal diagnostics")
	}

	return []*model.FileData{{
		Filename: path.Join(manifest.Id, "diagnostics.yaml"),
		Body:     b,
	}}, nil
}
