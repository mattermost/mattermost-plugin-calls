// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package public

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestGuestLinkIsValid(t *testing.T) {
	t.Run("nil", func(t *testing.T) {
		var l *GuestLink
		require.EqualError(t, l.IsValid(), "should not be nil")
	})

	t.Run("empty", func(t *testing.T) {
		require.EqualError(t, (&GuestLink{}).IsValid(), "invalid ID: should not be empty")
	})

	t.Run("missing ChannelID", func(t *testing.T) {
		require.EqualError(t, (&GuestLink{ID: "id"}).IsValid(), "invalid ChannelID: should not be empty")
	})

	t.Run("invalid type", func(t *testing.T) {
		require.EqualError(t, (&GuestLink{ID: "id", ChannelID: "ch", Type: "bad"}).IsValid(),
			`invalid Type: must be "url" or "sip"`)
	})

	t.Run("missing CreatedBy", func(t *testing.T) {
		require.EqualError(t, (&GuestLink{ID: "id", ChannelID: "ch", Type: GuestLinkTypeURL}).IsValid(),
			"invalid CreatedBy: should not be empty")
	})

	t.Run("missing CreateAt", func(t *testing.T) {
		require.EqualError(t, (&GuestLink{ID: "id", ChannelID: "ch", Type: GuestLinkTypeURL, CreatedBy: "u"}).IsValid(),
			"invalid CreateAt: should not be zero")
	})

	t.Run("missing Secret", func(t *testing.T) {
		require.EqualError(t, (&GuestLink{ID: "id", ChannelID: "ch", Type: GuestLinkTypeURL, CreatedBy: "u", CreateAt: 1}).IsValid(),
			"invalid Secret: should not be empty")
	})

	t.Run("valid url", func(t *testing.T) {
		require.NoError(t, (&GuestLink{ID: "id", ChannelID: "ch", Type: GuestLinkTypeURL, CreatedBy: "u", CreateAt: 1, Secret: "s"}).IsValid())
	})

	t.Run("valid sip", func(t *testing.T) {
		require.NoError(t, (&GuestLink{ID: "id", ChannelID: "ch", Type: GuestLinkTypeSIP, CreatedBy: "u", CreateAt: 1, Secret: "123456789"}).IsValid())
	})
}

func TestGuestLinkIsExpired(t *testing.T) {
	now := time.Now().UnixMilli()

	t.Run("no expiry", func(t *testing.T) {
		l := &GuestLink{ExpiresAt: 0}
		require.False(t, l.IsExpired(now))
	})

	t.Run("future expiry", func(t *testing.T) {
		l := &GuestLink{ExpiresAt: now + 60000}
		require.False(t, l.IsExpired(now))
	})

	t.Run("past expiry", func(t *testing.T) {
		l := &GuestLink{ExpiresAt: now - 1}
		require.True(t, l.IsExpired(now))
	})

	t.Run("exact expiry", func(t *testing.T) {
		l := &GuestLink{ExpiresAt: now}
		require.True(t, l.IsExpired(now))
	})
}

func TestGuestLinkIsRevoked(t *testing.T) {
	t.Run("not revoked", func(t *testing.T) {
		require.False(t, (&GuestLink{DeleteAt: 0}).IsRevoked())
	})

	t.Run("revoked", func(t *testing.T) {
		require.True(t, (&GuestLink{DeleteAt: 123}).IsRevoked())
	})
}

func TestGuestLinkIsExhausted(t *testing.T) {
	t.Run("unlimited", func(t *testing.T) {
		require.False(t, (&GuestLink{MaxUses: 0, UseCount: 100}).IsExhausted())
	})

	t.Run("under limit", func(t *testing.T) {
		require.False(t, (&GuestLink{MaxUses: 5, UseCount: 3}).IsExhausted())
	})

	t.Run("at limit", func(t *testing.T) {
		require.True(t, (&GuestLink{MaxUses: 1, UseCount: 1}).IsExhausted())
	})

	t.Run("over limit", func(t *testing.T) {
		require.True(t, (&GuestLink{MaxUses: 1, UseCount: 2}).IsExhausted())
	})
}
