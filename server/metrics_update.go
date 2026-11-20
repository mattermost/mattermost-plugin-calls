// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"time"

	"github.com/mattermost/mattermost-plugin-calls/server/performance"
)

const (
	metricsUpdateInterval       = time.Hour
	activeMetricsUpdateInterval = time.Minute
)

// runMetricsUpdateJob periodically refreshes the metrics from the DB: the
// historical stats hourly and the active calls/sessions gauges every minute.
// It stops when stopCh is closed.
func (p *Plugin) runMetricsUpdateJob() {
	historicalTicker := time.NewTicker(metricsUpdateInterval)
	defer historicalTicker.Stop()
	activeTicker := time.NewTicker(activeMetricsUpdateInterval)
	defer activeTicker.Stop()

	p.updateHistoricalMetrics()

	for {
		select {
		case <-historicalTicker.C:
			p.updateHistoricalMetrics()
		case <-activeTicker.C:
			p.updateActiveMetrics()
		case <-p.stopCh:
			return
		}
	}
}

func (p *Plugin) updateActiveMetrics() {
	m, ok := p.metrics.(*performance.Metrics)
	if !ok || m == nil {
		return
	}

	activeCalls, err := p.store.GetTotalCalls(true)
	if err != nil {
		p.LogError("failed to get active calls for metrics update", "err", err.Error())
		return
	}

	activeSessions, err := p.store.GetTotalActiveSessions()
	if err != nil {
		p.LogError("failed to get active sessions for metrics update", "err", err.Error())
		return
	}

	m.UpdateActiveMetrics(activeCalls, activeSessions)
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
