package public

import (
	"fmt"
)

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

func (c *Call) IsValid() error {
	if c == nil {
		return fmt.Errorf("should not be nil")
	}

	if c.ID == "" {
		return fmt.Errorf("invalid ID: should not be empty")
	}

	if c.ChannelID == "" {
		return fmt.Errorf("invalid ChannelID: should not be empty")
	}

	if c.StartAt == 0 {
		return fmt.Errorf("invalid StartAt: should be > 0")
	}

	if c.CreateAt == 0 {
		return fmt.Errorf("invalid CreateAt: should be > 0")
	}

	if c.DeleteAt != 0 {
		return fmt.Errorf("invalid DeleteAt: should be zero")
	}

	if c.PostID == "" {
		return fmt.Errorf("invalid PostID: should not be empty")
	}

	if c.ThreadID == "" {
		return fmt.Errorf("invalid ThreadID: should not be empty")
	}

	if c.OwnerID == "" {
		return fmt.Errorf("invalid OwnerID: should not be empty")
	}

	return nil
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
