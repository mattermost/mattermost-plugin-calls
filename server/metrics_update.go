// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"github.com/mattermost/mattermost-plugin-calls/server/performance"
)

// runMetricsUpdateJob runs a periodic job to update historical metrics from the database
func (p *Plugin) runMetricsUpdateJob() {
	// Run immediately on startup
	p.updateHistoricalMetrics()

	// Then run periodically
	for range p.metricsUpdateTicker.C {
		p.updateHistoricalMetrics()
	}
}

// updateHistoricalMetrics fetches stats from the database and updates Prometheus gauges
func (p *Plugin) updateHistoricalMetrics() {
	// Type assert to get access to UpdateHistoricalMetrics method
	metricsImpl, ok := p.metrics.(*performance.Metrics)
	if !ok || metricsImpl == nil {
		return
	}

	// Get stats from database (reuse existing code from api.go)
	stats, err := p.store.GetCallsStats()
	if err != nil {
		p.LogError("Failed to get stats for metrics update", "error", err.Error())
		return
	}

	// Extract calls by day and month from stats
	callsByDay := stats.CallsByDay
	callsByMonth := stats.CallsByMonth

	// Update the metrics
	metricsImpl.UpdateHistoricalMetrics(stats, callsByDay, callsByMonth)

	p.LogDebug("Updated historical metrics", "total_calls", stats.TotalCalls, "daily_entries", len(callsByDay), "monthly_entries", len(callsByMonth))
}
