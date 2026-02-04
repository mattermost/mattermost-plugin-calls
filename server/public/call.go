// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

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

	if c.OwnerID == "" {
		return fmt.Errorf("invalid OwnerID: should not be empty")
	}

	return nil
}

func (c Call) GetHostID() string {
	if len(c.Props.Hosts) == 0 {
		return ""
	}
	return c.Props.Hosts[0]
}

type CallProps struct {
	Hosts                  []string            `json:"hosts,omitempty"`
	RTCDHost               string              `json:"rtcd_host,omitempty"`
	ScreenSharingSessionID string              `json:"screen_sharing_session_id,omitempty"`
	DismissedNotification  map[string]bool     `json:"dismissed_notification,omitempty"`
	ScreenStartAt          int64               `json:"screen_start_at,omitempty"`
	NodeID                 string              `json:"node_id,omitempty"`
	Participants           map[string]struct{} `json:"participants,omitempty"`
	HostLockedUserID       string              `json:"host_locked_user_id,omitempty"`
	// VideoStartAt tracks when each session started video, keyed by session ID.
	// Used to calculate accumulated video duration.
	VideoStartAt map[string]int64 `json:"video_start_at,omitempty"`
}

type CallStats struct {
	ScreenDuration int64 `json:"screen_duration,omitempty"`
	// VideoDuration tracks the cumulative participant-seconds of video usage across all participants.
	// This is a "person-seconds" metric that sums individual video time for capacity planning.
	// Example: 3 participants with video on for 10 seconds each = 30 seconds total.
	// Example: 8 participants on video for a 30-minute call = 14,400 seconds (240 participant-minutes).
	VideoDuration int64 `json:"video_duration,omitempty"`
	// HasUsedVideo indicates if video was enabled at least once during this call.
	// This flag is set to true the first time any participant enables video, and remains true
	// even if video is subsequently disabled. Used for counting calls with video usage.
	HasUsedVideo bool `json:"has_used_video,omitempty"`
	// HasUsedScreenShare indicates if screen sharing was enabled at least once during this call.
	// This flag is set to true the first time any participant enables screen sharing, and remains true
	// even if screen sharing is subsequently disabled. Used for counting calls with screen sharing usage.
	HasUsedScreenShare bool `json:"has_used_screen_share,omitempty"`
}
