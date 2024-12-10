// Copyright (c) 2022-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"path/filepath"

	"github.com/pkg/errors"
	"gopkg.in/yaml.v3"

	"github.com/mattermost/mattermost-plugin-calls/server/public"
	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/plugin"
)

type SupportPacket struct {
	Version string `yaml:"version"`

	*public.CallsStats
}

func (p *Plugin) GenerateSupportData(_ *plugin.Context) ([]*model.FileData, error) {
	stats, err := p.store.GetCallsStats()
	if err != nil {
		return nil, errors.Wrap(err, "failed to get calls stats")
	}

	diagnostics := SupportPacket{
		Version:    manifest.Version,
		CallsStats: stats,
	}
	body, err := yaml.Marshal(diagnostics)
	if err != nil {
		return nil, errors.Wrap(err, "failed to marshal diagnostics")
	}

	return []*model.FileData{{
		Filename: filepath.Join(manifest.Id, "diagnostics.yaml"),
		Body:     body,
	}}, nil
}
