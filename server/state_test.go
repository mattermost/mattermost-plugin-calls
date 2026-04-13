// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"reflect"
	"testing"
	"time"

	"github.com/mattermost/mattermost-plugin-calls/server/public"

	"github.com/mattermost/mattermost/server/public/model"

	"github.com/stretchr/testify/require"
)

func TestCallStateGetClientState(t *testing.T) {
	t.Run("empty", func(t *testing.T) {
		var cs callState
		var css CallStateClient
		css.Sessions = []UserStateClient{}
		require.Equal(t, &css, cs.getClientState("botID", "userID"))
	})

	t.Run("non-nil", func(t *testing.T) {
		cs := &callState{
			Call: public.Call{
				ID:       "test",
				StartAt:  100,
				ThreadID: "threadID",
				OwnerID:  "ownerID",
				Props: public.CallProps{
					Hosts: []string{"hostID"},
				},
			},
			sessions: map[string]*public.CallSession{
				"sessionA": {
					ID:     "sessionA",
					UserID: "userA",
					JoinAt: 1000,
				},
			},
		}
		ccs := CallStateClient{
			ID:      cs.ID,
			StartAt: cs.StartAt,
			Sessions: []UserStateClient{
				{
					SessionID: "sessionA",
					UserID:    "userA",
				},
			},
			ThreadID: cs.ThreadID,
			OwnerID:  cs.OwnerID,
			HostID:   cs.Props.Hosts[0],
		}

		require.Equal(t, &ccs, cs.getClientState("botID", "userID"))
	})

	t.Run("ignore botID", func(t *testing.T) {
		cs := &callState{
			Call: public.Call{
				ID:      "test",
				StartAt: 100,
			},
			sessions: map[string]*public.CallSession{
				"sessionA": {
					ID:     "sessionA",
					UserID: "userA",
					JoinAt: 1000,
				},
				"botSessionID": {
					ID:     "botSessionID",
					UserID: "botID",
					JoinAt: 1200,
				},
			},
		}

		ccs := CallStateClient{
			ID:      "test",
			StartAt: 100,
			Sessions: []UserStateClient{
				{
					SessionID: "sessionA",
					UserID:    "userA",
				},
			},
		}

		require.Equal(t, &ccs, cs.getClientState("botID", "userID"))
	})

	t.Run("multiple sessions per user", func(t *testing.T) {
		cs := &callState{
			Call: public.Call{
				ID:      "test",
				StartAt: 100,
			},
			sessions: map[string]*public.CallSession{
				"sessionA": {
					ID:     "sessionA",
					UserID: "userA",
					JoinAt: 1000,
				},
				"sessionB": {
					ID:     "sessionB",
					UserID: "userA",
					JoinAt: 1100,
				},
				"sessionC": {
					ID:     "sessionC",
					UserID: "userB",
					JoinAt: 1200,
				},
			},
		}

		ccs := CallStateClient{
			Sessions: []UserStateClient{
				{
					SessionID: "sessionA",
					UserID:    "userA",
				},
				{
					SessionID: "sessionB",
					UserID:    "userA",
				},
				{
					SessionID: "sessionC",
					UserID:    "userB",
				},
			},
		}

		actualCS := cs.getClientState("botID", "")

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
			Call: public.Call{
				ID:      "test",
				StartAt: 100,
			},
			sessions: map[string]*public.CallSession{
				"sessionA": {
					ID:     "sessionA",
					UserID: "userA",
					JoinAt: 1000,
				},
			},
		}

		require.Equal(t, "userA", cs.getHostID("botID"))
	})

	t.Run("multiple users", func(t *testing.T) {
		cs := &callState{
			Call: public.Call{
				ID:      "test",
				StartAt: 100,
			},
			sessions: map[string]*public.CallSession{
				"sessionA": {
					ID:     "sessionA",
					UserID: "userA",
					JoinAt: 1000,
				},
				"sessionB": {
					ID:      "sessionB",
					UserID:  "userB",
					JoinAt:  800,
					Unmuted: true,
				},
				"sessionC": {
					ID:      "sessionC",
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
			Call: public.Call{
				ID:      "test",
				StartAt: 100,
			},
			sessions: map[string]*public.CallSession{
				"botSessionID": {
					ID:     "botSessionID",
					UserID: "botID",
					JoinAt: 800,
				},
				"sessionA": {
					ID:     "sessionA",
					UserID: "userA",
					JoinAt: 1000,
				},
				"sessionB": {
					ID:      "sessionB",
					UserID:  "userB",
					JoinAt:  1100,
					Unmuted: true,
				},
				"sessionC": {
					ID:      "sessionC",
					UserID:  "userC",
					JoinAt:  1200,
					Unmuted: true,
				},
			},
		}

		require.Equal(t, "userA", cs.getHostID("botID"))
	})

	t.Run("returns existing host", func(t *testing.T) {
		cs := &callState{
			Call: public.Call{
				ID:      "test",
				StartAt: 100,
				Props: public.CallProps{
					Hosts: []string{"userE"},
				},
			},
			sessions: map[string]*public.CallSession{
				"sessionA": {
					UserID: "userA",
					JoinAt: 1000,
				},
				"sessionB": {
					UserID: "userB",
					JoinAt: 800,
				},
				"sessionC": {
					UserID: "userC",
					JoinAt: 1100,
				},
				"sessionD": {
					UserID: "userD",
					JoinAt: 700,
				},
				"sessionE": {
					UserID: "userE",
					JoinAt: 1500,
				},
			},
		}

		require.Equal(t, "userE", cs.getHostID("botID"))
	})
}

func samePointer(t testing.TB, a, b interface{}) bool {
	t.Helper()
	return reflect.ValueOf(a).Pointer() == reflect.ValueOf(b).Pointer()
}

func TestCallStateClone(t *testing.T) {
	t.Run("nil", func(t *testing.T) {
		var cs *callState
		csCopy := cs.Clone()
		require.Nil(t, csCopy)
	})

	t.Run("empty", func(t *testing.T) {
		cs := new(callState)
		csCopy := cs.Clone()
		require.Equal(t, cs, csCopy)
	})

	t.Run("full", func(t *testing.T) {
		cs := &callState{
			Call: public.Call{
				ID:           model.NewId(),
				ChannelID:    model.NewId(),
				StartAt:      time.Now().UnixMilli(),
				PostID:       model.NewId(),
				ThreadID:     model.NewId(),
				OwnerID:      model.NewId(),
				Participants: []string{model.NewId(), model.NewId(), model.NewId()},
				Stats: public.CallStats{
					ScreenDuration: 45,
				},
				Props: public.CallProps{
					Hosts: []string{model.NewId()},
					DismissedNotification: map[string]bool{
						model.NewId(): true,
						model.NewId(): true,
						model.NewId(): false,
					},
					Participants: map[string]struct{}{
						model.NewId(): {},
						model.NewId(): {},
						model.NewId(): {},
					},
				},
			},
			sessions: map[string]*public.CallSession{
				model.NewId(): {
					ID:     model.NewId(),
					CallID: model.NewId(),
					UserID: model.NewId(),
					JoinAt: time.Now().UnixMilli(),
				},
				model.NewId(): {
					ID:      model.NewId(),
					CallID:  model.NewId(),
					UserID:  model.NewId(),
					JoinAt:  time.Now().UnixMilli(),
					Unmuted: true,
				},
				model.NewId(): {
					ID:     model.NewId(),
					CallID: model.NewId(),
					UserID: model.NewId(),
					JoinAt: time.Now().UnixMilli(),
				},
			},
		}

		csCopy := cs.Clone()
		require.Equal(t, cs, csCopy)

		// Verify deep copy: mutating the clone should not affect original.
		require.False(t, samePointer(t, cs.sessions, csCopy.sessions))
		require.False(t, samePointer(t, cs.Props.Hosts, csCopy.Props.Hosts))
		require.False(t, samePointer(t, cs.Props.DismissedNotification, csCopy.Props.DismissedNotification))
		require.False(t, samePointer(t, cs.Props.Participants, csCopy.Props.Participants))
	})
}
