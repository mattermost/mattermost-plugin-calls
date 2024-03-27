package public

import (
	"fmt"
)

type CallJob struct {
	ID        string       `json:"id"`
	CallID    string       `json:"call_id"`
	Type      JobType      `json:"type"`
	CreatorID string       `json:"creator_id"`
	InitAt    int64        `json:"init_at"`
	StartAt   int64        `json:"start_at"`
	EndAt     int64        `json:"end_at"`
	Props     CallJobProps `json:"props"`
}

func (j *CallJob) IsValid() error {
	if j == nil {
		return fmt.Errorf("should not be nil")
	}

	if j.ID == "" {
		return fmt.Errorf("invalid ID: should not be empty")
	}

	if j.CallID == "" {
		return fmt.Errorf("invalid CallID: should not be empty")
	}

	if err := j.Type.IsValid(); err != nil {
		return fmt.Errorf("invalid Type: %w", err)
	}

	if j.CreatorID == "" {
		return fmt.Errorf("invalid CreatorID: should not be empty")
	}

	if j.InitAt == 0 {
		return fmt.Errorf("invalid InitAt: should be > 0")
	}

	return nil
}

type CallJobProps struct {
	JobID     string `json:"job_id,omitempty"`
	BotConnID string `json:"bot_conn_id,omitempty"`
	Err       string `json:"err,omitempty"`
}
