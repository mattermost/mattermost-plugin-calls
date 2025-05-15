// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"fmt"
	"reflect"
	"testing"
	"time"

	"github.com/mattermost/mattermost-plugin-calls/server/cluster"
	"github.com/mattermost/mattermost-plugin-calls/server/db"
	"github.com/mattermost/mattermost-plugin-calls/server/public"
	rtcd "github.com/mattermost/rtcd/service"
	"github.com/mattermost/rtcd/service/rtc"

	rtcdMocks "github.com/mattermost/mattermost-plugin-calls/server/mocks/github.com/mattermost/mattermost-plugin-calls/server/interfaces"
	serverMocks "github.com/mattermost/mattermost-plugin-calls/server/mocks/github.com/mattermost/mattermost-plugin-calls/server/interfaces"
	pluginMocks "github.com/mattermost/mattermost-plugin-calls/server/mocks/github.com/mattermost/mattermost/server/public/plugin"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/plugin"

	"github.com/stretchr/testify/mock"
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
			Sessions: []UserStateClient{
				{
					SessionID:  "sessionA",
					UserID:     "userA",
					RaisedHand: 1100,
				},
			},
			ThreadID:               cs.ThreadID,
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

func TestCleanUpState(t *testing.T) {
	mockAPI := &pluginMocks.MockAPI{}
	mockMetrics := &serverMocks.MockMetrics{}

	p := Plugin{
		MattermostPlugin: plugin.MattermostPlugin{
			API: mockAPI,
		},
		metrics:           mockMetrics,
		callsClusterLocks: map[string]*cluster.Mutex{},
	}

	store, tearDown := NewTestStore(t)
	t.Cleanup(tearDown)
	p.store = store

	t.Run("plugin mode", func(t *testing.T) {
		defer mockAPI.AssertExpectations(t)
		defer mockMetrics.AssertExpectations(t)

		t.Run("no calls", func(t *testing.T) {
			mockAPI.On("LogDebug", "cleaning up calls state",
				"origin", mock.AnythingOfType("string")).Once()

			err := p.cleanUpState()
			require.NoError(t, err)
		})

		t.Run("ongoing calls", func(t *testing.T) {
			defer ResetTestStore(t, p.store)

			channelID := model.NewId()
			postID := model.NewId()
			userID := model.NewId()
			callID := model.NewId()

			call := &public.Call{
				ID:        callID,
				CreateAt:  time.Now().UnixMilli(),
				ChannelID: channelID,
				StartAt:   time.Now().UnixMilli(),
				PostID:    postID,
				ThreadID:  model.NewId(),
				OwnerID:   userID,
			}
			err := p.store.CreateCall(call)
			require.NoError(t, err)

			createPost(t, store, postID, userID, channelID)

			err = p.store.CreateCallSession(&public.CallSession{
				ID:     "connA",
				CallID: callID,
				UserID: "userA",
				JoinAt: time.Now().UnixMilli(),
			})
			require.NoError(t, err)

			mockAPI.On("LogDebug", "cleaning up calls state",
				"origin", mock.AnythingOfType("string")).Once()

			mockAPI.On("LogDebug", "creating cluster mutex for call",
				"origin", mock.AnythingOfType("string"), "channelID", channelID).Once()

			mockAPI.On("KVSetWithOptions", mock.Anything, mock.Anything, mock.Anything).Return(true, nil)

			mockMetrics.On("ObserveClusterMutexGrabTime", "mutex_call", mock.AnythingOfType("float64"))
			mockMetrics.On("ObserveClusterMutexLockedTime", "mutex_call", mock.AnythingOfType("float64"))

			mockAPI.On("UpdatePost", mock.AnythingOfType("*model.Post")).Return(&model.Post{Id: postID}, nil).Once()
			mockAPI.On("GetConfig").Return(&model.Config{}, nil).Once()
			mockAPI.On("KVDelete", "mutex_call_"+channelID).Return(nil)

			err = p.cleanUpState()
			require.NoError(t, err)

			// Verify the call has ended and sessions have been deleted
			calls, err := p.store.GetAllActiveCalls(db.GetCallOpts{})
			require.NoError(t, err)
			require.Empty(t, calls)
			sessions, err := p.store.GetCallSessions(callID, db.GetCallSessionOpts{})
			require.NoError(t, err)
			require.Empty(t, sessions)
		})
	})

	t.Run("rtcd", func(t *testing.T) {
		defer mockAPI.AssertExpectations(t)
		defer mockMetrics.AssertExpectations(t)

		t.Run("no calls", func(t *testing.T) {
			p.rtcdManager = &rtcdClientManager{
				ctx: &Plugin{
					MattermostPlugin: plugin.MattermostPlugin{
						API: mockAPI,
					},
				},
				hosts: map[string]*rtcdHost{},
			}

			mockAPI.On("LogDebug", "cleaning up calls state",
				"origin", mock.AnythingOfType("string")).Once()

			err := p.cleanUpState()
			require.NoError(t, err)
		})

		t.Run("no rtcd host", func(t *testing.T) {
			defer ResetTestStore(t, p.store)

			channelID := model.NewId()
			postID := model.NewId()
			userID := model.NewId()
			callID := model.NewId()

			call := &public.Call{
				ID:        callID,
				CreateAt:  time.Now().UnixMilli(),
				ChannelID: channelID,
				StartAt:   time.Now().UnixMilli(),
				PostID:    postID,
				ThreadID:  model.NewId(),
				OwnerID:   userID,
				Props: public.CallProps{
					RTCDHost: "127.0.0.1",
				},
			}
			err := p.store.CreateCall(call)
			require.NoError(t, err)

			createPost(t, store, postID, userID, channelID)

			err = p.store.CreateCallSession(&public.CallSession{
				ID:     "connA",
				CallID: callID,
				UserID: "userA",
				JoinAt: time.Now().UnixMilli(),
			})
			require.NoError(t, err)

			p.rtcdManager = &rtcdClientManager{
				ctx: &Plugin{
					MattermostPlugin: plugin.MattermostPlugin{
						API: mockAPI,
					},
				},
				hosts: map[string]*rtcdHost{},
			}

			mockAPI.On("LogDebug", "cleaning up calls state",
				"origin", mock.AnythingOfType("string")).Once()

			mockAPI.On("LogDebug", "creating cluster mutex for call",
				"origin", mock.AnythingOfType("string"), "channelID", channelID).Once()

			mockAPI.On("KVSetWithOptions", mock.Anything, mock.Anything, mock.Anything).Return(true, nil)

			mockMetrics.On("ObserveClusterMutexGrabTime", "mutex_call", mock.AnythingOfType("float64"))
			mockMetrics.On("ObserveClusterMutexLockedTime", "mutex_call", mock.AnythingOfType("float64"))

			mockAPI.On("UpdatePost", mock.AnythingOfType("*model.Post")).Return(&model.Post{Id: postID}, nil).Once()
			mockAPI.On("GetConfig").Return(&model.Config{}, nil).Once()
			mockAPI.On("KVDelete", "mutex_call_"+channelID).Return(nil)

			mockAPI.On("LogDebug", "RTCD host is set in call, checking...",
				"origin", mock.AnythingOfType("string"), "callID", callID, "rtcdHost", "127.0.0.1").Once()

			mockAPI.On("LogDebug", "RTCD host not found",
				"origin", mock.AnythingOfType("string"), "callID", callID, "rtcdHost", "127.0.0.1").Once()

			err = p.cleanUpState()
			require.NoError(t, err)

			// Verify the call has ended and sessions have been deleted
			calls, err := p.store.GetAllActiveCalls(db.GetCallOpts{})
			require.NoError(t, err)
			require.Empty(t, calls)
			sessions, err := p.store.GetCallSessions(callID, db.GetCallSessionOpts{})
			require.NoError(t, err)
			require.Empty(t, sessions)
		})

		t.Run("rtcd host but no call", func(t *testing.T) {
			defer ResetTestStore(t, p.store)

			channelID := model.NewId()
			postID := model.NewId()
			userID := model.NewId()
			callID := model.NewId()

			call := &public.Call{
				ID:        callID,
				CreateAt:  time.Now().UnixMilli(),
				ChannelID: channelID,
				StartAt:   time.Now().UnixMilli(),
				PostID:    postID,
				ThreadID:  model.NewId(),
				OwnerID:   userID,
				Props: public.CallProps{
					RTCDHost: "127.0.0.1",
				},
			}
			err := p.store.CreateCall(call)
			require.NoError(t, err)

			createPost(t, store, postID, userID, channelID)

			err = p.store.CreateCallSession(&public.CallSession{
				ID:     "connA",
				CallID: callID,
				UserID: "userA",
				JoinAt: time.Now().UnixMilli(),
			})
			require.NoError(t, err)

			mockRTCDClient := &rtcdMocks.MockRTCDClient{}
			defer mockRTCDClient.AssertExpectations(t)

			p.rtcdManager = &rtcdClientManager{
				ctx: &Plugin{
					MattermostPlugin: plugin.MattermostPlugin{
						API: mockAPI,
					},
				},
				hosts: map[string]*rtcdHost{
					"127.0.0.1": {
						client: mockRTCDClient,
					},
				},
			}

			mockAPI.On("LogDebug", "cleaning up calls state",
				"origin", mock.AnythingOfType("string")).Once()

			mockAPI.On("LogDebug", "creating cluster mutex for call",
				"origin", mock.AnythingOfType("string"), "channelID", channelID).Once()

			mockAPI.On("KVSetWithOptions", mock.Anything, mock.Anything, mock.Anything).Return(true, nil)

			mockMetrics.On("ObserveClusterMutexGrabTime", "mutex_call", mock.AnythingOfType("float64"))
			mockMetrics.On("ObserveClusterMutexLockedTime", "mutex_call", mock.AnythingOfType("float64"))

			mockAPI.On("UpdatePost", mock.AnythingOfType("*model.Post")).Return(&model.Post{Id: postID}, nil).Once()
			mockAPI.On("GetConfig").Return(&model.Config{}, nil).Once()
			mockAPI.On("KVDelete", "mutex_call_"+channelID).Return(nil)

			mockAPI.On("LogDebug", "RTCD host is set in call, checking...",
				"origin", mock.AnythingOfType("string"), "callID", callID, "rtcdHost", "127.0.0.1").Once()

			mockAPI.On("LogDebug", "RTCD host found",
				"origin", mock.AnythingOfType("string"), "callID", callID, "rtcdHost", "127.0.0.1").Once()

			mockRTCDClient.On("GetVersionInfo").Return(rtcd.VersionInfo{}, nil)

			mockAPI.On("LogDebug", "skipping version compatibility check",
				"origin", mock.AnythingOfType("string"), "buildVersion", "", "callID", callID, "rtcdHost", "127.0.0.1").Once()

			mockRTCDClient.On("GetSessions", callID).Return(nil, 404, fmt.Errorf("call not found"))

			mockAPI.On("LogDebug", "failed to get sessions for call",
				"origin", mock.AnythingOfType("string"), "err", "call not found", "callID", callID, "rtcdHost", "127.0.0.1").Once()

			mockAPI.On("LogDebug", "call was not found",
				"origin", mock.AnythingOfType("string"), "callID", callID, "rtcdHost", "127.0.0.1").Once()

			err = p.cleanUpState()
			require.NoError(t, err)

			// Verify the call has ended and sessions have been deleted
			calls, err := p.store.GetAllActiveCalls(db.GetCallOpts{})
			require.NoError(t, err)
			require.Empty(t, calls)
			sessions, err := p.store.GetCallSessions(callID, db.GetCallSessionOpts{})
			require.NoError(t, err)
			require.Empty(t, sessions)
		})

		t.Run("rtcd host and active call", func(t *testing.T) {
			defer ResetTestStore(t, p.store)

			channelID := model.NewId()
			postID := model.NewId()
			userID := model.NewId()
			callID := model.NewId()

			call := &public.Call{
				ID:        callID,
				CreateAt:  time.Now().UnixMilli(),
				ChannelID: channelID,
				StartAt:   time.Now().UnixMilli(),
				PostID:    postID,
				ThreadID:  model.NewId(),
				OwnerID:   userID,
				Props: public.CallProps{
					RTCDHost: "127.0.0.1",
				},
			}
			err := p.store.CreateCall(call)
			require.NoError(t, err)

			createPost(t, store, postID, userID, channelID)

			err = p.store.CreateCallSession(&public.CallSession{
				ID:     "connA",
				CallID: callID,
				UserID: "userA",
				JoinAt: time.Now().UnixMilli(),
			})
			require.NoError(t, err)

			mockRTCDClient := &rtcdMocks.MockRTCDClient{}
			defer mockRTCDClient.AssertExpectations(t)

			p.rtcdManager = &rtcdClientManager{
				ctx: &Plugin{
					MattermostPlugin: plugin.MattermostPlugin{
						API: mockAPI,
					},
				},
				hosts: map[string]*rtcdHost{
					"127.0.0.1": {
						client: mockRTCDClient,
					},
				},
			}

			mockAPI.On("LogDebug", "cleaning up calls state",
				"origin", mock.AnythingOfType("string")).Once()

			mockAPI.On("LogDebug", "creating cluster mutex for call",
				"origin", mock.AnythingOfType("string"), "channelID", channelID).Once()

			mockAPI.On("KVSetWithOptions", mock.Anything, mock.Anything, mock.Anything).Return(true, nil)

			mockMetrics.On("ObserveClusterMutexGrabTime", "mutex_call", mock.AnythingOfType("float64"))
			mockMetrics.On("ObserveClusterMutexLockedTime", "mutex_call", mock.AnythingOfType("float64"))

			mockAPI.On("KVDelete", "mutex_call_"+channelID).Return(nil)

			mockAPI.On("LogDebug", "RTCD host is set in call, checking...",
				"origin", mock.AnythingOfType("string"), "callID", callID, "rtcdHost", "127.0.0.1").Once()

			mockAPI.On("LogDebug", "RTCD host found",
				"origin", mock.AnythingOfType("string"), "callID", callID, "rtcdHost", "127.0.0.1").Once()

			mockRTCDClient.On("GetVersionInfo").Return(rtcd.VersionInfo{}, nil)

			mockAPI.On("LogDebug", "skipping version compatibility check",
				"origin", mock.AnythingOfType("string"), "buildVersion", "", "callID", callID, "rtcdHost", "127.0.0.1").Once()

			mockRTCDClient.On("GetSessions", callID).Return([]rtc.SessionConfig{
				{
					SessionID: "connA",
					CallID:    callID,
				},
			}, 200, nil)

			mockAPI.On("LogDebug", "call is still ongoing",
				"origin", mock.AnythingOfType("string"), "callID", callID, "rtcdHost", "127.0.0.1").Once()

			err = p.cleanUpState()
			require.NoError(t, err)

			// Verify call and sessions are retained.
			calls, err := p.store.GetAllActiveCalls(db.GetCallOpts{})
			require.NoError(t, err)
			require.NotEmpty(t, calls)
			sessions, err := p.store.GetCallSessions(callID, db.GetCallSessionOpts{})
			require.NoError(t, err)
			require.NotEmpty(t, sessions)
		})

		t.Run("API request failure", func(t *testing.T) {
			defer ResetTestStore(t, p.store)

			channelID := model.NewId()
			postID := model.NewId()
			userID := model.NewId()
			callID := model.NewId()

			call := &public.Call{
				ID:        callID,
				CreateAt:  time.Now().UnixMilli(),
				ChannelID: channelID,
				StartAt:   time.Now().UnixMilli(),
				PostID:    postID,
				ThreadID:  model.NewId(),
				OwnerID:   userID,
				Props: public.CallProps{
					RTCDHost: "127.0.0.1",
				},
			}
			err := p.store.CreateCall(call)
			require.NoError(t, err)

			createPost(t, store, postID, userID, channelID)

			err = p.store.CreateCallSession(&public.CallSession{
				ID:     "connA",
				CallID: callID,
				UserID: "userA",
				JoinAt: time.Now().UnixMilli(),
			})
			require.NoError(t, err)

			mockRTCDClient := &rtcdMocks.MockRTCDClient{}
			defer mockRTCDClient.AssertExpectations(t)

			p.rtcdManager = &rtcdClientManager{
				ctx: &Plugin{
					MattermostPlugin: plugin.MattermostPlugin{
						API: mockAPI,
					},
				},
				hosts: map[string]*rtcdHost{
					"127.0.0.1": {
						client: mockRTCDClient,
					},
				},
			}

			mockAPI.On("LogDebug", "cleaning up calls state",
				"origin", mock.AnythingOfType("string")).Once()

			mockAPI.On("LogDebug", "creating cluster mutex for call",
				"origin", mock.AnythingOfType("string"), "channelID", channelID).Once()

			mockAPI.On("KVSetWithOptions", mock.Anything, mock.Anything, mock.Anything).Return(true, nil)

			mockMetrics.On("ObserveClusterMutexGrabTime", "mutex_call", mock.AnythingOfType("float64"))
			mockMetrics.On("ObserveClusterMutexLockedTime", "mutex_call", mock.AnythingOfType("float64"))

			mockAPI.On("KVDelete", "mutex_call_"+channelID).Return(nil)

			mockAPI.On("LogDebug", "RTCD host is set in call, checking...",
				"origin", mock.AnythingOfType("string"), "callID", callID, "rtcdHost", "127.0.0.1").Once()

			mockAPI.On("LogDebug", "RTCD host found",
				"origin", mock.AnythingOfType("string"), "callID", callID, "rtcdHost", "127.0.0.1").Once()

			mockRTCDClient.On("GetVersionInfo").Return(rtcd.VersionInfo{}, nil)

			mockAPI.On("LogDebug", "skipping version compatibility check",
				"origin", mock.AnythingOfType("string"), "buildVersion", "", "callID", callID, "rtcdHost", "127.0.0.1").Once()

			mockRTCDClient.On("GetSessions", callID).Return(nil, 500, fmt.Errorf("internal server error"))

			mockAPI.On("LogDebug", "failed to get sessions for call",
				"origin", mock.AnythingOfType("string"), "err", "internal server error", "callID", callID, "rtcdHost", "127.0.0.1").Once()

			mockAPI.On("LogDebug", "unexpected status code from RTCD",
				"origin", mock.AnythingOfType("string"), "code", 500, "callID", callID, "rtcdHost", "127.0.0.1").Once()

			err = p.cleanUpState()
			require.NoError(t, err)

			// Verify call and sessions are retained.
			calls, err := p.store.GetAllActiveCalls(db.GetCallOpts{})
			require.NoError(t, err)
			require.NotEmpty(t, calls)
			sessions, err := p.store.GetCallSessions(callID, db.GetCallSessionOpts{})
			require.NoError(t, err)
			require.NotEmpty(t, sessions)
		})

		t.Run("version compatibility failure", func(t *testing.T) {
			defer ResetTestStore(t, p.store)

			channelID := model.NewId()
			postID := model.NewId()
			userID := model.NewId()
			callID := model.NewId()

			call := &public.Call{
				ID:        callID,
				CreateAt:  time.Now().UnixMilli(),
				ChannelID: channelID,
				StartAt:   time.Now().UnixMilli(),
				PostID:    postID,
				ThreadID:  model.NewId(),
				OwnerID:   userID,
				Props: public.CallProps{
					RTCDHost: "127.0.0.1",
				},
			}
			err := p.store.CreateCall(call)
			require.NoError(t, err)

			createPost(t, store, postID, userID, channelID)

			err = p.store.CreateCallSession(&public.CallSession{
				ID:     "connA",
				CallID: callID,
				UserID: "userA",
				JoinAt: time.Now().UnixMilli(),
			})
			require.NoError(t, err)

			mockRTCDClient := &rtcdMocks.MockRTCDClient{}
			defer mockRTCDClient.AssertExpectations(t)

			p.rtcdManager = &rtcdClientManager{
				ctx: &Plugin{
					MattermostPlugin: plugin.MattermostPlugin{
						API: mockAPI,
					},
				},
				hosts: map[string]*rtcdHost{
					"127.0.0.1": {
						client: mockRTCDClient,
					},
				},
			}

			mockAPI.On("LogDebug", "cleaning up calls state",
				"origin", mock.AnythingOfType("string")).Once()

			mockAPI.On("LogDebug", "creating cluster mutex for call",
				"origin", mock.AnythingOfType("string"), "channelID", channelID).Once()

			mockAPI.On("KVSetWithOptions", mock.Anything, mock.Anything, mock.Anything).Return(true, nil)

			mockMetrics.On("ObserveClusterMutexGrabTime", "mutex_call", mock.AnythingOfType("float64"))
			mockMetrics.On("ObserveClusterMutexLockedTime", "mutex_call", mock.AnythingOfType("float64"))

			mockAPI.On("KVDelete", "mutex_call_"+channelID).Return(nil).Once()

			mockAPI.On("LogDebug", "RTCD host is set in call, checking...",
				"origin", mock.AnythingOfType("string"), "callID", callID, "rtcdHost", "127.0.0.1").Once()

			mockAPI.On("LogDebug", "RTCD host found",
				"origin", mock.AnythingOfType("string"), "callID", callID, "rtcdHost", "127.0.0.1").Once()

			mockRTCDClient.On("GetVersionInfo").Return(rtcd.VersionInfo{BuildVersion: "v0.17.0"}, nil)

			mockAPI.On("LogDebug", "RTCD host version is not compatible",
				"origin", mock.AnythingOfType("string"), "err", "current version (v0.17.0) is lower than minimum supported version (v1.0.0)", "callID", callID, "rtcdHost", "127.0.0.1").Once()

			err = p.cleanUpState()
			require.NoError(t, err)

			// Verify call and sessions are retained.
			calls, err := p.store.GetAllActiveCalls(db.GetCallOpts{})
			require.NoError(t, err)
			require.NotEmpty(t, calls)
			sessions, err := p.store.GetCallSessions(callID, db.GetCallSessionOpts{})
			require.NoError(t, err)
			require.NotEmpty(t, sessions)
		})
	})
}
