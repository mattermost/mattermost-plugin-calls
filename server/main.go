// Copyright (c) 2022-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"golang.org/x/time/rate"

	"github.com/mattermost/mattermost-plugin-calls/server/batching"
	"github.com/mattermost/mattermost-plugin-calls/server/cluster"
	"github.com/mattermost/mattermost-plugin-calls/server/performance"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/plugin"
)

var isDebug string
var buildHash string
var rudderWriteKey string
var rudderDataplaneURL string

// This value should be high enough to handle up to N events where N is the maximum
// expected number of concurrent user sessions in calls handled by a single
// instance.
const clusterEventQueueSize = 4096

func main() {
	p := &Plugin{
		stopCh:                 make(chan struct{}),
		clusterEvCh:            make(chan model.PluginClusterEvent, clusterEventQueueSize),
		sessions:               map[string]*session{},
		metrics:                performance.NewMetrics(),
		apiLimiters:            map[string]*rate.Limiter{},
		callsClusterLocks:      map[string]*cluster.Mutex{},
		addSessionsBatchers:    map[string]*batching.Batcher{},
		removeSessionsBatchers: map[string]*batching.Batcher{},
	}
	p.apiRouter = p.newAPIRouter()
	plugin.ClientMain(p)
}
