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

func TestCallsSessionsStore(t *testing.T) {
	t.Parallel()
	testStore(t, map[string]func(t *testing.T, store *Store){
		"TestCreateCallSession":    testCreateCallSession,
		"TestDeleteCallSession":    testDeleteCallSession,
		"TestUpdateCallSession":    testUpdateCallSession,
		"TestGetCallSession":       testGetCallSession,
		"TestGetCallSessions":      testGetCallSessions,
		"TestDeleteCallsSessions":  testDeleteCallsSessions,
		"TestGetCallSessionsCount": testGetCallSessionsCount,
		"TestIsUserInCall":         testIsUserInCall,
	})
}

func testCreateCallSession(t *testing.T, store *Store) {
	t.Run("invalid", func(t *testing.T) {
		err := store.CreateCallSession(nil)
		require.EqualError(t, err, "invalid call session: should not be nil")

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
		require.EqualError(t, err, "invalid call session: should not be nil")
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
		sessions := map[string]*public.CallSession{}
		callID := model.NewId()
		for i := 0; i < 10; i++ {
			session := &public.CallSession{
				ID:     model.NewId(),
				CallID: callID,
				UserID: model.NewId(),
				JoinAt: time.Now().UnixMilli(),
			}

			err := store.CreateCallSession(session)
			require.NoError(t, err)

			sessions[session.ID] = session
		}

		gotSessions, err := store.GetCallSessions(callID, GetCallSessionOpts{})
		require.NoError(t, err)
		require.Len(t, gotSessions, 10)
		require.Equal(t, sessions, gotSessions)
	})
}

func testDeleteCallsSessions(t *testing.T, store *Store) {
	t.Run("no sessions", func(t *testing.T) {
		err := store.DeleteCallsSessions(model.NewId())
		require.NoError(t, err)
	})

	t.Run("multiple sessions", func(t *testing.T) {
		callID := model.NewId()

		for i := 0; i < 10; i++ {
			session := &public.CallSession{
				ID:      model.NewId(),
				CallID:  callID,
				UserID:  model.NewId(),
				JoinAt:  time.Now().UnixMilli(),
				Unmuted: true,
			}

			err := store.CreateCallSession(session)
			require.NoError(t, err)
		}

		err := store.DeleteCallsSessions(callID)
		require.NoError(t, err)

		sessions, err := store.GetCallSessions(callID, GetCallSessionOpts{})
		require.NoError(t, err)
		require.Empty(t, sessions)
	})
}

func testGetCallSessionsCount(t *testing.T, store *Store) {
	t.Run("no sessions", func(t *testing.T) {
		cnt, err := store.GetCallSessionsCount(model.NewId(), GetCallSessionOpts{})
		require.NoError(t, err)
		require.Zero(t, cnt)
	})

	t.Run("multiple sessions", func(t *testing.T) {
		sessions := map[string]*public.CallSession{}
		callID := model.NewId()
		for i := 0; i < 10; i++ {
			session := &public.CallSession{
				ID:     model.NewId(),
				CallID: callID,
				UserID: model.NewId(),
				JoinAt: time.Now().UnixMilli(),
			}

			err := store.CreateCallSession(session)
			require.NoError(t, err)

			sessions[session.ID] = session
		}

		cnt, err := store.GetCallSessionsCount(callID, GetCallSessionOpts{})
		require.NoError(t, err)
		require.Equal(t, 10, cnt)
	})
}

func testIsUserInCall(t *testing.T, store *Store) {
	t.Run("no sessions", func(t *testing.T) {
		ok, err := store.IsUserInCall(model.NewId(), model.NewId(), GetCallSessionOpts{})
		require.NoError(t, err)
		require.False(t, ok)
	})

	t.Run("multiple sessions, user not in call", func(t *testing.T) {
		sessions := map[string]*public.CallSession{}
		callID := model.NewId()
		for i := 0; i < 10; i++ {
			session := &public.CallSession{
				ID:     model.NewId(),
				CallID: callID,
				UserID: model.NewId(),
				JoinAt: time.Now().UnixMilli(),
			}

			err := store.CreateCallSession(session)
			require.NoError(t, err)

			sessions[session.ID] = session
		}

		ok, err := store.IsUserInCall(model.NewId(), callID, GetCallSessionOpts{})
		require.NoError(t, err)
		require.False(t, ok)
	})

	t.Run("multiple sessions, user in call", func(t *testing.T) {
		sessions := map[string]*public.CallSession{}
		callID := model.NewId()
		userID := model.NewId()
		for i := 0; i < 10; i++ {
			if i > 0 {
				userID = model.NewId()
			}

			session := &public.CallSession{
				ID:     model.NewId(),
				CallID: callID,
				UserID: userID,
				JoinAt: time.Now().UnixMilli(),
			}

			err := store.CreateCallSession(session)
			require.NoError(t, err)

			sessions[session.ID] = session
		}

		ok, err := store.IsUserInCall(userID, callID, GetCallSessionOpts{})
		require.NoError(t, err)
		require.True(t, ok)
	})
}
