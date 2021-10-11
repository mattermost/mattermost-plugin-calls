package performance

import (
	"net/http"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/collectors"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

const (
	metricsNamespace        = "mattermost_plugin_calls"
	metricsSubSystemWS      = "websocket"
	metricsSubSystemCluster = "cluster"
	metricsSubSystemStore   = "store"
	metricsSubSystemRTC     = "rtc"
)

type Metrics struct {
	registry *prometheus.Registry

	WebSocketConnections   *prometheus.GaugeVec
	WebSocketEventCounters *prometheus.CounterVec
	ClusterEventCounters   *prometheus.CounterVec
	StoreOpCounters        *prometheus.CounterVec
	RTPPacketCounters      *prometheus.CounterVec
	RTPPacketBytesCounters *prometheus.CounterVec
	RTCSessions            *prometheus.GaugeVec
	RTCConnStateCounters   *prometheus.CounterVec
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
		[]string{"channelID"},
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

	m.RTPPacketCounters = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Namespace: metricsNamespace,
			Subsystem: metricsSubSystemRTC,
			Name:      "rtp_packets_total",
			Help:      "Total number of sent/received RTP packets",
		},
		[]string{"direction", "type"},
	)
	m.registry.MustRegister(m.RTPPacketCounters)

	m.RTPPacketBytesCounters = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Namespace: metricsNamespace,
			Subsystem: metricsSubSystemRTC,
			Name:      "rtp_bytes_total",
			Help:      "Total number of sent/received RTP packet bytes",
		},
		[]string{"direction", "type"},
	)
	m.registry.MustRegister(m.RTPPacketBytesCounters)

	m.RTCSessions = prometheus.NewGaugeVec(
		prometheus.GaugeOpts{
			Namespace: metricsNamespace,
			Subsystem: metricsSubSystemRTC,
			Name:      "sessions_total",
			Help:      "Total number of active RTC sessions",
		},
		[]string{"channelID"},
	)
	m.registry.MustRegister(m.RTCSessions)

	m.RTCConnStateCounters = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Namespace: metricsNamespace,
			Subsystem: metricsSubSystemRTC,
			Name:      "conn_states_total",
			Help:      "Total number of RTC connection state changes",
		},
		[]string{"type"},
	)
	m.registry.MustRegister(m.RTCConnStateCounters)

	return &m
}

func (m *Metrics) Handler() http.Handler {
	return promhttp.HandlerFor(m.registry, promhttp.HandlerOpts{})
}
