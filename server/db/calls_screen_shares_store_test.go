// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package db

import (
	"testing"

	"github.com/mattermost/mattermost/server/public/model"

	"github.com/stretchr/testify/require"
)

func TestCallsScreenSharesStore(t *testing.T) {
	testStore(t, map[string]func(t *testing.T, store *Store){
		"TestRecordScreenShareStartStop":      testRecordScreenShareStartStop,
		"TestRecordStopForActiveScreenShares": testRecordStopForActiveScreenShares,
		"TestGetScreenSharesForCalls":         testGetScreenSharesForCalls,
	})
}

func testRecordScreenShareStartStop(t *testing.T, store *Store) {
	callID := model.NewId()
	userID := model.NewId()
	sessionID := model.NewId()

	t.Run("records a start with an open stop", func(t *testing.T) {
		require.NoError(t, store.RecordScreenShareStart(callID, userID, sessionID, 1000))

		got, err := store.GetScreenSharesForCalls([]string{callID}, GetCallOpts{FromWriter: true})
		require.NoError(t, err)
		require.Len(t, got[callID], 1)
		require.Equal(t, int64(1000), got[callID][0].StartAt)
		require.Equal(t, int64(0), got[callID][0].StopAt)
		require.Equal(t, userID, got[callID][0].UserID)
	})

	t.Run("a duplicate start is idempotent", func(t *testing.T) {
		require.NoError(t, store.RecordScreenShareStart(callID, userID, sessionID, 1000))

		got, err := store.GetScreenSharesForCalls([]string{callID}, GetCallOpts{FromWriter: true})
		require.NoError(t, err)
		require.Len(t, got[callID], 1)
	})

	t.Run("records the stop for the open segment", func(t *testing.T) {
		require.NoError(t, store.RecordScreenShareStop(callID, sessionID, 2000))

		got, err := store.GetScreenSharesForCalls([]string{callID}, GetCallOpts{FromWriter: true})
		require.NoError(t, err)
		require.Len(t, got[callID], 1)
		require.Equal(t, int64(2000), got[callID][0].StopAt)
	})

	t.Run("a second stop does not move a closed segment", func(t *testing.T) {
		require.NoError(t, store.RecordScreenShareStop(callID, sessionID, 5000))

		got, err := store.GetScreenSharesForCalls([]string{callID}, GetCallOpts{FromWriter: true})
		require.NoError(t, err)
		require.Equal(t, int64(2000), got[callID][0].StopAt)
	})

	t.Run("the same session can share again as a new segment", func(t *testing.T) {
		require.NoError(t, store.RecordScreenShareStart(callID, userID, sessionID, 6000))

		got, err := store.GetScreenSharesForCalls([]string{callID}, GetCallOpts{FromWriter: true})
		require.NoError(t, err)
		require.Len(t, got[callID], 2)
		// Ordered by start; the new open segment is last.
		require.Equal(t, int64(6000), got[callID][1].StartAt)
		require.Equal(t, int64(0), got[callID][1].StopAt)

		// Stopping now closes only the open (second) segment.
		require.NoError(t, store.RecordScreenShareStop(callID, sessionID, 7000))
		got, err = store.GetScreenSharesForCalls([]string{callID}, GetCallOpts{FromWriter: true})
		require.NoError(t, err)
		require.Equal(t, int64(2000), got[callID][0].StopAt, "first segment unchanged")
		require.Equal(t, int64(7000), got[callID][1].StopAt)
	})
}

func testRecordStopForActiveScreenShares(t *testing.T, store *Store) {
	callID := model.NewId()
	openUser := model.NewId()
	closedUser := model.NewId()
	otherCall := model.NewId()
	otherUser := model.NewId()

	require.NoError(t, store.RecordScreenShareStart(callID, openUser, model.NewId(), 1000))
	require.NoError(t, store.RecordScreenShareStart(callID, closedUser, model.NewId(), 1000))
	require.NoError(t, store.RecordScreenShareStop(callID, "", 0)) // no-op, wrong session
	// Close the second user's segment precisely.
	closedSession := model.NewId()
	require.NoError(t, store.RecordScreenShareStart(callID, closedUser, closedSession, 1500))
	require.NoError(t, store.RecordScreenShareStop(callID, closedSession, 3000))
	require.NoError(t, store.RecordScreenShareStart(otherCall, otherUser, model.NewId(), 1000))

	t.Run("closes only open segments of the target call", func(t *testing.T) {
		require.NoError(t, store.RecordStopForActiveScreenShares(callID, 9000))

		got, err := store.GetScreenSharesForCalls([]string{callID, otherCall}, GetCallOpts{FromWriter: true})
		require.NoError(t, err)

		for _, ss := range got[callID] {
			require.NotEqual(t, int64(0), ss.StopAt, "no segment of an ended call stays open")
			if ss.StartAt == 1500 {
				require.Equal(t, int64(3000), ss.StopAt, "precise stop preserved")
			}
		}
		require.Equal(t, int64(0), got[otherCall][0].StopAt, "other calls untouched")
	})

	t.Run("is a no-op when run again", func(t *testing.T) {
		require.NoError(t, store.RecordStopForActiveScreenShares(callID, 12000))

		got, err := store.GetScreenSharesForCalls([]string{callID}, GetCallOpts{FromWriter: true})
		require.NoError(t, err)
		for _, ss := range got[callID] {
			require.NotEqual(t, int64(12000), ss.StopAt, "already-closed stops are not moved")
		}
	})
}

func testGetScreenSharesForCalls(t *testing.T, store *Store) {
	callA := model.NewId()
	callB := model.NewId()
	user1 := model.NewId()
	user2 := model.NewId()

	require.NoError(t, store.RecordScreenShareStart(callA, user1, model.NewId(), 300))
	require.NoError(t, store.RecordScreenShareStart(callA, user2, model.NewId(), 100))
	require.NoError(t, store.RecordScreenShareStart(callB, user1, model.NewId(), 500))

	t.Run("empty input returns empty map", func(t *testing.T) {
		got, err := store.GetScreenSharesForCalls(nil, GetCallOpts{FromWriter: true})
		require.NoError(t, err)
		require.Empty(t, got)
	})

	t.Run("groups by call, ordered by start", func(t *testing.T) {
		got, err := store.GetScreenSharesForCalls([]string{callA, callB}, GetCallOpts{FromWriter: true})
		require.NoError(t, err)

		require.Len(t, got[callA], 2)
		require.Equal(t, int64(100), got[callA][0].StartAt, "earliest start first")
		require.Equal(t, int64(300), got[callA][1].StartAt)
		require.Len(t, got[callB], 1)
	})

	t.Run("unknown call omitted", func(t *testing.T) {
		got, err := store.GetScreenSharesForCalls([]string{model.NewId()}, GetCallOpts{FromWriter: true})
		require.NoError(t, err)
		require.Empty(t, got)
	})
}
