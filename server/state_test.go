// Copyright (c) 2022-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"fmt"
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
		css.Users = []string{}
		css.States = []UserStateClient{}
		css.Sessions = css.States
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
					Hosts:                  []string{"hostID"},
					ScreenSharingSessionID: "sessionA",
				},
			},
			sessions: map[string]*public.CallSession{
				"sessionA": {
					ID:         "sessionA",
					UserID:     "userA",
					JoinAt:     1000,
					RaisedHand: 1100,
				},
			},
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
			ScreenSharingSessionID: cs.Props.ScreenSharingSessionID,
			OwnerID:                cs.OwnerID,
			HostID:                 cs.Props.Hosts[0],
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
					ID:         "sessionA",
					UserID:     "userA",
					JoinAt:     1000,
					RaisedHand: 1100,
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
			Users: []string{"userA", "userA", "userB"},
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
			Call: public.Call{
				ID:      "test",
				StartAt: 100,
			},
			sessions: map[string]*public.CallSession{
				"sessionA": {
					ID:         "sessionA",
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
			Call: public.Call{
				ID:      "test",
				StartAt: 100,
			},
			sessions: map[string]*public.CallSession{
				"sessionA": {
					ID:         "sessionA",
					UserID:     "userA",
					JoinAt:     1000,
					RaisedHand: 1100,
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
					ID:         "sessionA",
					UserID:     "userA",
					JoinAt:     1000,
					RaisedHand: 1100,
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

func TestGetClientStateFromCallJob(t *testing.T) {
	t.Run("nil", func(t *testing.T) {
		var job *public.CallJob
		require.Empty(t, getClientStateFromCallJob(job))
	})

	t.Run("non-nil", func(t *testing.T) {
		job := &public.CallJob{
			ID:        "recID",
			CreatorID: "creatorID",
			InitAt:    100,
			StartAt:   200,
			EndAt:     300,
		}

		recState := &JobStateClient{
			InitAt:  100,
			StartAt: 200,
			EndAt:   300,
		}

		require.Equal(t, recState, getClientStateFromCallJob(job))
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
					Hosts:                  []string{model.NewId()},
					RTCDHost:               model.NewId(),
					ScreenSharingSessionID: model.NewId(),
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
					ID:         model.NewId(),
					CallID:     model.NewId(),
					UserID:     model.NewId(),
					JoinAt:     time.Now().UnixMilli(),
					RaisedHand: time.Now().UnixMilli(),
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
			Recording: &public.CallJob{
				ID:        model.NewId(),
				CallID:    model.NewId(),
				CreatorID: model.NewId(),
				InitAt:    time.Now().UnixMilli(),
				StartAt:   time.Now().UnixMilli(),
				Props: public.CallJobProps{
					JobID:     model.NewId(),
					BotConnID: model.NewId(),
				},
			},
			Transcription: &public.CallJob{
				ID:        model.NewId(),
				CallID:    model.NewId(),
				CreatorID: model.NewId(),
				InitAt:    time.Now().UnixMilli(),
				StartAt:   time.Now().UnixMilli(),
				Props: public.CallJobProps{
					JobID:     model.NewId(),
					BotConnID: model.NewId(),
				},
			},
			LiveCaptions: &public.CallJob{
				ID:        model.NewId(),
				CallID:    model.NewId(),
				CreatorID: model.NewId(),
				InitAt:    time.Now().UnixMilli(),
				StartAt:   time.Now().UnixMilli(),
				Props: public.CallJobProps{
					JobID:     model.NewId(),
					BotConnID: model.NewId(),
				},
			},
		}

		csCopy := cs.Clone()
		require.Equal(t, cs, csCopy)

		require.False(t, samePointer(t, cs.sessions, csCopy.sessions))

		for k := range cs.sessions {
			require.False(t, samePointer(t, cs.sessions[k], csCopy.sessions[k]))
		}
	})
}

func BenchmarkCallStateClone(b *testing.B) {
	cs := &callState{
		Call: public.Call{
			ID:        model.NewId(),
			ChannelID: model.NewId(),
			StartAt:   time.Now().UnixMilli(),
			PostID:    model.NewId(),
			ThreadID:  model.NewId(),
			OwnerID:   model.NewId(),
			Stats: public.CallStats{
				ScreenDuration: 45,
			},
			Props: public.CallProps{},
		},
		Recording: &public.CallJob{
			ID:        model.NewId(),
			CallID:    model.NewId(),
			CreatorID: model.NewId(),
			InitAt:    time.Now().UnixMilli(),
			StartAt:   time.Now().UnixMilli(),
			Props: public.CallJobProps{
				JobID:     model.NewId(),
				BotConnID: model.NewId(),
			},
		},
		Transcription: &public.CallJob{
			ID:        model.NewId(),
			CallID:    model.NewId(),
			CreatorID: model.NewId(),
			InitAt:    time.Now().UnixMilli(),
			StartAt:   time.Now().UnixMilli(),
			Props: public.CallJobProps{
				JobID:     model.NewId(),
				BotConnID: model.NewId(),
			},
		},
		LiveCaptions: &public.CallJob{
			ID:        model.NewId(),
			CallID:    model.NewId(),
			CreatorID: model.NewId(),
			InitAt:    time.Now().UnixMilli(),
			StartAt:   time.Now().UnixMilli(),
			Props: public.CallJobProps{
				JobID:     model.NewId(),
				BotConnID: model.NewId(),
			},
		},
	}

	m := map[int]*callState{
		0:     cs.Clone(),
		10:    cs.Clone(),
		100:   cs.Clone(),
		1000:  cs.Clone(),
		10000: cs.Clone(),
	}

	for k := range m {
		cs := m[k]
		cs.sessions = make(map[string]*public.CallSession)
		for i := 0; i < k; i++ {
			id := model.NewId()
			cs.sessions[id] = &public.CallSession{
				ID:     id,
				CallID: model.NewId(),
				UserID: model.NewId(),
				JoinAt: time.Now().UnixMilli(),
			}
		}
	}

	b.ResetTimer()
	for k := range m {
		b.Run(fmt.Sprintf("%d sessions", k), func(b *testing.B) {
			b.ReportAllocs()
			for i := 0; i < b.N; i++ {
				cs = m[k]
				csCopy := cs.Clone()
				b.StopTimer()
				require.Equal(b, cs, csCopy)
				require.False(b, samePointer(b, cs, csCopy))
				b.StartTimer()
			}
		})
	}
}
