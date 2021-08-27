package main

import (
	"github.com/mattermost/mattermost-server/v5/model"
	"github.com/mattermost/mattermost-server/v5/plugin"
)

func main() {
	plugin.ClientMain(&Plugin{
		stopCh:      make(chan struct{}),
		clusterEvCh: make(chan model.PluginClusterEvent, 10),
		sessions:    map[string]*session{},
	})
}
