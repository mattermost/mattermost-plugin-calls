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
		err := store.CreateCall(nil)
		require.EqualError(t, err, "invalid call: should not be nil")

		err = store.CreateCall(&public.Call{})
		require.EqualError(t, err, "invalid call: invalid ID: should not be empty")

		err = store.CreateCall(&public.Call{
			ID: model.NewId(),
		})
		require.EqualError(t, err, "invalid call: invalid ChannelID: should not be empty")

		err = store.CreateCall(&public.Call{
			ID:        model.NewId(),
			ChannelID: model.NewId(),
		})
		require.EqualError(t, err, "invalid call: invalid StartAt: should be > 0")

		err = store.CreateCall(&public.Call{
			ID:        model.NewId(),
			ChannelID: model.NewId(),
			StartAt:   time.Now().UnixMilli(),
		})
		require.EqualError(t, err, "invalid call: invalid CreateAt: should be > 0")

		err = store.CreateCall(&public.Call{
			ID:        model.NewId(),
			ChannelID: model.NewId(),
			StartAt:   time.Now().UnixMilli(),
			CreateAt:  time.Now().UnixMilli(),
		})
		require.EqualError(t, err, "invalid call: invalid PostID: should not be empty")

		err = store.CreateCall(&public.Call{
			ID:        model.NewId(),
			ChannelID: model.NewId(),
			StartAt:   time.Now().UnixMilli(),
			CreateAt:  time.Now().UnixMilli(),
			PostID:    model.NewId(),
		})
		require.EqualError(t, err, "invalid call: invalid ThreadID: should not be empty")

		err = store.CreateCall(&public.Call{
			ID:        model.NewId(),
			ChannelID: model.NewId(),
			StartAt:   time.Now().UnixMilli(),
			CreateAt:  time.Now().UnixMilli(),
			PostID:    model.NewId(),
			ThreadID:  model.NewId(),
		})
		require.EqualError(t, err, "invalid call: invalid OwnerID: should not be empty")

		err = store.CreateCall(&public.Call{
			ID:        model.NewId(),
			ChannelID: model.NewId(),
			StartAt:   time.Now().UnixMilli(),
			CreateAt:  time.Now().UnixMilli(),
			PostID:    model.NewId(),
			ThreadID:  model.NewId(),
			OwnerID:   model.NewId(),
			DeleteAt:  1000,
		})
		require.EqualError(t, err, "invalid call: invalid DeleteAt: should be zero")
	})

	t.Run("valid", func(t *testing.T) {
		call := &public.Call{
			ID:           model.NewId(),
			CreateAt:     time.Now().UnixMilli(),
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

		err := store.CreateCall(call)
		require.NoError(t, err)

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
			ID:           model.NewId(),
			CreateAt:     time.Now().UnixMilli(),
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

		err := store.CreateCall(call)
		require.NoError(t, err)

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
			ID:           model.NewId(),
			CreateAt:     time.Now().UnixMilli(),
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

		err := store.CreateCall(call)
		require.NoError(t, err)

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
		require.EqualError(t, err, "invalid call: should not be nil")
	})

	t.Run("missing", func(t *testing.T) {
		err := store.UpdateCall(&public.Call{
			ID:        model.NewId(),
			CreateAt:  time.Now().UnixMilli(),
			ChannelID: model.NewId(),
			StartAt:   time.Now().UnixMilli(),
			PostID:    model.NewId(),
			ThreadID:  model.NewId(),
			OwnerID:   model.NewId(),
		})
		require.EqualError(t, err, "failed to update call")
	})

	t.Run("existing", func(t *testing.T) {
		call := &public.Call{
			ID:           model.NewId(),
			CreateAt:     time.Now().UnixMilli(),
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

		err := store.CreateCall(call)
		require.NoError(t, err)

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
			ID:           model.NewId(),
			CreateAt:     time.Now().UnixMilli(),
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

		err := store.CreateCall(call)
		require.NoError(t, err)

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
			ID:           model.NewId(),
			CreateAt:     time.Now().UnixMilli(),
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

		err := store.CreateCall(call)
		require.NoError(t, err)

		gotCall, err := store.GetCallByChannelID(call.ChannelID, GetCallOpts{FromWriter: true})
		require.NoError(t, err)
		require.NotNil(t, gotCall)
		require.Equal(t, call, gotCall)
	})
}
