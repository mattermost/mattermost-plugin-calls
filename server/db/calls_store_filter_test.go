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

func TestGetCallsFilter(t *testing.T) {
	testStore(t, map[string]func(t *testing.T, store *Store){
		"TestGetCalls": testGetCalls,
	})
}

func testGetCalls(t *testing.T, store *Store) {
	mkCall := func(channelID string, startAt int64) *public.Call {
		call := &public.Call{
			ID:        model.NewId(),
			ChannelID: channelID,
			StartAt:   startAt,
			CreateAt:  time.Now().UnixMilli(),
			OwnerID:   model.NewId(),
		}
		require.NoError(t, store.CreateCall(call))
		return call
	}

	chanA := model.NewId()
	chanB := model.NewId()

	a1 := mkCall(chanA, 1000)
	a2 := mkCall(chanA, 3000)
	b1 := mkCall(chanB, 2000)
	deleted := mkCall(chanA, 2500)
	require.NoError(t, store.DeleteCall(deleted.ID))

	ids := func(calls []*public.Call) []string {
		out := make([]string, len(calls))
		for i, c := range calls {
			out[i] = c.ID
		}
		return out
	}

	t.Run("no filter returns all non-deleted, newest first", func(t *testing.T) {
		got, err := store.GetCalls(GetCallsFilter{}, GetCallOpts{FromWriter: true})
		require.NoError(t, err)
		// a2(3000) > b1(2000) > a1(1000); deleted excluded.
		require.Equal(t, []string{a2.ID, b1.ID, a1.ID}, ids(got))
	})

	t.Run("channel filter", func(t *testing.T) {
		got, err := store.GetCalls(GetCallsFilter{ChannelIDs: []string{chanA}}, GetCallOpts{FromWriter: true})
		require.NoError(t, err)
		require.Equal(t, []string{a2.ID, a1.ID}, ids(got))
	})

	t.Run("date range is inclusive", func(t *testing.T) {
		got, err := store.GetCalls(GetCallsFilter{FromStartAt: 1000, ToStartAt: 2000}, GetCallOpts{FromWriter: true})
		require.NoError(t, err)
		require.Equal(t, []string{b1.ID, a1.ID}, ids(got))
	})

	t.Run("limit keeps newest", func(t *testing.T) {
		got, err := store.GetCalls(GetCallsFilter{Limit: 1}, GetCallOpts{FromWriter: true})
		require.NoError(t, err)
		require.Equal(t, []string{a2.ID}, ids(got))
	})

	t.Run("deleted call excluded", func(t *testing.T) {
		got, err := store.GetCalls(GetCallsFilter{}, GetCallOpts{FromWriter: true})
		require.NoError(t, err)
		require.NotContains(t, ids(got), deleted.ID)
	})
}
