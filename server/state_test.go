// Copyright (c) 2022-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"reflect"
	"testing"

	"github.com/mattermost/mattermost/server/public/model"

	"github.com/stretchr/testify/require"
)

func samePointer(t *testing.T, a, b interface{}) bool {
	t.Helper()
	return reflect.ValueOf(a).Pointer() == reflect.ValueOf(b).Pointer()
}

func TestUserStateGetClientState(t *testing.T) {
	t.Run("empty", func(t *testing.T) {
		var us userState
		require.Empty(t, us.getClientState(""))
	})

	t.Run("non-nil", func(t *testing.T) {
		us := &userState{
			UserID:     "userID",
			Unmuted:    true,
			RaisedHand: 1000,
			JoinAt:     100,
		}

		cs := UserStateClient{
			SessionID:  "sessionID",
			UserID:     "userID",
			Unmuted:    us.Unmuted,
			RaisedHand: us.RaisedHand,
		}

		require.Equal(t, cs, us.getClientState("sessionID"))
	})
}

func TestCallStateGetClientState(t *testing.T) {
	t.Run("empty", func(t *testing.T) {
		var cs callState
		var css CallStateClient
		css.Users = []string{}
		css.States = []UserStateClient{}
		css.Sessions = css.States
		require.Equal(t, &css, cs.getClientState("botID", "userID"))
	})

	t.Run("non-nil", func(t *testing.T) {
		cs := &callState{
			ID:      "test",
			StartAt: 100,
			Sessions: map[string]*userState{
				"sessionA": {
					UserID:     "userA",
					JoinAt:     1000,
					RaisedHand: 1100,
				},
			},
			ThreadID:        "threadID",
			ScreenSharingID: "sessionA",
			OwnerID:         "ownerID",
			HostID:          "hostID",
		}
		ccs := CallStateClient{
			ID:      cs.ID,
			StartAt: cs.StartAt,
			Users:   []string{"userA"},
			States: []UserStateClient{
				{
					SessionID:  "sessionA",
					UserID:     "userA",
					RaisedHand: 1100,
				},
			},
			Sessions: []UserStateClient{
				{
					SessionID:  "sessionA",
					UserID:     "userA",
					RaisedHand: 1100,
				},
			},
			ThreadID:               cs.ThreadID,
			ScreenSharingID:        "userA",
			ScreenSharingSessionID: cs.ScreenSharingID,
			OwnerID:                cs.OwnerID,
			HostID:                 cs.HostID,
		}

		require.Equal(t, &ccs, cs.getClientState("botID", "userID"))
	})

	t.Run("ignore botID", func(t *testing.T) {
		cs := &callState{
			ID:      "test",
			StartAt: 100,
			Sessions: map[string]*userState{
				"sessionA": {
					UserID:     "userA",
					JoinAt:     1000,
					RaisedHand: 1100,
				},
				"botSessionID": {
					UserID: "botID",
					JoinAt: 1200,
				},
			},
		}

		ccs := CallStateClient{
			ID:      "test",
			StartAt: 100,
			Users:   []string{"userA"},
			States: []UserStateClient{
				{
					SessionID:  "sessionA",
					UserID:     "userA",
					RaisedHand: 1100,
				},
			},
			Sessions: []UserStateClient{
				{
					SessionID:  "sessionA",
					UserID:     "userA",
					RaisedHand: 1100,
				},
			},
		}

		require.Equal(t, &ccs, cs.getClientState("botID", "userID"))
	})

	t.Run("multiple sessions per user", func(t *testing.T) {
		cs := &callState{
			ID:      "test",
			StartAt: 100,
			Sessions: map[string]*userState{
				"sessionA": {
					UserID: "userA",
					JoinAt: 1000,
				},
				"sessionB": {
					UserID: "userA",
					JoinAt: 1100,
				},
				"sessionC": {
					UserID: "userB",
					JoinAt: 1200,
				},
			},
		}

		ccs := CallStateClient{
			ID:      "test",
			StartAt: 100,
			Users:   []string{"userA", "userA", "userB"},
			States: []UserStateClient{
				{
					SessionID:  "sessionA",
					UserID:     "userA",
					RaisedHand: 0,
				},
				{
					SessionID:  "sessionB",
					UserID:     "userA",
					RaisedHand: 0,
				},
				{
					SessionID:  "sessionC",
					UserID:     "userB",
					RaisedHand: 0,
				},
			},
			Sessions: []UserStateClient{
				{
					SessionID:  "sessionA",
					UserID:     "userA",
					RaisedHand: 0,
				},
				{
					SessionID:  "sessionB",
					UserID:     "userA",
					RaisedHand: 0,
				},
				{
					SessionID:  "sessionC",
					UserID:     "userB",
					RaisedHand: 0,
				},
			},
		}

		actualCS := cs.getClientState("botID", "")

		require.ElementsMatch(t, ccs.Users, actualCS.Users)
		require.ElementsMatch(t, ccs.States, actualCS.States)
		require.ElementsMatch(t, ccs.Sessions, actualCS.Sessions)
	})
}

func TestCallStateGetHostID(t *testing.T) {
	t.Run("empty", func(t *testing.T) {
		var cs callState
		require.Empty(t, cs.getHostID("botID"))
	})

	t.Run("single user", func(t *testing.T) {
		cs := &callState{
			ID:      "test",
			StartAt: 100,
			Sessions: map[string]*userState{
				"sessionA": {
					UserID:     "userA",
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
			Sessions: map[string]*userState{
				"sessionA": {
					UserID:     "userA",
					JoinAt:     1000,
					RaisedHand: 1100,
				},
				"sessionB": {
					UserID:  "userB",
					JoinAt:  800,
					Unmuted: true,
				},
				"sessionC": {
					UserID:  "userC",
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
			Sessions: map[string]*userState{
				"botSessionID": {
					UserID: "botID",
					JoinAt: 800,
				},
				"sessionA": {
					UserID:     "userA",
					JoinAt:     1000,
					RaisedHand: 1100,
				},
				"sessionB": {
					UserID:  "userB",
					JoinAt:  1100,
					Unmuted: true,
				},
				"sessionC": {
					UserID:  "userC",
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
				Sessions: map[string]*userState{
					"sessionA": {
						UserID:  "userA",
						JoinAt:  1000,
						Unmuted: true,
					},
					"sessionB": {
						UserID:  "userB",
						JoinAt:  1000,
						Unmuted: true,
					},
					"sessionC": {
						UserID:  "userC",
						JoinAt:  1000,
						Unmuted: true,
					},
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
			return !samePointer(t, cs.Call.Sessions, cloned.Call.Sessions)
		})

		require.Condition(t, func() bool {
			return !samePointer(t, cs.Call.Recording, cloned.Call.Recording)
		})

		require.Condition(t, func() bool {
			return cs.Call.Sessions["sessionA"] != cloned.Call.Sessions["sessionA"]
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
