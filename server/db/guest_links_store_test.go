// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package db

import (
	"testing"
	"time"

	"github.com/mattermost/mattermost-plugin-calls/server/public"

	"github.com/mattermost/mattermost/server/public/model"

	"github.com/stretchr/testify/require"
)

func TestGuestLinksStore(t *testing.T) {
	testStore(t, map[string]func(t *testing.T, store *Store){
		"TestCreateGuestLink":              testCreateGuestLink,
		"TestGetGuestLink":                 testGetGuestLink,
		"TestGetGuestLinkBySecret":         testGetGuestLinkBySecret,
		"TestGetActiveGuestLinksByChannel":  testGetActiveGuestLinksByChannel,
		"TestDeleteGuestLink":              testDeleteGuestLink,
		"TestIncrementGuestLinkUseCount":   testIncrementGuestLinkUseCount,
		"TestGetActiveSIPGuestLinkByChannel": testGetActiveSIPGuestLinkByChannel,
	})
}

func testCreateGuestLink(t *testing.T, store *Store) {
	t.Run("invalid", func(t *testing.T) {
		err := store.CreateGuestLink(nil)
		require.EqualError(t, err, "invalid guest link: should not be nil")

		err = store.CreateGuestLink(&public.GuestLink{})
		require.EqualError(t, err, "invalid guest link: invalid ID: should not be empty")

		err = store.CreateGuestLink(&public.GuestLink{
			ID: model.NewId(),
		})
		require.EqualError(t, err, "invalid guest link: invalid ChannelID: should not be empty")

		err = store.CreateGuestLink(&public.GuestLink{
			ID:        model.NewId(),
			ChannelID: model.NewId(),
			Type:      "invalid",
		})
		require.EqualError(t, err, `invalid guest link: invalid Type: must be "url" or "sip"`)
	})

	t.Run("valid url link", func(t *testing.T) {
		link := &public.GuestLink{
			ID:        model.NewId(),
			ChannelID: model.NewId(),
			Type:      public.GuestLinkTypeURL,
			CreatedBy: model.NewId(),
			CreateAt:  time.Now().UnixMilli(),
			Secret:    "test-secret-abc123",
			Props:     public.GuestLinkProps{},
		}

		err := store.CreateGuestLink(link)
		require.NoError(t, err)

		got, err := store.GetGuestLink(link.ID, GetGuestLinkOpts{FromWriter: true})
		require.NoError(t, err)
		require.Equal(t, link, got)
	})

	t.Run("valid sip link", func(t *testing.T) {
		trunkID := "ST_test123"
		dispatchRuleID := "SDR_test456"
		link := &public.GuestLink{
			ID:             model.NewId(),
			ChannelID:      model.NewId(),
			Type:           public.GuestLinkTypeSIP,
			CreatedBy:      model.NewId(),
			CreateAt:       time.Now().UnixMilli(),
			Secret:         "123456789",
			TrunkID:        &trunkID,
			DispatchRuleID: &dispatchRuleID,
			Props:          public.GuestLinkProps{},
		}

		err := store.CreateGuestLink(link)
		require.NoError(t, err)

		got, err := store.GetGuestLink(link.ID, GetGuestLinkOpts{FromWriter: true})
		require.NoError(t, err)
		require.Equal(t, link, got)
	})
}

func testGetGuestLink(t *testing.T, store *Store) {
	t.Run("not found", func(t *testing.T) {
		_, err := store.GetGuestLink(model.NewId(), GetGuestLinkOpts{})
		require.ErrorIs(t, err, ErrNotFound)
	})
}

func testGetGuestLinkBySecret(t *testing.T, store *Store) {
	t.Run("not found", func(t *testing.T) {
		_, err := store.GetGuestLinkBySecret("nonexistent", GetGuestLinkOpts{})
		require.ErrorIs(t, err, ErrNotFound)
	})

	t.Run("found", func(t *testing.T) {
		link := &public.GuestLink{
			ID:        model.NewId(),
			ChannelID: model.NewId(),
			Type:      public.GuestLinkTypeURL,
			CreatedBy: model.NewId(),
			CreateAt:  time.Now().UnixMilli(),
			Secret:    "unique-secret-" + model.NewId(),
			Props:     public.GuestLinkProps{},
		}

		err := store.CreateGuestLink(link)
		require.NoError(t, err)

		got, err := store.GetGuestLinkBySecret(link.Secret, GetGuestLinkOpts{FromWriter: true})
		require.NoError(t, err)
		require.Equal(t, link.ID, got.ID)
	})
}

func testGetActiveGuestLinksByChannel(t *testing.T, store *Store) {
	channelID := model.NewId()

	// Create two active links and one revoked.
	active1 := &public.GuestLink{
		ID:        model.NewId(),
		ChannelID: channelID,
		Type:      public.GuestLinkTypeURL,
		CreatedBy: model.NewId(),
		CreateAt:  time.Now().UnixMilli(),
		Secret:    "active1-" + model.NewId(),
		Props:     public.GuestLinkProps{},
	}
	active2 := &public.GuestLink{
		ID:        model.NewId(),
		ChannelID: channelID,
		Type:      public.GuestLinkTypeURL,
		CreatedBy: model.NewId(),
		CreateAt:  time.Now().UnixMilli() + 1,
		Secret:    "active2-" + model.NewId(),
		Props:     public.GuestLinkProps{},
	}
	revoked := &public.GuestLink{
		ID:        model.NewId(),
		ChannelID: channelID,
		Type:      public.GuestLinkTypeURL,
		CreatedBy: model.NewId(),
		CreateAt:  time.Now().UnixMilli(),
		DeleteAt:  time.Now().UnixMilli(),
		Secret:    "revoked-" + model.NewId(),
		Props:     public.GuestLinkProps{},
	}

	require.NoError(t, store.CreateGuestLink(active1))
	require.NoError(t, store.CreateGuestLink(active2))
	require.NoError(t, store.CreateGuestLink(revoked))

	links, err := store.GetActiveGuestLinksByChannel(channelID, GetGuestLinkOpts{FromWriter: true})
	require.NoError(t, err)
	require.Len(t, links, 2)
	// Ordered by CreateAt DESC.
	require.Equal(t, active2.ID, links[0].ID)
	require.Equal(t, active1.ID, links[1].ID)
}

func testDeleteGuestLink(t *testing.T, store *Store) {
	link := &public.GuestLink{
		ID:        model.NewId(),
		ChannelID: model.NewId(),
		Type:      public.GuestLinkTypeURL,
		CreatedBy: model.NewId(),
		CreateAt:  time.Now().UnixMilli(),
		Secret:    "delete-test-" + model.NewId(),
		Props:     public.GuestLinkProps{},
	}

	require.NoError(t, store.CreateGuestLink(link))

	err := store.DeleteGuestLink(link.ID)
	require.NoError(t, err)

	got, err := store.GetGuestLink(link.ID, GetGuestLinkOpts{FromWriter: true})
	require.NoError(t, err)
	require.NotZero(t, got.DeleteAt)
}

func testIncrementGuestLinkUseCount(t *testing.T, store *Store) {
	link := &public.GuestLink{
		ID:        model.NewId(),
		ChannelID: model.NewId(),
		Type:      public.GuestLinkTypeURL,
		CreatedBy: model.NewId(),
		CreateAt:  time.Now().UnixMilli(),
		Secret:    "increment-test-" + model.NewId(),
		Props:     public.GuestLinkProps{},
	}

	require.NoError(t, store.CreateGuestLink(link))

	require.NoError(t, store.IncrementGuestLinkUseCount(link.ID))
	require.NoError(t, store.IncrementGuestLinkUseCount(link.ID))

	got, err := store.GetGuestLink(link.ID, GetGuestLinkOpts{FromWriter: true})
	require.NoError(t, err)
	require.Equal(t, 2, got.UseCount)
}

func testGetActiveSIPGuestLinkByChannel(t *testing.T, store *Store) {
	channelID := model.NewId()

	t.Run("not found", func(t *testing.T) {
		_, err := store.GetActiveSIPGuestLinkByChannel(channelID, GetGuestLinkOpts{})
		require.ErrorIs(t, err, ErrNotFound)
	})

	t.Run("found permanent SIP link", func(t *testing.T) {
		trunkID := "ST_test"
		link := &public.GuestLink{
			ID:        model.NewId(),
			ChannelID: channelID,
			Type:      public.GuestLinkTypeSIP,
			CreatedBy: model.NewId(),
			CreateAt:  time.Now().UnixMilli(),
			MaxUses:   0,
			Secret:    "sippin-" + model.NewId(),
			TrunkID:   &trunkID,
			Props:     public.GuestLinkProps{},
		}

		require.NoError(t, store.CreateGuestLink(link))

		got, err := store.GetActiveSIPGuestLinkByChannel(channelID, GetGuestLinkOpts{FromWriter: true})
		require.NoError(t, err)
		require.Equal(t, link.ID, got.ID)
	})

	t.Run("ignores single-use SIP links", func(t *testing.T) {
		ch2 := model.NewId()
		trunkID := "ST_test"
		link := &public.GuestLink{
			ID:        model.NewId(),
			ChannelID: ch2,
			Type:      public.GuestLinkTypeSIP,
			CreatedBy: model.NewId(),
			CreateAt:  time.Now().UnixMilli(),
			MaxUses:   1,
			Secret:    "siponce-" + model.NewId(),
			TrunkID:   &trunkID,
			Props:     public.GuestLinkProps{},
		}

		require.NoError(t, store.CreateGuestLink(link))

		_, err := store.GetActiveSIPGuestLinkByChannel(ch2, GetGuestLinkOpts{FromWriter: true})
		require.ErrorIs(t, err, ErrNotFound)
	})
}
