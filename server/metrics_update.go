// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"time"

	"github.com/mattermost/mattermost-plugin-calls/server/performance"
)

const metricsUpdateInterval = time.Hour

// runMetricsUpdateJob periodically refreshes the historical metrics from the DB.
// It stops when stopCh is closed.
func (p *Plugin) runMetricsUpdateJob() {
	ticker := time.NewTicker(metricsUpdateInterval)
	defer ticker.Stop()

	p.updateHistoricalMetrics()

	for {
		select {
		case <-ticker.C:
			p.updateHistoricalMetrics()
		case <-p.stopCh:
			return
		}
	}
}

func (p *Plugin) updateHistoricalMetrics() {
	m, ok := p.metrics.(*performance.Metrics)
	if !ok || m == nil {
		return
	}

	stats, err := p.store.GetCallsStats()
	if err != nil {
		p.LogError("failed to get stats for metrics update", "err", err.Error())
		return
	}

	m.UpdateHistoricalMetrics(stats)

	p.LogDebug("updated historical metrics", "totalCalls", stats.TotalCalls)
}
