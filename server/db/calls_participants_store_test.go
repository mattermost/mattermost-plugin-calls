// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package db

import (
	"testing"

	"github.com/mattermost/mattermost/server/public/model"

	"github.com/stretchr/testify/require"
)

func TestCallsParticipantsStore(t *testing.T) {
	testStore(t, map[string]func(t *testing.T, store *Store){
		"TestRecordParticipantJoin":   testRecordParticipantJoin,
		"TestRecordParticipantLeave":  testRecordParticipantLeave,
		"TestGetParticipantsForCalls": testGetParticipantsForCalls,
	})
}

func testRecordParticipantJoin(t *testing.T, store *Store) {
	callID := model.NewId()
	userID := model.NewId()

	t.Run("records first join", func(t *testing.T) {
		require.NoError(t, store.RecordParticipantJoin(callID, userID, 1000))

		got, err := store.GetParticipantsForCalls([]string{callID}, GetCallOpts{FromWriter: true})
		require.NoError(t, err)
		require.Equal(t, int64(1000), got[callID][userID].FirstJoinAt)
		require.Equal(t, int64(0), got[callID][userID].LastLeaveAt)
	})

	t.Run("keeps earliest join on a later re-join", func(t *testing.T) {
		require.NoError(t, store.RecordParticipantJoin(callID, userID, 5000))

		got, err := store.GetParticipantsForCalls([]string{callID}, GetCallOpts{FromWriter: true})
		require.NoError(t, err)
		require.Equal(t, int64(1000), got[callID][userID].FirstJoinAt)
	})

	t.Run("keeps earliest join even when an earlier event arrives out of order", func(t *testing.T) {
		require.NoError(t, store.RecordParticipantJoin(callID, userID, 200))

		got, err := store.GetParticipantsForCalls([]string{callID}, GetCallOpts{FromWriter: true})
		require.NoError(t, err)
		require.Equal(t, int64(200), got[callID][userID].FirstJoinAt)
	})
}

func testRecordParticipantLeave(t *testing.T, store *Store) {
	callID := model.NewId()
	userID := model.NewId()

	t.Run("leave without a join is a no-op", func(t *testing.T) {
		require.NoError(t, store.RecordParticipantLeave(callID, userID, 3000))

		got, err := store.GetParticipantsForCalls([]string{callID}, GetCallOpts{FromWriter: true})
		require.NoError(t, err)
		require.Nil(t, got[callID][userID])
	})

	t.Run("records leave after a join", func(t *testing.T) {
		require.NoError(t, store.RecordParticipantJoin(callID, userID, 1000))
		require.NoError(t, store.RecordParticipantLeave(callID, userID, 3000))

		got, err := store.GetParticipantsForCalls([]string{callID}, GetCallOpts{FromWriter: true})
		require.NoError(t, err)
		require.Equal(t, int64(3000), got[callID][userID].LastLeaveAt)
	})

	t.Run("keeps the latest leave", func(t *testing.T) {
		require.NoError(t, store.RecordParticipantLeave(callID, userID, 9000))
		require.NoError(t, store.RecordParticipantLeave(callID, userID, 4000)) // earlier, must not win

		got, err := store.GetParticipantsForCalls([]string{callID}, GetCallOpts{FromWriter: true})
		require.NoError(t, err)
		require.Equal(t, int64(9000), got[callID][userID].LastLeaveAt)
		require.Equal(t, int64(1000), got[callID][userID].FirstJoinAt) // unchanged
	})
}

func testGetParticipantsForCalls(t *testing.T, store *Store) {
	callA := model.NewId()
	callB := model.NewId()
	user1 := model.NewId()
	user2 := model.NewId()

	require.NoError(t, store.RecordParticipantJoin(callA, user1, 100))
	require.NoError(t, store.RecordParticipantLeave(callA, user1, 200))
	require.NoError(t, store.RecordParticipantJoin(callA, user2, 150))
	require.NoError(t, store.RecordParticipantJoin(callB, user1, 300))

	t.Run("empty input returns empty map", func(t *testing.T) {
		got, err := store.GetParticipantsForCalls(nil, GetCallOpts{FromWriter: true})
		require.NoError(t, err)
		require.Empty(t, got)
	})

	t.Run("groups by call then user", func(t *testing.T) {
		got, err := store.GetParticipantsForCalls([]string{callA, callB}, GetCallOpts{FromWriter: true})
		require.NoError(t, err)

		require.Len(t, got[callA], 2)
		require.Equal(t, int64(100), got[callA][user1].FirstJoinAt)
		require.Equal(t, int64(200), got[callA][user1].LastLeaveAt)
		require.Equal(t, int64(150), got[callA][user2].FirstJoinAt)
		require.Equal(t, int64(0), got[callA][user2].LastLeaveAt)

		require.Len(t, got[callB], 1)
		require.Equal(t, int64(300), got[callB][user1].FirstJoinAt)
	})

	t.Run("unknown call omitted", func(t *testing.T) {
		got, err := store.GetParticipantsForCalls([]string{model.NewId()}, GetCallOpts{FromWriter: true})
		require.NoError(t, err)
		require.Empty(t, got)
	})
}
