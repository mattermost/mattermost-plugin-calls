package public

type CallsStats struct {
	// The total number calls.
	TotalCalls int64 `json:"total_calls"`
	// The total number of active calls.
	TotalActiveCalls int64 `json:"total_active_calls"`
	// The total number of active sessions.
	TotalActiveSessions int64 `json:"total_active_sessions"`
	// The the number of daily calls in the last 30 days.
	CallsByDay map[string]int64 `json:"calls_by_day"`
	// The the number of monthly calls in the last 12 months.
	CallsByMonth map[string]int64 `json:"calls_by_month"`
	// The distribution of calls in different channel types.
	CallsByChannelType map[string]int64 `json:"calls_by_channel_type"`
	// The average calls duration in seconds.
	AvgDuration int64 `json:"avg_duration"`
	// The average peak number of participants in calls.
	AvgParticipants int64 `json:"avg_participants"`
}
