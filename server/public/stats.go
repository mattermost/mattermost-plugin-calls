// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package public

type CallsStats struct {
	// The total number calls.
	TotalCalls int64 `json:"total_calls" yaml:"total_calls"`
	// The total number of active calls.
	TotalActiveCalls int64 `json:"total_active_calls" yaml:"total_active_calls"`
	// The total number of active sessions.
	TotalActiveSessions int64 `json:"total_active_sessions" yaml:"total_active_sessions"`
	// The number of daily calls in the last 30 days.
	CallsByDay map[string]int64 `json:"calls_by_day" yaml:"-"`
	// The number of monthly calls in the last 12 months.
	CallsByMonth map[string]int64 `json:"calls_by_month" yaml:"-"`
	// The distribution of calls in different channel types.
	CallsByChannelType map[string]int64 `json:"calls_by_channel_type" yaml:"-"`
	// The average calls duration in seconds.
	AvgDuration int64 `json:"avg_duration" yaml:"avg_duration"`
	// The average peak number of participants in calls.
	AvgParticipants int64 `json:"avg_participants" yaml:"avg_participants"`
	// The average video duration in seconds across all calls.
	AvgVideoDuration int64 `json:"avg_video_duration" yaml:"avg_video_duration"`
	// The total accumulated video duration in seconds across all calls.
	TotalVideoDuration int64 `json:"total_video_duration" yaml:"total_video_duration"`
	// The total number of calls that had video enabled at least once.
	TotalVideoCalls int64 `json:"total_video_calls" yaml:"total_video_calls"`
	// The total number of calls that had screen sharing enabled at least once.
	TotalScreenShareCalls int64 `json:"total_screen_share_calls" yaml:"total_screen_share_calls"`
	// The number of daily recording jobs in the last 30 days.
	RecordingJobsByDay map[string]int64 `json:"recording_jobs_by_day" yaml:"-"`
	// The number of monthly recording jobs in the last 12 months.
	RecordingJobsByMonth map[string]int64 `json:"recording_jobs_by_month" yaml:"-"`
}
