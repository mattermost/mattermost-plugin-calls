// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package public

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestGuestSessionIsValid(t *testing.T) {
	t.Run("nil", func(t *testing.T) {
		var s *GuestSession
		require.EqualError(t, s.IsValid(), "should not be nil")
	})

	t.Run("empty", func(t *testing.T) {
		require.EqualError(t, (&GuestSession{}).IsValid(), "invalid ID: should not be empty")
	})

	t.Run("missing LinkID", func(t *testing.T) {
		require.EqualError(t, (&GuestSession{ID: "id"}).IsValid(), "invalid LinkID: should not be empty")
	})

	t.Run("invalid type", func(t *testing.T) {
		require.EqualError(t, (&GuestSession{ID: "id", LinkID: "l", Type: "bad"}).IsValid(),
			`invalid Type: must be "url" or "sip"`)
	})

	t.Run("missing ChannelID", func(t *testing.T) {
		require.EqualError(t, (&GuestSession{ID: "id", LinkID: "l", Type: GuestLinkTypeURL}).IsValid(),
			"invalid ChannelID: should not be empty")
	})

	t.Run("missing CreateAt", func(t *testing.T) {
		require.EqualError(t, (&GuestSession{ID: "id", LinkID: "l", Type: GuestLinkTypeURL, ChannelID: "ch"}).IsValid(),
			"invalid CreateAt: should not be zero")
	})

	t.Run("valid", func(t *testing.T) {
		require.NoError(t, (&GuestSession{ID: "id", LinkID: "l", Type: GuestLinkTypeURL, ChannelID: "ch", CreateAt: 1}).IsValid())
	})
}
