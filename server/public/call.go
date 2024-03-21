package public

type Call struct {
	ID           string      `json:"id"`
	ChannelID    string      `json:"channel_id"`
	StartAt      int64       `json:"start_at"`
	EndAt        int64       `json:"end_at"`
	CreateAt     int64       `json:"create_at"`
	DeleteAt     int64       `json:"delete_at"`
	Title        string      `json:"title"`
	PostID       string      `json:"post_id"`
	ThreadID     string      `json:"thread_id"`
	OwnerID      string      `json:"owner_id"`
	Participants StringArray `json:"participants"`
	Stats        CallStats   `json:"stats"`
	Props        CallProps   `json:"props"`
}

type CallProps struct {
	Hosts                  []string        `json:"hosts,omitempty"`
	RTCDHost               string          `json:"rtcd_host,omitempty"`
	ScreenSharingSessionID string          `json:"screen_sharing_session_id,omitempty"`
	DismissedNotification  map[string]bool `json:"dismissed_notification,omitempty"`
}

type CallStats struct {
	ScreenDuration int `json:"screen_duration,omitempty"`
}
