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
		"TestCreateCall":               testCreateCall,
		"TestDeleteCall":               testDeleteCall,
		"TestDeleteCallByChannelID":    testDeleteCallByChannelID,
		"TestUpdateCall":               testUpdateCall,
		"TestGetCall":                  testGetCall,
		"TestGetActiveCallByChannelID": testGetActiveCallByChannelID,
		"TestGetRTCDHostForCall":       testGetRTCDHostForCall,
		"TestGetAllActiveCalls":        testGetAllActiveCalls,
		"TestGetCallActive":            testGetCallActive,
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
}

func testDeleteCallByChannelID(t *testing.T, store *Store) {
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
}

func testUpdateCall(t *testing.T, store *Store) {
	t.Run("nil", func(t *testing.T) {
		var call *public.Call
		err := store.UpdateCall(call)
		require.EqualError(t, err, "invalid call: should not be nil")
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

func testGetCallActive(t *testing.T, store *Store) {
	t.Run("none", func(t *testing.T) {
		active, err := store.GetCallActive("callID", GetCallOpts{})
		require.NoError(t, err)
		require.False(t, active)
	})

	t.Run("active", func(t *testing.T) {
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

		active, err := store.GetCallActive(call.ChannelID, GetCallOpts{FromWriter: true})
		require.NoError(t, err)
		require.True(t, active)
	})

	t.Run("ended", func(t *testing.T) {
		call := &public.Call{
			ID:           model.NewId(),
			CreateAt:     time.Now().UnixMilli(),
			ChannelID:    model.NewId(),
			StartAt:      time.Now().UnixMilli(),
			EndAt:        time.Now().UnixMilli() + 1,
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

		active, err := store.GetCallActive(call.ChannelID, GetCallOpts{FromWriter: true})
		require.NoError(t, err)
		require.False(t, active)
	})

	t.Run("deleted", func(t *testing.T) {
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

		active, err := store.GetCallActive(call.ChannelID, GetCallOpts{FromWriter: true})
		require.NoError(t, err)
		require.True(t, active)

		err = store.DeleteCall(call.ID)
		require.NoError(t, err)

		active, err = store.GetCallActive(call.ChannelID, GetCallOpts{FromWriter: true})
		require.NoError(t, err)
		require.False(t, active)
	})
}

func testGetActiveCallByChannelID(t *testing.T, store *Store) {
	t.Run("missing", func(t *testing.T) {
		call, err := store.GetActiveCallByChannelID("channelID", GetCallOpts{})
		require.EqualError(t, err, "call not found")
		require.Nil(t, call)
	})

	t.Run("multiple active calls", func(t *testing.T) {
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

		call.ID = model.NewId()
		call.StartAt = call.StartAt + 45
		err = store.CreateCall(call)
		require.NoError(t, err)

		gotCall, err := store.GetActiveCallByChannelID(call.ChannelID, GetCallOpts{FromWriter: true})
		require.NoError(t, err)
		require.NotNil(t, gotCall)
		require.Equal(t, call, gotCall)
	})

	t.Run("ended call", func(t *testing.T) {
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

		gotCall, err := store.GetActiveCallByChannelID(call.ChannelID, GetCallOpts{FromWriter: true})
		require.NoError(t, err)
		require.NotNil(t, gotCall)
		require.Equal(t, call, gotCall)

		call.EndAt = time.Now().UnixMilli()
		err = store.UpdateCall(call)
		require.NoError(t, err)

		gotCall, err = store.GetActiveCallByChannelID(call.ChannelID, GetCallOpts{FromWriter: true})
		require.EqualError(t, err, "call not found")
		require.Nil(t, gotCall)
	})
}

func testGetRTCDHostForCall(t *testing.T, store *Store) {
	t.Run("missing", func(t *testing.T) {
		host, err := store.GetRTCDHostForCall("callID", GetCallOpts{})
		require.EqualError(t, err, "call not found")
		require.Empty(t, host)
	})

	t.Run("unset", func(t *testing.T) {
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

		host, err := store.GetRTCDHostForCall(call.ID, GetCallOpts{})
		require.NoError(t, err)
		require.Empty(t, host)
	})

	t.Run("set", func(t *testing.T) {
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
				Hosts:    []string{"userA", "userB"},
				RTCDHost: "192.168.1.1",
			},
		}

		err := store.CreateCall(call)
		require.NoError(t, err)

		host, err := store.GetRTCDHostForCall(call.ID, GetCallOpts{})
		require.NoError(t, err)
		require.Equal(t, call.Props.RTCDHost, host)
	})
}

func testGetAllActiveCalls(t *testing.T, store *Store) {
	t.Run("no calls", func(t *testing.T) {
		calls, err := store.GetAllActiveCalls(GetCallOpts{})
		require.NoError(t, err)
		require.Empty(t, calls)
	})

	t.Run("multiple calls", func(t *testing.T) {
		var calls []*public.Call
		for i := 0; i < 10; i++ {
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
			calls = append(calls, call)
		}

		gotCalls, err := store.GetAllActiveCalls(GetCallOpts{})
		require.NoError(t, err)
		require.ElementsMatch(t, calls, gotCalls)
	})
}
