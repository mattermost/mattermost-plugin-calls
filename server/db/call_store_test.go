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

func TestCallsStore(t *testing.T) {
	t.Parallel()
	testStore(t, map[string]func(t *testing.T, store *Store){
		"TestCreateCall":            testCreateCall,
		"TestDeleteCall":            testDeleteCall,
		"TestDeleteCallByChannelID": testDeleteCallByChannelID,
		"TestUpdateCall":            testUpdateCall,
		"TestGetCall":               testGetCall,
		"TestGetCallByChannelID":    testGetCallByChannelID,
	})
}

func testCreateCall(t *testing.T, store *Store) {
	t.Run("empty", func(t *testing.T) {
		call, err := store.CreateCall(nil)
		require.EqualError(t, err, "call should not be nil")
		require.Nil(t, call)

		call, err = store.CreateCall(&public.Call{})
		require.EqualError(t, err, "invalid ChannelID: should not be empty")
		require.Nil(t, call)
	})

	t.Run("valid", func(t *testing.T) {
		call := &public.Call{
			ChannelID:    model.NewId(),
			StartAt:      time.Now().UnixMilli(),
			PostID:       model.NewId(),
			ThreadID:     model.NewId(),
			OwnerID:      model.NewId(),
			Participants: []string{model.NewId(), model.NewId()},
			Stats: public.CallStats{
				ScreenDuration: 45,
			},
			Props: public.CallProps{
				Hosts: []string{"userA", "userB"},
			},
		}

		call, err := store.CreateCall(call)
		require.NoError(t, err)
		require.NotNil(t, call)

		gotCall, err := store.GetCall(call.ID, GetCallOpts{
			FromWriter: true,
		})
		require.NoError(t, err)
		require.Equal(t, call, gotCall)
	})
}

func testDeleteCall(t *testing.T, store *Store) {
	t.Run("missing", func(t *testing.T) {
		err := store.DeleteCall("callID")
		require.EqualError(t, err, "failed to delete call")
	})

	t.Run("existing", func(t *testing.T) {
		call := &public.Call{
			ChannelID:    model.NewId(),
			StartAt:      time.Now().UnixMilli(),
			PostID:       model.NewId(),
			ThreadID:     model.NewId(),
			OwnerID:      model.NewId(),
			Participants: []string{model.NewId(), model.NewId()},
			Stats: public.CallStats{
				ScreenDuration: 45,
			},
			Props: public.CallProps{
				Hosts: []string{"userA", "userB"},
			},
		}

		call, err := store.CreateCall(call)
		require.NoError(t, err)
		require.NotNil(t, call)
		require.Zero(t, call.DeleteAt)

		now := time.Now().UnixMilli()

		err = store.DeleteCall(call.ID)
		require.NoError(t, err)

		call, err = store.GetCall(call.ID, GetCallOpts{FromWriter: true})
		require.NoError(t, err)
		require.GreaterOrEqual(t, call.DeleteAt, now)
	})
}

func testDeleteCallByChannelID(t *testing.T, store *Store) {
	t.Run("missing", func(t *testing.T) {
		err := store.DeleteCall("channelID")
		require.EqualError(t, err, "failed to delete call")
	})

	t.Run("existing", func(t *testing.T) {
		call := &public.Call{
			ChannelID:    model.NewId(),
			StartAt:      time.Now().UnixMilli(),
			PostID:       model.NewId(),
			ThreadID:     model.NewId(),
			OwnerID:      model.NewId(),
			Participants: []string{model.NewId(), model.NewId()},
			Stats: public.CallStats{
				ScreenDuration: 45,
			},
			Props: public.CallProps{
				Hosts: []string{"userA", "userB"},
			},
		}

		call, err := store.CreateCall(call)
		require.NoError(t, err)
		require.NotNil(t, call)
		require.Zero(t, call.DeleteAt)

		now := time.Now().UnixMilli()

		err = store.DeleteCallByChannelID(call.ChannelID)
		require.NoError(t, err)

		call, err = store.GetCall(call.ID, GetCallOpts{FromWriter: true})
		require.NoError(t, err)
		require.GreaterOrEqual(t, call.DeleteAt, now)
	})
}

func testUpdateCall(t *testing.T, store *Store) {
	t.Run("nil", func(t *testing.T) {
		var call *public.Call
		err := store.UpdateCall(call)
		require.EqualError(t, err, "call should not be nil")
	})

	t.Run("missing", func(t *testing.T) {
		err := store.UpdateCall(&public.Call{
			ID: "callID",
		})
		require.EqualError(t, err, "failed to update call")
	})

	t.Run("existing", func(t *testing.T) {
		call := &public.Call{
			ChannelID:    model.NewId(),
			StartAt:      time.Now().UnixMilli(),
			PostID:       model.NewId(),
			ThreadID:     model.NewId(),
			OwnerID:      model.NewId(),
			Participants: []string{model.NewId(), model.NewId()},
			Stats: public.CallStats{
				ScreenDuration: 45,
			},
			Props: public.CallProps{
				Hosts: []string{"userA", "userB"},
			},
		}

		call, err := store.CreateCall(call)
		require.NoError(t, err)
		require.NotNil(t, call)

		call.Participants = append(call.Participants, model.NewId())
		call.Stats.ScreenDuration = 4545
		call.Props.ScreenSharingSessionID = "sessionA"

		err = store.UpdateCall(call)
		require.NoError(t, err)

		gotCall, err := store.GetCall(call.ID, GetCallOpts{
			FromWriter: true,
		})
		require.NoError(t, err)
		require.Equal(t, call, gotCall)
	})
}

func testGetCall(t *testing.T, store *Store) {
	t.Run("missing", func(t *testing.T) {
		call, err := store.GetCall("callID", GetCallOpts{})
		require.EqualError(t, err, "call not found")
		require.Nil(t, call)
	})

	t.Run("existing", func(t *testing.T) {
		call := &public.Call{
			ChannelID:    model.NewId(),
			StartAt:      time.Now().UnixMilli(),
			PostID:       model.NewId(),
			ThreadID:     model.NewId(),
			OwnerID:      model.NewId(),
			Participants: []string{model.NewId(), model.NewId()},
			Stats: public.CallStats{
				ScreenDuration: 45,
			},
			Props: public.CallProps{
				Hosts: []string{"userA", "userB"},
			},
		}

		call, err := store.CreateCall(call)
		require.NoError(t, err)
		require.NotNil(t, call)

		gotCall, err := store.GetCall(call.ID, GetCallOpts{FromWriter: true})
		require.NoError(t, err)
		require.NotNil(t, gotCall)
		require.Equal(t, call, gotCall)
	})
}

func testGetCallByChannelID(t *testing.T, store *Store) {
	t.Run("missing", func(t *testing.T) {
		call, err := store.GetCallByChannelID("channelID", GetCallOpts{})
		require.EqualError(t, err, "call not found")
		require.Nil(t, call)
	})

	t.Run("existing", func(t *testing.T) {
		call := &public.Call{
			ChannelID:    model.NewId(),
			StartAt:      time.Now().UnixMilli(),
			PostID:       model.NewId(),
			ThreadID:     model.NewId(),
			OwnerID:      model.NewId(),
			Participants: []string{model.NewId(), model.NewId()},
			Stats: public.CallStats{
				ScreenDuration: 45,
			},
			Props: public.CallProps{
				Hosts: []string{"userA", "userB"},
			},
		}

		call, err := store.CreateCall(call)
		require.NoError(t, err)
		require.NotNil(t, call)

		gotCall, err := store.GetCallByChannelID(call.ChannelID, GetCallOpts{FromWriter: true})
		require.NoError(t, err)
		require.NotNil(t, gotCall)
		require.Equal(t, call, gotCall)
	})
}
