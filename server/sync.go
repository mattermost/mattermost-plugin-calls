// Copyright (c) 2022-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"context"
	"fmt"
	"time"

	"github.com/mattermost/mattermost-plugin-calls/server/cluster"
)

// lockCall locks the global (cluster) mutex for the given callID and
// returns the current state.
func (p *Plugin) lockCall(callID string) (*channelState, error) {
	p.mut.Lock()
	mut := p.callsClusterLocks[callID]
	if mut == nil {
		p.LogDebug("creating cluster mutex for call", "callID", callID)
		m, err := cluster.NewMutex(p.API, p.metrics, "call_"+callID, cluster.MutexConfig{
			TTL:             4 * time.Second,
			RefreshInterval: 1 * time.Second,
			PollInterval:    50 * time.Millisecond,
			MetricsGroup:    "mutex_call",
		})
		if err != nil {
			p.mut.Unlock()
			return nil, fmt.Errorf("failed to create new call cluster mutex: %w", err)
		}
		p.callsClusterLocks[callID] = m
		mut = m
	}
	p.mut.Unlock()

	lockCtx, cancelCtx := context.WithTimeout(context.Background(), lockTimeout)
	defer cancelCtx()

	if err := mut.Lock(lockCtx); err != nil {
		return nil, fmt.Errorf("failed to lock: %w", err)
	}

	state, err := p.kvGetChannelState(callID, true)
	if err != nil {
		mut.Unlock()
		return nil, fmt.Errorf("failed to get channel state: %w", err)
	}

	return state, nil
}

// unlockCall unlocks the global (cluster) mutex for the given callID.
func (p *Plugin) unlockCall(callID string) {
	p.mut.RLock()
	defer p.mut.RUnlock()

	mut := p.callsClusterLocks[callID]
	if mut == nil {
		p.LogError("call cluster mutex doesn't exist", "callID", callID)
		return
	}

	mut.Unlock()
}
