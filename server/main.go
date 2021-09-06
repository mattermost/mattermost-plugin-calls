package main

import (
	"github.com/mattermost/mattermost-server/v6/model"
	"github.com/mattermost/mattermost-server/v6/plugin"
)

var isDebug string

func main() {
	plugin.ClientMain(&Plugin{
		stopCh:      make(chan struct{}),
		clusterEvCh: make(chan model.PluginClusterEvent, 10),
		sessions:    map[string]*session{},
	})
}
