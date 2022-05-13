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

	WebSocketConnections   *prometheus.GaugeVec
	WebSocketEventCounters *prometheus.CounterVec
	ClusterEventCounters   *prometheus.CounterVec
	StoreOpCounters        *prometheus.CounterVec
}

func NewMetrics() *Metrics {
	var m Metrics
	m.registry = prometheus.NewRegistry()

	m.registry.MustRegister(collectors.NewProcessCollector(collectors.ProcessCollectorOpts{
		Namespace: metricsNamespace,
	}))
	m.registry.MustRegister(collectors.NewGoCollector())

	m.WebSocketConnections = prometheus.NewGaugeVec(prometheus.GaugeOpts{
		Namespace: metricsNamespace,
		Subsystem: metricsSubSystemWS,
		Name:      "connections_total",
		Help:      "The total number of active WebSocket connections.",
	},
		[]string{"callID"},
	)
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

func (m *Metrics) IncWebSocketConn(callID string) {
	m.WebSocketConnections.With(prometheus.Labels{"callID": callID}).Inc()
}

func (m *Metrics) DecWebSocketConn(callID string) {
	m.WebSocketConnections.With(prometheus.Labels{"callID": callID}).Dec()
}

func (m *Metrics) IncClusterEvent(evType string) {
	m.ClusterEventCounters.With(prometheus.Labels{"type": evType}).Inc()
}

func (m *Metrics) IncStoreOp(op string) {
	m.StoreOpCounters.With(prometheus.Labels{"type": op}).Inc()
}
