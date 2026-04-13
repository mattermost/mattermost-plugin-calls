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

func TestGuestSessionsStore(t *testing.T) {
	testStore(t, map[string]func(t *testing.T, store *Store){
		"TestCreateGuestSession":                testCreateGuestSession,
		"TestGetGuestSession":                   testGetGuestSession,
		"TestUpdateGuestSessionEndAt":           testUpdateGuestSessionEndAt,
		"TestGetGuestSessionsByChannel":         testGetGuestSessionsByChannel,
		"TestGetGuestSessionsByLink":            testGetGuestSessionsByLink,
		"TestEndActiveGuestSessionsByChannel":   testEndActiveGuestSessionsByChannel,
	})
}

func testCreateGuestSession(t *testing.T, store *Store) {
	t.Run("invalid", func(t *testing.T) {
		err := store.CreateGuestSession(nil)
		require.EqualError(t, err, "invalid guest session: should not be nil")

		err = store.CreateGuestSession(&public.GuestSession{})
		require.EqualError(t, err, "invalid guest session: invalid ID: should not be empty")

		err = store.CreateGuestSession(&public.GuestSession{
			ID: model.NewId(),
		})
		require.EqualError(t, err, "invalid guest session: invalid LinkID: should not be empty")
	})

	t.Run("valid url session", func(t *testing.T) {
		session := &public.GuestSession{
			ID:          model.NewId(),
			LinkID:      model.NewId(),
			Type:        public.GuestLinkTypeURL,
			ChannelID:   model.NewId(),
			DisplayName: "Jane from Acme",
			CreateAt:    time.Now().UnixMilli(),
			IPAddress:   "192.168.1.100",
			Props:       public.GuestSessionProps{},
		}

		err := store.CreateGuestSession(session)
		require.NoError(t, err)

		got, err := store.GetGuestSession(session.ID, GetGuestSessionOpts{FromWriter: true})
		require.NoError(t, err)
		require.Equal(t, session, got)
	})

	t.Run("valid sip session", func(t *testing.T) {
		callerNumber := "+15551234567"
		session := &public.GuestSession{
			ID:           model.NewId(),
			LinkID:       model.NewId(),
			Type:         public.GuestLinkTypeSIP,
			ChannelID:    model.NewId(),
			DisplayName:  "+15551234567",
			CreateAt:     time.Now().UnixMilli(),
			IPAddress:    "10.0.0.1",
			CallerNumber: &callerNumber,
			Props:        public.GuestSessionProps{},
		}

		err := store.CreateGuestSession(session)
		require.NoError(t, err)

		got, err := store.GetGuestSession(session.ID, GetGuestSessionOpts{FromWriter: true})
		require.NoError(t, err)
		require.Equal(t, session, got)
	})
}

func testGetGuestSession(t *testing.T, store *Store) {
	t.Run("not found", func(t *testing.T) {
		_, err := store.GetGuestSession(model.NewId(), GetGuestSessionOpts{})
		require.ErrorIs(t, err, ErrNotFound)
	})
}

func testUpdateGuestSessionEndAt(t *testing.T, store *Store) {
	session := &public.GuestSession{
		ID:          model.NewId(),
		LinkID:      model.NewId(),
		Type:        public.GuestLinkTypeURL,
		ChannelID:   model.NewId(),
		DisplayName: "Test User",
		CreateAt:    time.Now().UnixMilli(),
		Props:       public.GuestSessionProps{},
	}

	require.NoError(t, store.CreateGuestSession(session))

	endAt := time.Now().UnixMilli()
	require.NoError(t, store.UpdateGuestSessionEndAt(session.ID, endAt))

	got, err := store.GetGuestSession(session.ID, GetGuestSessionOpts{FromWriter: true})
	require.NoError(t, err)
	require.Equal(t, endAt, got.EndAt)
}

func testGetGuestSessionsByChannel(t *testing.T, store *Store) {
	channelID := model.NewId()

	s1 := &public.GuestSession{
		ID:          model.NewId(),
		LinkID:      model.NewId(),
		Type:        public.GuestLinkTypeURL,
		ChannelID:   channelID,
		DisplayName: "Guest 1",
		CreateAt:    time.Now().UnixMilli(),
		Props:       public.GuestSessionProps{},
	}
	s2 := &public.GuestSession{
		ID:          model.NewId(),
		LinkID:      model.NewId(),
		Type:        public.GuestLinkTypeURL,
		ChannelID:   channelID,
		DisplayName: "Guest 2",
		CreateAt:    time.Now().UnixMilli() + 1,
		Props:       public.GuestSessionProps{},
	}
	// Different channel.
	s3 := &public.GuestSession{
		ID:          model.NewId(),
		LinkID:      model.NewId(),
		Type:        public.GuestLinkTypeURL,
		ChannelID:   model.NewId(),
		DisplayName: "Guest 3",
		CreateAt:    time.Now().UnixMilli(),
		Props:       public.GuestSessionProps{},
	}

	require.NoError(t, store.CreateGuestSession(s1))
	require.NoError(t, store.CreateGuestSession(s2))
	require.NoError(t, store.CreateGuestSession(s3))

	sessions, err := store.GetGuestSessionsByChannel(channelID, GetGuestSessionOpts{FromWriter: true})
	require.NoError(t, err)
	require.Len(t, sessions, 2)
	// Ordered by CreateAt DESC.
	require.Equal(t, s2.ID, sessions[0].ID)
	require.Equal(t, s1.ID, sessions[1].ID)
}

func testGetGuestSessionsByLink(t *testing.T, store *Store) {
	linkID := model.NewId()

	s1 := &public.GuestSession{
		ID:          model.NewId(),
		LinkID:      linkID,
		Type:        public.GuestLinkTypeURL,
		ChannelID:   model.NewId(),
		DisplayName: "Guest A",
		CreateAt:    time.Now().UnixMilli(),
		Props:       public.GuestSessionProps{},
	}
	s2 := &public.GuestSession{
		ID:          model.NewId(),
		LinkID:      linkID,
		Type:        public.GuestLinkTypeURL,
		ChannelID:   model.NewId(),
		DisplayName: "Guest B",
		CreateAt:    time.Now().UnixMilli() + 1,
		Props:       public.GuestSessionProps{},
	}

	require.NoError(t, store.CreateGuestSession(s1))
	require.NoError(t, store.CreateGuestSession(s2))

	sessions, err := store.GetGuestSessionsByLink(linkID, GetGuestSessionOpts{FromWriter: true})
	require.NoError(t, err)
	require.Len(t, sessions, 2)
}

func testEndActiveGuestSessionsByChannel(t *testing.T, store *Store) {
	channelID := model.NewId()

	active := &public.GuestSession{
		ID:          model.NewId(),
		LinkID:      model.NewId(),
		Type:        public.GuestLinkTypeURL,
		ChannelID:   channelID,
		DisplayName: "Active Guest",
		CreateAt:    time.Now().UnixMilli(),
		Props:       public.GuestSessionProps{},
	}
	alreadyEnded := &public.GuestSession{
		ID:          model.NewId(),
		LinkID:      model.NewId(),
		Type:        public.GuestLinkTypeURL,
		ChannelID:   channelID,
		DisplayName: "Ended Guest",
		CreateAt:    time.Now().UnixMilli(),
		EndAt:       time.Now().UnixMilli() - 1000,
		Props:       public.GuestSessionProps{},
	}

	require.NoError(t, store.CreateGuestSession(active))
	require.NoError(t, store.CreateGuestSession(alreadyEnded))

	endAt := time.Now().UnixMilli()
	require.NoError(t, store.EndActiveGuestSessionsByChannel(channelID, endAt))

	got, err := store.GetGuestSession(active.ID, GetGuestSessionOpts{FromWriter: true})
	require.NoError(t, err)
	require.Equal(t, endAt, got.EndAt)

	// Already-ended session should keep its original EndAt.
	got2, err := store.GetGuestSession(alreadyEnded.ID, GetGuestSessionOpts{FromWriter: true})
	require.NoError(t, err)
	require.Equal(t, alreadyEnded.EndAt, got2.EndAt)
}
