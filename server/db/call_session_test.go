// Copyright (c) 2022-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package db

import (
	"testing"
	"time"

	"github.com/mattermost/mattermost-plugin-calls/server/public"

	"github.com/mattermost/mattermost/server/public/model"

	"github.com/stretchr/testify/require"
)

func TestCallSessionStore(t *testing.T) {
	t.Parallel()
	testStore(t, map[string]func(t *testing.T, store *Store){
		"TestCreateCallSession": testCreateCallSession,
		"TestDeleteCallSession": testDeleteCallSession,
		"TestUpdateCallSession": testUpdateCallSession,
		"TestGetCallSession":    testGetCallSession,
		"TestGetCallSessions":   testGetCallSessions,
	})
}

func testCreateCallSession(t *testing.T, store *Store) {
	t.Run("invalid", func(t *testing.T) {
		err := store.CreateCallSession(nil)
		require.EqualError(t, err, "session should not be nil")

		err = store.CreateCallSession(&public.CallSession{})
		require.EqualError(t, err, "invalid call session: invalid ID: should not be empty")

		err = store.CreateCallSession(&public.CallSession{
			ID: model.NewId(),
		})
		require.EqualError(t, err, "invalid call session: invalid CallID: should not be empty")

		err = store.CreateCallSession(&public.CallSession{
			ID:     model.NewId(),
			CallID: model.NewId(),
		})
		require.EqualError(t, err, "invalid call session: invalid UserID: should not be empty")

		err = store.CreateCallSession(&public.CallSession{
			ID:     model.NewId(),
			CallID: model.NewId(),
			UserID: model.NewId(),
		})
		require.EqualError(t, err, "invalid call session: invalid JoinAt: should not be zero")
	})

	t.Run("valid", func(t *testing.T) {
		session := &public.CallSession{
			ID:         model.NewId(),
			CallID:     model.NewId(),
			UserID:     model.NewId(),
			JoinAt:     time.Now().UnixMilli(),
			Unmuted:    true,
			RaisedHand: time.Now().UnixMilli(),
		}

		err := store.CreateCallSession(session)
		require.NoError(t, err)

		gotSession, err := store.GetCallSession(session.ID, GetCallSessionOpts{
			FromWriter: true,
		})
		require.NoError(t, err)
		require.Equal(t, session, gotSession)
	})
}

func testUpdateCallSession(t *testing.T, store *Store) {
	t.Run("nil", func(t *testing.T) {
		var session *public.CallSession
		err := store.UpdateCallSession(session)
		require.EqualError(t, err, "session should not be nil")
	})

	t.Run("missing", func(t *testing.T) {
		err := store.UpdateCallSession(&public.CallSession{
			ID: "sessionID",
		})
		require.EqualError(t, err, "failed to update call session")
	})

	t.Run("existing", func(t *testing.T) {
		session := &public.CallSession{
			ID:      model.NewId(),
			CallID:  model.NewId(),
			UserID:  model.NewId(),
			JoinAt:  time.Now().UnixMilli(),
			Unmuted: true,
		}

		err := store.CreateCallSession(session)
		require.NoError(t, err)

		session.RaisedHand = time.Now().UnixMilli()
		session.Unmuted = false

		err = store.UpdateCallSession(session)
		require.NoError(t, err)

		gotSession, err := store.GetCallSession(session.ID, GetCallSessionOpts{
			FromWriter: true,
		})
		require.NoError(t, err)
		require.Equal(t, session, gotSession)
	})
}

func testDeleteCallSession(t *testing.T, store *Store) {
	t.Run("missing", func(t *testing.T) {
		err := store.DeleteCallSession(model.NewId())
		require.NoError(t, err)
	})

	t.Run("existing", func(t *testing.T) {
		session := &public.CallSession{
			ID:      model.NewId(),
			CallID:  model.NewId(),
			UserID:  model.NewId(),
			JoinAt:  time.Now().UnixMilli(),
			Unmuted: true,
		}

		err := store.CreateCallSession(session)
		require.NoError(t, err)

		_, err = store.GetCallSession(session.ID, GetCallSessionOpts{
			FromWriter: true,
		})
		require.NoError(t, err)

		err = store.DeleteCallSession(session.ID)
		require.NoError(t, err)

		_, err = store.GetCallSession(session.ID, GetCallSessionOpts{
			FromWriter: true,
		})
		require.EqualError(t, err, "call session not found")
	})
}

func testGetCallSession(t *testing.T, store *Store) {
	t.Run("missing", func(t *testing.T) {
		session, err := store.GetCallSession(model.NewId(), GetCallSessionOpts{})
		require.EqualError(t, err, "call session not found")
		require.Nil(t, session)
	})

	t.Run("existing", func(t *testing.T) {
		session := &public.CallSession{
			ID:      model.NewId(),
			CallID:  model.NewId(),
			UserID:  model.NewId(),
			JoinAt:  time.Now().UnixMilli(),
			Unmuted: true,
		}

		err := store.CreateCallSession(session)
		require.NoError(t, err)

		gotSession, err := store.GetCallSession(session.ID, GetCallSessionOpts{
			FromWriter: true,
		})
		require.NoError(t, err)
		require.Equal(t, session, gotSession)
	})
}

func testGetCallSessions(t *testing.T, store *Store) {
	t.Run("no sessions", func(t *testing.T) {
		sessions, err := store.GetCallSessions(model.NewId(), GetCallSessionOpts{})
		require.NoError(t, err)
		require.NotNil(t, sessions)
		require.Empty(t, sessions)
	})

	t.Run("multiple sessions", func(t *testing.T) {
		var sessions []*public.CallSession
		callID := model.NewId()
		for i := 0; i < 10; i++ {
			sessions = append(sessions, &public.CallSession{
				ID:     model.NewId(),
				CallID: callID,
				UserID: model.NewId(),
				JoinAt: time.Now().UnixMilli(),
			})

			err := store.CreateCallSession(sessions[i])
			require.NoError(t, err)
		}

		gotSessions, err := store.GetCallSessions(callID, GetCallSessionOpts{})
		require.NoError(t, err)
		require.Len(t, gotSessions, 10)
		require.ElementsMatch(t, sessions, gotSessions)
	})
}
