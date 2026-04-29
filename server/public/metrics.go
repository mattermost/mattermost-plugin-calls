// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package public

type MetricName string

const (
	MetricLiveCaptionsWindowDropped       MetricName = "live_captions_window_dropped"
	MetricLiveCaptionsTranscriberBufFull  MetricName = "live_captions_transcriber_buf_full"
	MetricLiveCaptionsPktPayloadChBufFull MetricName = "live_captions_pktPayloadCh_buf_full"
)

type MetricMsg struct {
	SessionID  string     `json:"session_id"`
	MetricName MetricName `json:"metric_name"`
}
