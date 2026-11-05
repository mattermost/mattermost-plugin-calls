// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package db

import (
	"testing"

	"github.com/mattermost/mattermost-plugin-calls/server/public"

	"github.com/mattermost/mattermost/server/public/model"

	"github.com/stretchr/testify/require"
)

func TestCallsParticipantsStore(t *testing.T) {
	testStore(t, map[string]func(t *testing.T, store *Store){
		"TestRecordParticipantJoin":            testRecordParticipantJoin,
		"TestRecordParticipantLeave":           testRecordParticipantLeave,
		"TestRecordLeaveForActiveParticipants": testRecordLeaveForActiveParticipants,
		"TestGetParticipantsForCalls":          testGetParticipantsForCalls,
		"TestPhoneIdentity":                    testPhoneIdentity,
	})
}

func testRecordParticipantJoin(t *testing.T, store *Store) {
	callID := model.NewId()
	userID := model.NewId()

	t.Run("records first join", func(t *testing.T) {
		require.NoError(t, store.RecordParticipantJoin(callID, public.IdentityTypeUser, userID, 1000))

		got, err := store.GetParticipantsForCalls([]string{callID}, GetCallOpts{FromWriter: true})
		require.NoError(t, err)
		require.Equal(t, int64(1000), got[callID][userID].FirstJoinAt)
		require.Equal(t, int64(0), got[callID][userID].LastLeaveAt)
		require.Equal(t, public.IdentityTypeUser, got[callID][userID].IdentityType)
		require.Equal(t, userID, got[callID][userID].Identity)
	})

	t.Run("keeps earliest join on a later re-join", func(t *testing.T) {
		require.NoError(t, store.RecordParticipantJoin(callID, public.IdentityTypeUser, userID, 5000))

		got, err := store.GetParticipantsForCalls([]string{callID}, GetCallOpts{FromWriter: true})
		require.NoError(t, err)
		require.Equal(t, int64(1000), got[callID][userID].FirstJoinAt)
	})

	t.Run("keeps earliest join even when an earlier event arrives out of order", func(t *testing.T) {
		require.NoError(t, store.RecordParticipantJoin(callID, public.IdentityTypeUser, userID, 200))

		got, err := store.GetParticipantsForCalls([]string{callID}, GetCallOpts{FromWriter: true})
		require.NoError(t, err)
		require.Equal(t, int64(200), got[callID][userID].FirstJoinAt)
	})

	t.Run("a rejoin after leaving resets the leave time", func(t *testing.T) {
		rejoinCall := model.NewId()
		rejoinUser := model.NewId()

		require.NoError(t, store.RecordParticipantJoin(rejoinCall, public.IdentityTypeUser, rejoinUser, 1000))
		require.NoError(t, store.RecordParticipantLeave(rejoinCall, public.IdentityTypeUser, rejoinUser, 2000))

		got, err := store.GetParticipantsForCalls([]string{rejoinCall}, GetCallOpts{FromWriter: true})
		require.NoError(t, err)
		require.Equal(t, int64(2000), got[rejoinCall][rejoinUser].LastLeaveAt)

		// Rejoin: present again, so the earlier leave must be cleared, while the
		// first join is preserved.
		require.NoError(t, store.RecordParticipantJoin(rejoinCall, public.IdentityTypeUser, rejoinUser, 3000))

		got, err = store.GetParticipantsForCalls([]string{rejoinCall}, GetCallOpts{FromWriter: true})
		require.NoError(t, err)
		require.Equal(t, int64(1000), got[rejoinCall][rejoinUser].FirstJoinAt, "first join preserved")
		require.Equal(t, int64(0), got[rejoinCall][rejoinUser].LastLeaveAt, "leave reset to 0 on rejoin")

		// A subsequent leave records normally.
		require.NoError(t, store.RecordParticipantLeave(rejoinCall, public.IdentityTypeUser, rejoinUser, 4000))
		got, err = store.GetParticipantsForCalls([]string{rejoinCall}, GetCallOpts{FromWriter: true})
		require.NoError(t, err)
		require.Equal(t, int64(4000), got[rejoinCall][rejoinUser].LastLeaveAt)
	})
}

func testRecordParticipantLeave(t *testing.T, store *Store) {
	callID := model.NewId()
	userID := model.NewId()

	t.Run("leave without a join is a no-op", func(t *testing.T) {
		require.NoError(t, store.RecordParticipantLeave(callID, public.IdentityTypeUser, userID, 3000))

		got, err := store.GetParticipantsForCalls([]string{callID}, GetCallOpts{FromWriter: true})
		require.NoError(t, err)
		require.Nil(t, got[callID][userID])
	})

	t.Run("records leave after a join", func(t *testing.T) {
		require.NoError(t, store.RecordParticipantJoin(callID, public.IdentityTypeUser, userID, 1000))
		require.NoError(t, store.RecordParticipantLeave(callID, public.IdentityTypeUser, userID, 3000))

		got, err := store.GetParticipantsForCalls([]string{callID}, GetCallOpts{FromWriter: true})
		require.NoError(t, err)
		require.Equal(t, int64(3000), got[callID][userID].LastLeaveAt)
	})

	t.Run("keeps the latest leave", func(t *testing.T) {
		require.NoError(t, store.RecordParticipantLeave(callID, public.IdentityTypeUser, userID, 9000))
		require.NoError(t, store.RecordParticipantLeave(callID, public.IdentityTypeUser, userID, 4000)) // earlier, must not win

		got, err := store.GetParticipantsForCalls([]string{callID}, GetCallOpts{FromWriter: true})
		require.NoError(t, err)
		require.Equal(t, int64(9000), got[callID][userID].LastLeaveAt)
		require.Equal(t, int64(1000), got[callID][userID].FirstJoinAt) // unchanged
	})
}

func testRecordLeaveForActiveParticipants(t *testing.T, store *Store) {
	callID := model.NewId()
	stillIn := model.NewId() // joined, never left
	alreadyLeft := model.NewId()
	phoneNumber := "+15551234567" // SIP callee: joined, no per-leave write
	otherCall := model.NewId()
	otherUser := model.NewId()

	require.NoError(t, store.RecordParticipantJoin(callID, public.IdentityTypeUser, stillIn, 1000))
	require.NoError(t, store.RecordParticipantJoin(callID, public.IdentityTypeUser, alreadyLeft, 1000))
	require.NoError(t, store.RecordParticipantLeave(callID, public.IdentityTypeUser, alreadyLeft, 3000))
	require.NoError(t, store.RecordParticipantJoin(callID, public.IdentityTypePhone, phoneNumber, 1000))
	require.NoError(t, store.RecordParticipantJoin(otherCall, public.IdentityTypeUser, otherUser, 1000))

	t.Run("stamps only zero-leave participants of the target call", func(t *testing.T) {
		require.NoError(t, store.RecordLeaveForActiveParticipants(callID, 9000))

		got, err := store.GetParticipantsForCalls([]string{callID, otherCall}, GetCallOpts{FromWriter: true})
		require.NoError(t, err)

		require.Equal(t, int64(9000), got[callID][stillIn].LastLeaveAt, "never-left attendee gets the end time")
		require.Equal(t, int64(3000), got[callID][alreadyLeft].LastLeaveAt, "precise leave preserved")
		require.Equal(t, int64(9000), got[callID][phoneNumber].LastLeaveAt, "SIP callee's leave comes from the backstop")
		require.Equal(t, public.IdentityTypePhone, got[callID][phoneNumber].IdentityType)
		require.Equal(t, int64(0), got[otherCall][otherUser].LastLeaveAt, "other calls untouched")
	})

	t.Run("is a no-op when run again", func(t *testing.T) {
		require.NoError(t, store.RecordLeaveForActiveParticipants(callID, 12000))

		got, err := store.GetParticipantsForCalls([]string{callID}, GetCallOpts{FromWriter: true})
		require.NoError(t, err)
		require.Equal(t, int64(9000), got[callID][stillIn].LastLeaveAt, "already-stamped leaves are not moved")
	})
}

func testGetParticipantsForCalls(t *testing.T, store *Store) {
	callA := model.NewId()
	callB := model.NewId()
	user1 := model.NewId()
	user2 := model.NewId()

	require.NoError(t, store.RecordParticipantJoin(callA, public.IdentityTypeUser, user1, 100))
	require.NoError(t, store.RecordParticipantLeave(callA, public.IdentityTypeUser, user1, 200))
	require.NoError(t, store.RecordParticipantJoin(callA, public.IdentityTypeUser, user2, 150))
	require.NoError(t, store.RecordParticipantJoin(callB, public.IdentityTypeUser, user1, 300))

	t.Run("empty input returns empty map", func(t *testing.T) {
		got, err := store.GetParticipantsForCalls(nil, GetCallOpts{FromWriter: true})
		require.NoError(t, err)
		require.Empty(t, got)
	})

	t.Run("groups by call then identity", func(t *testing.T) {
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

// testPhoneIdentity covers the SIP callee: a "phone" identity recorded alongside
// a "user" identity in the same call, keyed by the E.164 number.
func testPhoneIdentity(t *testing.T, store *Store) {
	callID := model.NewId()
	userID := model.NewId()
	phoneNumber := "+15559876543"

	require.NoError(t, store.RecordParticipantJoin(callID, public.IdentityTypeUser, userID, 1000))
	require.NoError(t, store.RecordParticipantJoin(callID, public.IdentityTypePhone, phoneNumber, 1200))

	got, err := store.GetParticipantsForCalls([]string{callID}, GetCallOpts{FromWriter: true})
	require.NoError(t, err)

	require.Len(t, got[callID], 2, "user and phone identities coexist under one call")

	phone := got[callID][phoneNumber]
	require.NotNil(t, phone)
	require.Equal(t, public.IdentityTypePhone, phone.IdentityType)
	require.Equal(t, phoneNumber, phone.Identity)
	require.Equal(t, int64(1200), phone.FirstJoinAt)

	user := got[callID][userID]
	require.NotNil(t, user)
	require.Equal(t, public.IdentityTypeUser, user.IdentityType)
}
