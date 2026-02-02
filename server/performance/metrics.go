// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package performance

import (
	"database/sql"
	"net/http"

	"github.com/mattermost/mattermost-plugin-calls/server/public"

	"github.com/mattermost/rtcd/service/perf"
	"github.com/mattermost/rtcd/service/rtc"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/collectors"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

const (
	metricsNamespace        = "mattermost_plugin_calls"
	metricsSubSystemWS      = "websocket"
	metricsSubSystemCluster = "cluster"
	metricsSubSystemApp     = "app"
	metricsSubSystemStore   = "store"
	metricsSubSystemJobs    = "jobs"
	metricsSubSystemClient  = "client"
)

type DBStore interface {
	WriterDB() *sql.DB
}

type Metrics struct {
	registry   *prometheus.Registry
	rtcMetrics *perf.Metrics

	WebSocketConnections             prometheus.Gauge
	WebSocketEventCounters           *prometheus.CounterVec
	ClusterEventCounters             *prometheus.CounterVec
	ClusterMutexGrabTimeHistograms   *prometheus.HistogramVec
	ClusterMutexLockedTimeHistograms *prometheus.HistogramVec
	ClusterMutexLockRetriesCounters  *prometheus.CounterVec

	AppHandlersTimeHistograms *prometheus.HistogramVec

	StoreOpCounters            *prometheus.CounterVec
	StoreMethodsTimeHistograms *prometheus.HistogramVec

	LiveCaptionsNewAudioLenHistogram       prometheus.Histogram
	LiveCaptionsWindowDroppedCounter       prometheus.Counter
	LiveCaptionsTranscriberBufFullCounter  prometheus.Counter
	LiveCaptionsPktPayloadChBufFullCounter prometheus.Counter

	ClientICECandidatePairsCounter *prometheus.CounterVec

	// Historical statistics gauges
	HistoricalDailyCallsGauge   *prometheus.GaugeVec
	HistoricalMonthlyCallsGauge *prometheus.GaugeVec
	CallsByChannelTypeGauge     *prometheus.GaugeVec
	AggregateStatsGauges        *prometheus.GaugeVec
}

func NewMetrics() *Metrics {
	var m Metrics
	m.registry = prometheus.NewRegistry()

	m.registry.MustRegister(collectors.NewProcessCollector(collectors.ProcessCollectorOpts{
		Namespace: metricsNamespace,
	}))
	m.registry.MustRegister(collectors.NewGoCollector())

	m.WebSocketConnections = prometheus.NewGauge(prometheus.GaugeOpts{
		Namespace: metricsNamespace,
		Subsystem: metricsSubSystemWS,
		Name:      "connections_total",
		Help:      "The total number of active WebSocket connections.",
	})
	m.registry.MustRegister(m.WebSocketConnections)

	m.WebSocketEventCounters = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Namespace: metricsNamespace,
			Subsystem: metricsSubSystemWS,
			Name:      "events_total",
			Help:      "Total number of sent/received WebSocket events",
		},
		[]string{"direction", "type"},
	)
	m.registry.MustRegister(m.WebSocketEventCounters)

	m.ClusterEventCounters = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Namespace: metricsNamespace,
			Subsystem: metricsSubSystemCluster,
			Name:      "events_total",
			Help:      "Total number of intra cluster events sent",
		},
		[]string{"type"},
	)
	m.registry.MustRegister(m.ClusterEventCounters)

	m.StoreOpCounters = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Namespace: metricsNamespace,
			Subsystem: metricsSubSystemStore,
			Name:      "ops_total",
			Help:      "Total number of store operations",
		},
		[]string{"type"},
	)
	m.registry.MustRegister(m.StoreOpCounters)

	m.ClusterMutexGrabTimeHistograms = prometheus.NewHistogramVec(
		prometheus.HistogramOpts{
			Namespace: metricsNamespace,
			Subsystem: metricsSubSystemCluster,
			Name:      "mutex_grab_time",
			Help:      "Time to grab locks",
		},
		[]string{"group"},
	)
	m.registry.MustRegister(m.ClusterMutexGrabTimeHistograms)

	m.ClusterMutexLockedTimeHistograms = prometheus.NewHistogramVec(
		prometheus.HistogramOpts{
			Namespace: metricsNamespace,
			Subsystem: metricsSubSystemCluster,
			Name:      "mutex_locked_time",
			Help:      "Time locked",
		},
		[]string{"group"},
	)
	m.registry.MustRegister(m.ClusterMutexLockedTimeHistograms)

	m.ClusterMutexLockRetriesCounters = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Namespace: metricsNamespace,
			Subsystem: metricsSubSystemCluster,
			Name:      "mutex_lock_retries_total",
			Help:      "Total number of cluster mutex lock retries",
		},
		[]string{"group"},
	)
	m.registry.MustRegister(m.ClusterMutexLockRetriesCounters)

	m.LiveCaptionsNewAudioLenHistogram = prometheus.NewHistogram(
		prometheus.HistogramOpts{
			Namespace: metricsNamespace,
			Subsystem: metricsSubSystemJobs,
			Name:      "live_captions_new_audio_len_ms",
			Help:      "Length (in ms) of new audio transcribed for live captions",
			Buckets:   prometheus.LinearBuckets(2000, 2000, 4),
		},
	)
	m.registry.MustRegister(m.LiveCaptionsNewAudioLenHistogram)

	m.LiveCaptionsWindowDroppedCounter = prometheus.NewCounter(
		prometheus.CounterOpts{
			Namespace: metricsNamespace,
			Subsystem: metricsSubSystemJobs,
			Name:      "live_captions_window_dropped",
			Help:      "Dropped a window of audio data due to pressure on the transcriber",
		})
	m.registry.MustRegister(m.LiveCaptionsWindowDroppedCounter)

	m.LiveCaptionsTranscriberBufFullCounter = prometheus.NewCounter(
		prometheus.CounterOpts{
			Namespace: metricsNamespace,
			Subsystem: metricsSubSystemJobs,
			Name:      "live_captions_transcriber_buf_full",
			Help:      "Dropped a package of audio data due to the transcriber buffer full",
		})
	m.registry.MustRegister(m.LiveCaptionsTranscriberBufFullCounter)

	m.LiveCaptionsPktPayloadChBufFullCounter = prometheus.NewCounter(
		prometheus.CounterOpts{
			Namespace: metricsNamespace,
			Subsystem: metricsSubSystemJobs,
			Name:      "live_captions_pktPayloadCh_buf_full",
			Help:      "Dropped a package of audio data due to the pktPayloadCh buffer full",
		})
	m.registry.MustRegister(m.LiveCaptionsPktPayloadChBufFullCounter)

	m.AppHandlersTimeHistograms = prometheus.NewHistogramVec(
		prometheus.HistogramOpts{
			Namespace: metricsNamespace,
			Subsystem: metricsSubSystemApp,
			Name:      "handlers_time",
			Help:      "Time to execute app handlers",
		},
		[]string{"handler"},
	)
	m.registry.MustRegister(m.AppHandlersTimeHistograms)

	m.StoreMethodsTimeHistograms = prometheus.NewHistogramVec(
		prometheus.HistogramOpts{
			Namespace: metricsNamespace,
			Subsystem: metricsSubSystemStore,
			Name:      "methods_time",
			Help:      "Time to execute store methods",
		},
		[]string{"method"},
	)
	m.registry.MustRegister(m.StoreMethodsTimeHistograms)

	m.ClientICECandidatePairsCounter = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Namespace: metricsNamespace,
			Subsystem: metricsSubSystemClient,
			Name:      "ice_candidate_pairs_total",
			Help:      "Total number of client-sent ICE candidate pairs",
		},
		[]string{"state", "local_type", "local_protocol", "remote_type", "remote_protocol"},
	)
	m.registry.MustRegister(m.ClientICECandidatePairsCounter)

	// Historical statistics gauges
	m.HistoricalDailyCallsGauge = prometheus.NewGaugeVec(
		prometheus.GaugeOpts{
			Namespace: metricsNamespace,
			Name:      "daily_calls_total",
			Help:      "Total number of calls per day (last 30 days)",
		},
		[]string{"date"},
	)
	m.registry.MustRegister(m.HistoricalDailyCallsGauge)

	m.HistoricalMonthlyCallsGauge = prometheus.NewGaugeVec(
		prometheus.GaugeOpts{
			Namespace: metricsNamespace,
			Name:      "monthly_calls_total",
			Help:      "Total number of calls per month",
		},
		[]string{"month"},
	)
	m.registry.MustRegister(m.HistoricalMonthlyCallsGauge)

	m.CallsByChannelTypeGauge = prometheus.NewGaugeVec(
		prometheus.GaugeOpts{
			Namespace: metricsNamespace,
			Name:      "calls_by_channel_type",
			Help:      "Total calls by channel type (public, private, direct, group)",
		},
		[]string{"type"},
	)
	m.registry.MustRegister(m.CallsByChannelTypeGauge)

	m.AggregateStatsGauges = prometheus.NewGaugeVec(
		prometheus.GaugeOpts{
			Namespace: metricsNamespace,
			Name:      "aggregate_stats",
			Help:      "Aggregate statistics (avg_duration, avg_participants, etc)",
		},
		[]string{"stat"},
	)
	m.registry.MustRegister(m.AggregateStatsGauges)

	m.rtcMetrics = perf.NewMetrics(metricsNamespace, m.registry)

	return &m
}

func (m *Metrics) RegisterDBMetrics(db *sql.DB, name string) {
	m.registry.MustRegister(collectors.NewDBStatsCollector(db, name))
}

func (m *Metrics) RTCMetrics() rtc.Metrics {
	return m.rtcMetrics
}

func (m *Metrics) Handler() http.Handler {
	return promhttp.HandlerFor(m.registry, promhttp.HandlerOpts{})
}

func (m *Metrics) IncWebSocketEvent(direction, evType string) {
	m.WebSocketEventCounters.With(prometheus.Labels{"direction": direction, "type": evType}).Inc()
}

func (m *Metrics) IncWebSocketConn() {
	m.WebSocketConnections.Inc()
}

func (m *Metrics) DecWebSocketConn() {
	m.WebSocketConnections.Dec()
}

func (m *Metrics) IncClusterEvent(evType string) {
	m.ClusterEventCounters.With(prometheus.Labels{"type": evType}).Inc()
}

func (m *Metrics) IncStoreOp(op string) {
	m.StoreOpCounters.With(prometheus.Labels{"type": op}).Inc()
}

func (m *Metrics) ObserveClusterMutexGrabTime(group string, elapsed float64) {
	m.ClusterMutexGrabTimeHistograms.With(prometheus.Labels{"group": group}).Observe(elapsed)
}

func (m *Metrics) ObserveClusterMutexLockedTime(group string, elapsed float64) {
	m.ClusterMutexLockedTimeHistograms.With(prometheus.Labels{"group": group}).Observe(elapsed)
}

func (m *Metrics) IncClusterMutexLockRetries(group string) {
	m.ClusterMutexLockRetriesCounters.With(prometheus.Labels{"group": group}).Inc()
}

func (m *Metrics) ObserveLiveCaptionsAudioLen(elapsed float64) {
	m.LiveCaptionsNewAudioLenHistogram.Observe(elapsed)
}

func (m *Metrics) IncLiveCaptionsWindowDropped() {
	m.LiveCaptionsWindowDroppedCounter.Inc()
}

func (m *Metrics) IncLiveCaptionsTranscriberBufFull() {
	m.LiveCaptionsTranscriberBufFullCounter.Inc()
}

func (m *Metrics) IncLiveCaptionsPktPayloadChBufFull() {
	m.LiveCaptionsPktPayloadChBufFullCounter.Inc()
}

func (m *Metrics) ObserveAppHandlersTime(handler string, elapsed float64) {
	m.AppHandlersTimeHistograms.With(prometheus.Labels{"handler": handler}).Observe(elapsed)
}

func (m *Metrics) ObserveStoreMethodsTime(method string, elapsed float64) {
	m.StoreMethodsTimeHistograms.With(prometheus.Labels{"method": method}).Observe(elapsed)
}

func (m *Metrics) IncClientICECandidatePairs(p public.ClientICECandidatePairMetricPayload) {
	m.ClientICECandidatePairsCounter.With(prometheus.Labels{
		"state":           p.State,
		"local_type":      p.Local.Type,
		"local_protocol":  p.Local.Protocol,
		"remote_type":     p.Remote.Type,
		"remote_protocol": p.Remote.Protocol,
	}).Inc()
}

// UpdateHistoricalMetrics updates the historical statistics gauges with data from the database
func (m *Metrics) UpdateHistoricalMetrics(stats *public.CallsStats, callsByDay, callsByMonth map[string]int64) {
	// Reset gauges before updating to remove old dates
	m.HistoricalDailyCallsGauge.Reset()
	m.HistoricalMonthlyCallsGauge.Reset()

	// Update daily metrics (last 30 days) - shorten date format from YYYY-MM-DD to MM-DD
	for date, count := range callsByDay {
		shortDate := date
		if len(date) == 10 && date[4] == '-' {
			shortDate = date[5:] // Extract MM-DD from YYYY-MM-DD
		}
		m.HistoricalDailyCallsGauge.With(prometheus.Labels{"date": shortDate}).Set(float64(count))
	}

	// Update monthly metrics - shorten from YYYY-MM to MM
	for month, count := range callsByMonth {
		shortMonth := month
		if len(month) == 7 && month[4] == '-' {
			shortMonth = month[5:] // Extract MM from YYYY-MM
		}
		m.HistoricalMonthlyCallsGauge.With(prometheus.Labels{"month": shortMonth}).Set(float64(count))
	}

	// Update channel type distribution
	for channelType, count := range stats.CallsByChannelType {
		typeLabel := channelTypeToLabel(channelType)
		m.CallsByChannelTypeGauge.With(prometheus.Labels{"type": typeLabel}).Set(float64(count))
	}

	// Update aggregate stats
	m.AggregateStatsGauges.With(prometheus.Labels{"stat": "total_calls"}).Set(float64(stats.TotalCalls))
	m.AggregateStatsGauges.With(prometheus.Labels{"stat": "total_active_calls"}).Set(float64(stats.TotalActiveCalls))
	m.AggregateStatsGauges.With(prometheus.Labels{"stat": "total_active_sessions"}).Set(float64(stats.TotalActiveSessions))
	m.AggregateStatsGauges.With(prometheus.Labels{"stat": "avg_duration_seconds"}).Set(float64(stats.AvgDuration))
	m.AggregateStatsGauges.With(prometheus.Labels{"stat": "avg_participants"}).Set(float64(stats.AvgParticipants))
	m.AggregateStatsGauges.With(prometheus.Labels{"stat": "avg_video_duration_seconds"}).Set(float64(stats.AvgVideoDuration))
	m.AggregateStatsGauges.With(prometheus.Labels{"stat": "total_video_duration_seconds"}).Set(float64(stats.TotalVideoDuration))
	m.AggregateStatsGauges.With(prometheus.Labels{"stat": "total_video_calls"}).Set(float64(stats.TotalVideoCalls))
	m.AggregateStatsGauges.With(prometheus.Labels{"stat": "total_screen_share_calls"}).Set(float64(stats.TotalScreenShareCalls))
}

func channelTypeToLabel(t string) string {
	switch t {
	case "O":
		return "public"
	case "P":
		return "private"
	case "D":
		return "direct"
	case "G":
		return "group"
	default:
		return "unknown"
	}
}
