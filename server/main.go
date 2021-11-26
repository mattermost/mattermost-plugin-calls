package main

import (
	"github.com/mattermost/mattermost-server/v5/plugin"
)

func main() {
	plugin.ClientMain(&Plugin{
		stopCh:   make(chan struct{}),
		sessions: map[string]*session{},
	})
}
