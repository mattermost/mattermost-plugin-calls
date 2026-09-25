// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"time"

	"golang.org/x/time/rate"

	"github.com/mattermost/mattermost-plugin-calls/server/batching"
	"github.com/mattermost/mattermost-plugin-calls/server/cluster"
	"github.com/mattermost/mattermost-plugin-calls/server/performance"

	"github.com/mattermost/mattermost/server/public/plugin"
)

var (
	isDebug   string
	buildHash string
)

func main() {
	p := &Plugin{
		stopCh:                 make(chan struct{}),
		sessions:               map[string]*session{},
		metrics:                performance.NewMetrics(),
		apiLimiters:            map[string]*rate.Limiter{},
		callsClusterLocks:      map[string]*cluster.Mutex{},
		addSessionsBatchers:    map[string]*batching.Batcher{},
		removeSessionsBatchers: map[string]*batching.Batcher{},
		dmNoAnswerTimers:       map[string]*time.Timer{},
		sipNoAnswerTimers:      map[string]*time.Timer{},
		dirtyCalls:             map[string]struct{}{},
		reconcilerSuspicions:   map[string]int{},
		dirtyCallsCh:           make(chan struct{}, 1),
	}
	p.apiRouter = p.newAPIRouter()
	plugin.ClientMain(p)
}
