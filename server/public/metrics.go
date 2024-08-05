package public

import (
	"fmt"
)

type MetricName string

const (
	MetricLiveCaptionsWindowDropped       MetricName = "live_captions_window_dropped"
	MetricLiveCaptionsTranscriberBufFull  MetricName = "live_captions_transcriber_buf_full"
	MetricLiveCaptionsPktPayloadChBufFull MetricName = "live_captions_pktPayloadCh_buf_full"

	MetricClientICECandidatePair MetricName = "client_ice_candidate_pair"
)

type MetricMsg struct {
	SessionID  string     `json:"session_id"`
	MetricName MetricName `json:"metric_name"`
}

type ICECandidateInfo struct {
	Type     string `json:"type"`
	Protocol string `json:"protocol"`
}

func (i ICECandidateInfo) IsValid() error {
	switch i.Type {
	case "host", "srflx", "prflx", "relay":
	default:
		return fmt.Errorf("invalid type %q", i.Type)
	}

	switch i.Protocol {
	case "udp", "tcp":
	default:
		return fmt.Errorf("invalid protocol %q", i.Protocol)
	}

	return nil
}

type ClientICECandidatePairMetricPayload struct {
	State  string           `json:"state"`
	Local  ICECandidateInfo `json:"local"`
	Remote ICECandidateInfo `json:"remote"`
}

func (c ClientICECandidatePairMetricPayload) IsValid() error {
	switch c.State {
	case "succeeded", "waiting", "in-progress", "froze", "failed":
	default:
		return fmt.Errorf("invalid state %q", c.State)
	}

	if err := c.Local.IsValid(); err != nil {
		return fmt.Errorf("invalid local candidate info: %w", err)
	}

	if err := c.Remote.IsValid(); err != nil {
		return fmt.Errorf("invalid remote candidate info: %w", err)
	}

	return nil
}
