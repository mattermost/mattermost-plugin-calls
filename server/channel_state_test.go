// Copyright (c) 2022-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"reflect"
	"testing"

	"github.com/mattermost/mattermost-server/server/public/model"

	"github.com/stretchr/testify/require"
)

func samePointer(t *testing.T, a, b interface{}) bool {
	t.Helper()
	return reflect.ValueOf(a).Pointer() == reflect.ValueOf(b).Pointer()
}

func TestUserStateGetClientState(t *testing.T) {
	t.Run("empty", func(t *testing.T) {
		var us userState
		require.Empty(t, us.getClientState())
	})

	t.Run("non-nil", func(t *testing.T) {
		us := &userState{
			Unmuted:    true,
			RaisedHand: 1000,
			JoinAt:     100,
		}

		cs := UserStateClient{
			Unmuted:    us.Unmuted,
			RaisedHand: us.RaisedHand,
		}

		require.Equal(t, cs, us.getClientState())
	})
}

func TestCallStateGetClientState(t *testing.T) {
	t.Run("empty", func(t *testing.T) {
		var cs callState
		var css CallStateClient
		css.Users = []string{}
		css.States = []UserStateClient{}
		require.Equal(t, &css, cs.getClientState("botID"))
	})

	t.Run("non-nil", func(t *testing.T) {
		cs := &callState{
			ID:      "test",
			StartAt: 100,
			Users: map[string]*userState{
				"userA": {
					JoinAt:     1000,
					RaisedHand: 1100,
				},
			},
			Sessions:        nil,
			ThreadID:        "threadID",
			ScreenSharingID: "screenSharingID",
			OwnerID:         "ownerID",
			HostID:          "hostID",
		}
		ccs := CallStateClient{
			ID:      cs.ID,
			StartAt: cs.StartAt,
			Users:   []string{"userA"},
			States: []UserStateClient{
				{RaisedHand: 1100},
			},
			ThreadID:        cs.ThreadID,
			ScreenSharingID: cs.ScreenSharingID,
			OwnerID:         cs.OwnerID,
			HostID:          cs.HostID,
		}

		require.Equal(t, &ccs, cs.getClientState("botID"))
	})

	t.Run("ignore botID", func(t *testing.T) {
		cs := &callState{
			ID:      "test",
			StartAt: 100,
			Users: map[string]*userState{
				"userA": {
					JoinAt:     1000,
					RaisedHand: 1100,
				},
				"botID": {
					JoinAt: 1200,
				},
			},
		}

		ccs := CallStateClient{
			ID:      "test",
			StartAt: 100,
			Users:   []string{"userA"},
			States: []UserStateClient{
				{RaisedHand: 1100},
			},
		}

		require.Equal(t, &ccs, cs.getClientState("botID"))
	})
}

func TestCallStateGetHostID(t *testing.T) {
	t.Run("empty", func(t *testing.T) {
		var cs callState
		require.Empty(t, cs.getHostID("botID"))
	})

	t.Run("singl user", func(t *testing.T) {
		cs := &callState{
			ID:      "test",
			StartAt: 100,
			Users: map[string]*userState{
				"userA": {
					JoinAt:     1000,
					RaisedHand: 1100,
				},
			},
		}

		require.Equal(t, "userA", cs.getHostID("botID"))
	})

	t.Run("multiple users", func(t *testing.T) {
		cs := &callState{
			ID:      "test",
			StartAt: 100,
			Users: map[string]*userState{
				"userA": {
					JoinAt:     1000,
					RaisedHand: 1100,
				},
				"userB": {
					JoinAt:  800,
					Unmuted: true,
				},
				"userC": {
					JoinAt:  1100,
					Unmuted: true,
				},
			},
		}

		require.Equal(t, "userB", cs.getHostID("botID"))
	})

	t.Run("skip botID", func(t *testing.T) {
		cs := &callState{
			ID:      "test",
			StartAt: 100,
			Users: map[string]*userState{
				"botID": {
					JoinAt: 800,
				},
				"userA": {
					JoinAt:     1000,
					RaisedHand: 1100,
				},
				"userB": {
					JoinAt:  1100,
					Unmuted: true,
				},
				"userC": {
					JoinAt:  1200,
					Unmuted: true,
				},
			},
		}

		require.Equal(t, "userA", cs.getHostID("botID"))
	})
}

func TestChannelStateClone(t *testing.T) {
	t.Run("nil", func(t *testing.T) {
		var cs *channelState
		require.Nil(t, cs.Clone())
	})

	t.Run("empty", func(t *testing.T) {
		var cs channelState
		cloned := cs.Clone()
		require.Empty(t, cloned)
		require.NotSame(t, &cs, cloned)
	})

	t.Run("nil call", func(t *testing.T) {
		cs := channelState{
			NodeID:  "nodeID",
			Enabled: model.NewBool(true),
		}
		cloned := cs.Clone()
		require.Equal(t, cs, *cloned)
		require.NotSame(t, &cs, cloned)
	})

	t.Run("with empty call", func(t *testing.T) {
		cs := channelState{
			NodeID:  "nodeID",
			Enabled: model.NewBool(true),
			Call:    &callState{},
		}
		cloned := cs.Clone()
		require.Equal(t, cs, *cloned)
		require.NotSame(t, &cs, cloned)
		require.NotSame(t, cs.Call, cloned.Call)
	})

	t.Run("with non-empty call", func(t *testing.T) {
		cs := &channelState{
			NodeID:  "nodeID",
			Enabled: model.NewBool(true),
			Call: &callState{
				Users: map[string]*userState{
					"userA": {
						JoinAt:  1000,
						Unmuted: true,
					},
					"userB": {
						JoinAt:  1000,
						Unmuted: true,
					},
					"userC": {
						JoinAt:  1000,
						Unmuted: true,
					},
				},
				Sessions: map[string]struct{}{
					"userA": {},
					"userC": {},
					"userB": {},
				},
				Recording: &recordingState{
					RecordingStateClient: RecordingStateClient{
						InitAt:  1100,
						StartAt: 1200,
					},
				},
			},
		}

		cloned := cs.Clone()
		require.Equal(t, cs, cloned)
		require.NotSame(t, cs, cloned)

		require.Condition(t, func() bool {
			return cs.Call != cloned.Call
		})

		require.Condition(t, func() bool {
			return !samePointer(t, cs.Call.Users, cloned.Call.Users)
		})

		require.Condition(t, func() bool {
			return !samePointer(t, cs.Call.Sessions, cloned.Call.Sessions)
		})

		require.Condition(t, func() bool {
			return !samePointer(t, cs.Call.Recording, cloned.Call.Recording)
		})

		require.Condition(t, func() bool {
			return cs.Call.Users["userA"] != cloned.Call.Users["userA"]
		})
	})
}

func TestRecordingStateGetClientState(t *testing.T) {
	t.Run("nil", func(t *testing.T) {
		var rs recordingState
		require.Empty(t, rs.getClientState())
	})

	t.Run("non-nil", func(t *testing.T) {
		rs := &recordingState{
			ID:        "recID",
			CreatorID: "creatorID",
			RecordingStateClient: RecordingStateClient{
				InitAt:  100,
				StartAt: 200,
				EndAt:   300,
			},
		}

		recState := &RecordingStateClient{
			InitAt:  100,
			StartAt: 200,
			EndAt:   300,
		}

		require.Equal(t, recState, rs.getClientState())
	})
}
