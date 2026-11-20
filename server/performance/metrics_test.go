// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package performance

import (
	"testing"

	"github.com/mattermost/mattermost-plugin-calls/server/public"

	"github.com/prometheus/client_golang/prometheus/testutil"
	"github.com/stretchr/testify/require"
)

func TestUpdateHistoricalMetrics(t *testing.T) {
	m := NewMetrics()

	m.UpdateHistoricalMetrics(&public.CallsStats{
		TotalCalls:         10,
		TotalVideoCalls:    0,
		CallsByDay:         map[string]int64{"2026-11-19": 3},
		CallsByMonth:       map[string]int64{"2026-11": 7},
		CallsByChannelType: map[string]int64{"O": 4, "D": 6},
	})

	require.Equal(t, 10.0, testutil.ToFloat64(m.AggregateStatsGauges.WithLabelValues("total_calls")))
	require.Zero(t, testutil.ToFloat64(m.AggregateStatsGauges.WithLabelValues("total_video_calls")))
	require.Equal(t, 3.0, testutil.ToFloat64(m.HistoricalDailyCallsGauge.WithLabelValues("2026-11-19")))
	require.Equal(t, 7.0, testutil.ToFloat64(m.HistoricalMonthlyCallsGauge.WithLabelValues("2026-11")))
	require.Equal(t, 4.0, testutil.ToFloat64(m.CallsByChannelTypeGauge.WithLabelValues("public")))
	require.Equal(t, 6.0, testutil.ToFloat64(m.CallsByChannelTypeGauge.WithLabelValues("direct")))

	// Aged-out dates must not linger.
	m.UpdateHistoricalMetrics(&public.CallsStats{CallsByDay: map[string]int64{"2026-11-20": 1}})
	require.Equal(t, 1, testutil.CollectAndCount(m.HistoricalDailyCallsGauge))
}
