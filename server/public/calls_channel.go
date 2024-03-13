package public

import (
	"fmt"
)

type CallsChannel struct {
	ChannelID string    `json:"channel_id"`
	Enabled   bool      `json:"enabled"`
	Props     StringMap `json:"props,omitempty"`
}

func (c *CallsChannel) IsValid() error {
	if c == nil {
		return fmt.Errorf("should not be nil")
	}

	if c.ChannelID == "" {
		return fmt.Errorf("invalid ChannelID: should not be empty")
	}

	return nil
}
