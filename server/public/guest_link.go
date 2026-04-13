// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package public

import (
	"fmt"
)

const (
	GuestLinkTypeURL = "url"
	GuestLinkTypeSIP = "sip"
)

type GuestLinkProps map[string]any

type GuestLink struct {
	ID             string         `json:"id"`
	ChannelID      string         `json:"channel_id"`
	Type           string         `json:"type"`
	CreatedBy      string         `json:"created_by"`
	CreateAt       int64          `json:"create_at"`
	DeleteAt       int64          `json:"delete_at"`
	ExpiresAt      int64          `json:"expires_at"`
	MaxUses        int            `json:"max_uses"`
	UseCount       int            `json:"use_count"`
	Secret         string         `json:"secret"`
	TrunkID        *string        `json:"trunk_id"`
	DispatchRuleID *string        `json:"dispatch_rule_id"`
	Props          GuestLinkProps `json:"props"`
}

func (l *GuestLink) IsValid() error {
	if l == nil {
		return fmt.Errorf("should not be nil")
	}

	if l.ID == "" {
		return fmt.Errorf("invalid ID: should not be empty")
	}

	if l.ChannelID == "" {
		return fmt.Errorf("invalid ChannelID: should not be empty")
	}

	if l.Type != GuestLinkTypeURL && l.Type != GuestLinkTypeSIP {
		return fmt.Errorf("invalid Type: must be %q or %q", GuestLinkTypeURL, GuestLinkTypeSIP)
	}

	if l.CreatedBy == "" {
		return fmt.Errorf("invalid CreatedBy: should not be empty")
	}

	if l.CreateAt == 0 {
		return fmt.Errorf("invalid CreateAt: should not be zero")
	}

	if l.Secret == "" {
		return fmt.Errorf("invalid Secret: should not be empty")
	}

	return nil
}

func (l *GuestLink) IsExpired(now int64) bool {
	return l.ExpiresAt > 0 && l.ExpiresAt <= now
}

func (l *GuestLink) IsRevoked() bool {
	return l.DeleteAt > 0
}

func (l *GuestLink) IsExhausted() bool {
	return l.MaxUses > 0 && l.UseCount >= l.MaxUses
}
