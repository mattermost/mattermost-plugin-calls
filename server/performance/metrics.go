// Copyright (c) 2022-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package performance

import (
	"net/http"

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
	metricsSubSystemStore   = "store"
)

type Metrics struct {
	registry   *prometheus.Registry
	rtcMetrics *perf.Metrics

	WebSocketConnections             prometheus.Gauge
	WebSocketEventCounters           *prometheus.CounterVec
	ClusterEventCounters             *prometheus.CounterVec
	StoreOpCounters                  *prometheus.CounterVec
	ClusterMutexGrabTimeHistograms   *prometheus.HistogramVec
	ClusterMutexLockedTimeHistograms *prometheus.HistogramVec
	ClusterMutexLockRetriesCounters  *prometheus.CounterVec
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

	m.rtcMetrics = perf.NewMetrics(metricsNamespace, m.registry)

	return &m
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
