package public

import (
	"fmt"
)

type CallSession struct {
	ID         string `json:"id"`
	CallID     string `json:"call_id"`
	UserID     string `json:"user_id"`
	JoinAt     int64  `json:"join_at"`
	Unmuted    bool   `json:"unmuted"`
	RaisedHand int64  `json:"raised_hand"`
}

func (s *CallSession) IsValid() error {
	if s == nil {
		return fmt.Errorf("should not be nil")
	}

	if s.ID == "" {
		return fmt.Errorf("invalid ID: should not be empty")
	}

	if s.CallID == "" {
		return fmt.Errorf("invalid CallID: should not be empty")
	}

	if s.UserID == "" {
		return fmt.Errorf("invalid UserID: should not be empty")
	}

	if s.JoinAt == 0 {
		return fmt.Errorf("invalid JoinAt: should not be zero")
	}

	return nil
}
