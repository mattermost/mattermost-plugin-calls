// Copyright (c) 2022-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"context"
	"fmt"
	"time"

	"github.com/mattermost/mattermost-plugin-calls/server/cluster"
)

// lockCall locks the global (cluster) mutex for the given channelID and
// returns the current state.
func (p *Plugin) lockCall(channelID string) (*callState, error) {
	p.callsClusterLocksMut.Lock()
	mut := p.callsClusterLocks[channelID]
	if mut == nil {
		p.LogDebug("creating cluster mutex for call", "channelID", channelID)
		m, err := cluster.NewMutex(p.API, p.metrics, "call_"+channelID, cluster.MutexConfig{
			TTL:             4 * time.Second,
			RefreshInterval: 1 * time.Second,
			PollInterval:    50 * time.Millisecond,
			MetricsGroup:    "mutex_call",
		})
		if err != nil {
			p.callsClusterLocksMut.Unlock()
			return nil, fmt.Errorf("failed to create new call cluster mutex: %w", err)
		}
		p.callsClusterLocks[channelID] = m
		mut = m
	}
	p.callsClusterLocksMut.Unlock()

	lockCtx, cancelCtx := context.WithTimeout(context.Background(), lockTimeout)
	defer cancelCtx()

	if err := mut.Lock(lockCtx); err != nil {
		return nil, fmt.Errorf("failed to lock: %w", err)
	}

	state, err := p.getCallState(channelID, true)
	if err != nil {
		mut.Unlock()
		return nil, fmt.Errorf("failed to get channel state: %w", err)
	}

	return state, nil
}

// unlockCall unlocks the global (cluster) mutex for the given channelID.
func (p *Plugin) unlockCall(channelID string) {
	p.callsClusterLocksMut.RLock()
	defer p.callsClusterLocksMut.RUnlock()

	mut := p.callsClusterLocks[channelID]
	if mut == nil {
		p.LogError("call cluster mutex doesn't exist", "channelID", channelID)
		return
	}

	mut.Unlock()
}
