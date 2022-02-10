package main

import (
	"github.com/mattermost/mattermost-plugin-calls/server/performance"

	"github.com/mattermost/mattermost-server/v6/model"
	"github.com/mattermost/mattermost-server/v6/plugin"
)

var isDebug string
var buildHash string
var rudderWriteKey string
var rudderDataplaneURL string

func main() {
	plugin.ClientMain(&Plugin{
		stopCh:      make(chan struct{}),
		clusterEvCh: make(chan model.PluginClusterEvent, 100),
		sessions:    map[string]*session{},
		calls:       map[string]*call{},
		metrics:     performance.NewMetrics(),
	})
}
