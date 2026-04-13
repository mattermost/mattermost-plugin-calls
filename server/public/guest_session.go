// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package public

import (
	"fmt"
)

type GuestSessionProps map[string]any

type GuestSession struct {
	ID           string            `json:"id"`
	LinkID       string            `json:"link_id"`
	Type         string            `json:"type"`
	ChannelID    string            `json:"channel_id"`
	DisplayName  string            `json:"display_name"`
	CreateAt     int64             `json:"create_at"`
	EndAt        int64             `json:"end_at"`
	IPAddress    string            `json:"ip_address"`
	CallerNumber *string           `json:"caller_number"`
	Props        GuestSessionProps `json:"props"`
}

func (s *GuestSession) IsValid() error {
	if s == nil {
		return fmt.Errorf("should not be nil")
	}

	if s.ID == "" {
		return fmt.Errorf("invalid ID: should not be empty")
	}

	if s.LinkID == "" {
		return fmt.Errorf("invalid LinkID: should not be empty")
	}

	if s.Type != GuestLinkTypeURL && s.Type != GuestLinkTypeSIP {
		return fmt.Errorf("invalid Type: must be %q or %q", GuestLinkTypeURL, GuestLinkTypeSIP)
	}

	if s.ChannelID == "" {
		return fmt.Errorf("invalid ChannelID: should not be empty")
	}

	if s.CreateAt == 0 {
		return fmt.Errorf("invalid CreateAt: should not be zero")
	}

	return nil
}
