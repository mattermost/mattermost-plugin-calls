// Copyright (c) 2022-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"fmt"
	"net/http"
	"os"
	"sync"
	"testing"
	"time"

	"github.com/mattermost/mattermost-plugin-calls/server/batching"
	"github.com/mattermost/mattermost-plugin-calls/server/cluster"
	"github.com/mattermost/mattermost-plugin-calls/server/public"

	serverMocks "github.com/mattermost/mattermost-plugin-calls/server/mocks/github.com/mattermost/mattermost-plugin-calls/server/interfaces"
	pluginMocks "github.com/mattermost/mattermost-plugin-calls/server/mocks/github.com/mattermost/mattermost/server/public/plugin"
	rtcMocks "github.com/mattermost/mattermost-plugin-calls/server/mocks/github.com/mattermost/rtcd/service/rtc"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/plugin"

	"github.com/mattermost/rtcd/service/rtc"

	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
)

func TestHandleBotWSReconnect(t *testing.T) {
	mockAPI := &pluginMocks.MockAPI{}
	mockMetrics := &serverMocks.MockMetrics{}

	p := Plugin{
		MattermostPlugin: plugin.MattermostPlugin{
			API: mockAPI,
		},
		callsClusterLocks: map[string]*cluster.Mutex{},
		metrics:           mockMetrics,
	}

	store, tearDown := NewTestStore(t)
	t.Cleanup(tearDown)
	p.store = store

	mockAPI.On("LogDebug", mock.Anything, mock.Anything, mock.Anything,
		mock.Anything, mock.Anything, mock.Anything, mock.Anything,
		mock.Anything, mock.Anything, mock.Anything, mock.Anything)
	mockAPI.On("KVSetWithOptions", mock.Anything, mock.Anything, mock.Anything).Return(true, nil)
	mockMetrics.On("ObserveClusterMutexGrabTime", "mutex_call", mock.AnythingOfType("float64"))
	mockMetrics.On("ObserveClusterMutexLockedTime", "mutex_call", mock.AnythingOfType("float64"))
	mockMetrics.On("ObserveAppHandlersTime", mock.AnythingOfType("string"), mock.AnythingOfType("float64"))
	mockMetrics.On("IncStoreOp", "KVGet")
	mockMetrics.On("IncStoreOp", "KVSet")

	channelID := model.NewId()

	t.Run("no call ongoing", func(t *testing.T) {
		mockAPI.On("KVDelete", "mutex_call_"+channelID).Return(nil).Once()
		err := p.handleBotWSReconnect("connID", "prevConnID", "originalConnID", channelID)
		require.NoError(t, err)
	})

	t.Run("no job", func(t *testing.T) {
		err := p.store.CreateCall(&public.Call{
			ID:        model.NewId(),
			CreateAt:  time.Now().UnixMilli(),
			ChannelID: channelID,
			StartAt:   time.Now().UnixMilli(),
			PostID:    model.NewId(),
			ThreadID:  model.NewId(),
			OwnerID:   model.NewId(),
		})
		require.NoError(t, err)

		mockAPI.On("KVDelete", "mutex_call_"+channelID).Return(nil).Once()

		err = p.handleBotWSReconnect("connID", "prevConnID", "originalConnID", channelID)
		require.NoError(t, err)
	})

	t.Run("only recording job", func(t *testing.T) {
		defer ResetTestStore(t, p.store)
		call := &public.Call{
			ID:        model.NewId(),
			CreateAt:  time.Now().UnixMilli(),
			ChannelID: channelID,
			StartAt:   time.Now().UnixMilli(),
			PostID:    model.NewId(),
			ThreadID:  model.NewId(),
			OwnerID:   model.NewId(),
		}
		err := p.store.CreateCall(call)
		require.NoError(t, err)

		err = p.store.CreateCallJob(&public.CallJob{
			ID:        model.NewId(),
			CallID:    call.ID,
			Type:      public.JobTypeRecording,
			CreatorID: model.NewId(),
			InitAt:    time.Now().UnixMilli(),
			StartAt:   time.Now().UnixMilli() + 1000,
			Props: public.CallJobProps{
				BotConnID: "prevConnID",
			},
		})
		require.NoError(t, err)

		cs, err := p.getCallState(channelID, true)
		require.NoError(t, err)

		require.Equal(t, "prevConnID", cs.Recording.Props.BotConnID)

		mockAPI.On("KVDelete", "mutex_call_"+channelID).Return(nil).Once()

		err = p.handleBotWSReconnect("connID", "prevConnID", "originalConnID", channelID)
		require.NoError(t, err)

		cs, err = p.getCallState(channelID, true)
		require.NoError(t, err)
		require.Equal(t, "connID", cs.Recording.Props.BotConnID)
	})

	t.Run("only transcribing job", func(t *testing.T) {
		defer ResetTestStore(t, p.store)
		call := &public.Call{
			ID:        model.NewId(),
			CreateAt:  time.Now().UnixMilli(),
			ChannelID: channelID,
			StartAt:   time.Now().UnixMilli(),
			PostID:    model.NewId(),
			ThreadID:  model.NewId(),
			OwnerID:   model.NewId(),
		}
		err := p.store.CreateCall(call)
		require.NoError(t, err)

		err = p.store.CreateCallJob(&public.CallJob{
			ID:        model.NewId(),
			CallID:    call.ID,
			Type:      public.JobTypeTranscribing,
			CreatorID: model.NewId(),
			InitAt:    time.Now().UnixMilli(),
			StartAt:   time.Now().UnixMilli() + 1000,
			Props: public.CallJobProps{
				BotConnID: "prevConnID",
			},
		})
		require.NoError(t, err)

		cs, err := p.getCallState(channelID, true)
		require.NoError(t, err)

		require.Equal(t, "prevConnID", cs.Transcription.Props.BotConnID)

		mockAPI.On("KVDelete", "mutex_call_"+channelID).Return(nil).Once()

		err = p.handleBotWSReconnect("connID", "prevConnID", "originalConnID", channelID)
		require.NoError(t, err)

		cs, err = p.getCallState(channelID, true)
		require.NoError(t, err)
		require.Equal(t, "connID", cs.Transcription.Props.BotConnID)
	})

	t.Run("both jobs", func(t *testing.T) {
		defer ResetTestStore(t, p.store)

		call := &public.Call{
			ID:        model.NewId(),
			CreateAt:  time.Now().UnixMilli(),
			ChannelID: channelID,
			StartAt:   time.Now().UnixMilli(),
			PostID:    model.NewId(),
			ThreadID:  model.NewId(),
			OwnerID:   model.NewId(),
		}
		err := p.store.CreateCall(call)
		require.NoError(t, err)

		err = p.store.CreateCallJob(&public.CallJob{
			ID:        model.NewId(),
			CallID:    call.ID,
			Type:      public.JobTypeRecording,
			CreatorID: model.NewId(),
			InitAt:    time.Now().UnixMilli(),
			StartAt:   time.Now().UnixMilli() + 1000,
			Props: public.CallJobProps{
				BotConnID: "prevRecordingBotConnID",
			},
		})
		require.NoError(t, err)

		err = p.store.CreateCallJob(&public.CallJob{
			ID:        model.NewId(),
			CallID:    call.ID,
			Type:      public.JobTypeTranscribing,
			CreatorID: model.NewId(),
			InitAt:    time.Now().UnixMilli(),
			StartAt:   time.Now().UnixMilli() + 1000,
			Props: public.CallJobProps{
				BotConnID: "prevTranscribingBotConnID",
			},
		})
		require.NoError(t, err)

		t.Run("recording", func(t *testing.T) {
			cs, err := p.getCallState(channelID, true)
			require.NoError(t, err)
			require.Equal(t, "prevRecordingBotConnID", cs.Recording.Props.BotConnID)

			mockAPI.On("KVDelete", "mutex_call_"+channelID).Return(nil).Once()

			err = p.handleBotWSReconnect("newRecordingBotConnID", "prevRecordingBotConnID", "originalConnID", channelID)
			require.NoError(t, err)

			cs, err = p.getCallState(channelID, true)
			require.NoError(t, err)
			require.Equal(t, "newRecordingBotConnID", cs.Recording.Props.BotConnID)
		})

		t.Run("transcription", func(t *testing.T) {
			cs, err := p.getCallState(channelID, true)
			require.NoError(t, err)
			require.Equal(t, "prevTranscribingBotConnID", cs.Transcription.Props.BotConnID)

			mockAPI.On("KVDelete", "mutex_call_"+channelID).Return(nil).Once()

			err = p.handleBotWSReconnect("newTranscribingBotConnID", "prevTranscribingBotConnID", "originalConnID", channelID)
			require.NoError(t, err)

			cs, err = p.getCallState(channelID, true)
			require.NoError(t, err)
			require.Equal(t, "newTranscribingBotConnID", cs.Transcription.Props.BotConnID)
		})
	})
}

func TestWSReader(t *testing.T) {
	mockAPI := &pluginMocks.MockAPI{}
	mockMetrics := &serverMocks.MockMetrics{}

	p := Plugin{
		MattermostPlugin: plugin.MattermostPlugin{
			API: mockAPI,
		},
		callsClusterLocks: map[string]*cluster.Mutex{},
		metrics:           mockMetrics,
	}

	t.Run("user session validation", func(t *testing.T) {
		sessionAuthCheckInterval = time.Second

		t.Run("empty session ID", func(_ *testing.T) {
			us := newUserSession("userID", "channelID", "connID", "callID", false)
			var wg sync.WaitGroup
			wg.Add(1)
			go func() {
				defer wg.Done()
				p.wsReader(us, "", "handlerID")
			}()

			time.Sleep(time.Second)
			close(us.wsCloseCh)

			wg.Wait()
		})

		t.Run("valid session", func(_ *testing.T) {
			mockAPI.On("GetSession", "authSessionID").Return(&model.Session{
				Id:        "authSessionID",
				ExpiresAt: time.Now().UnixMilli() + 60000,
			}, nil).Once()

			us := newUserSession("userID", "channelID", "connID", "callID", false)
			var wg sync.WaitGroup
			wg.Add(1)
			go func() {
				defer wg.Done()
				p.wsReader(us, "authSessionID", "handlerID")
			}()

			time.Sleep(time.Second)
			close(us.wsCloseCh)

			wg.Wait()
		})

		t.Run("valid session, no expiration", func(_ *testing.T) {
			mockAPI.On("GetSession", "authSessionID").Return(&model.Session{
				Id: "authSessionID",
			}, nil).Once()

			us := newUserSession("userID", "channelID", "connID", "callID", false)
			var wg sync.WaitGroup
			wg.Add(1)
			go func() {
				defer wg.Done()
				p.wsReader(us, "authSessionID", "handlerID")
			}()

			time.Sleep(time.Second)
			close(us.wsCloseCh)

			wg.Wait()
		})

		t.Run("expired session", func(_ *testing.T) {
			expiresAt := time.Now().UnixMilli()
			us := newUserSession("userID", "channelID", "connID", "callID", false)

			mockAPI.On("GetSession", "authSessionID").Return(&model.Session{
				Id:        "authSessionID",
				ExpiresAt: expiresAt,
			}, nil).Once()

			mockAPI.On("LogInfo", "invalid or expired session, closing RTC session",
				"origin", mock.AnythingOfType("string"),
				"channelID", us.channelID, "userID", us.userID, "connID", us.connID,
				"sessionID", "authSessionID", "expiresAt", fmt.Sprintf("%d", expiresAt)).Once()

			mockAPI.On("LogDebug", "closeRTCSession",
				"origin", mock.AnythingOfType("string"),
				"userID", us.userID, "connID", us.connID, "channelID", us.channelID).Once()

			var wg sync.WaitGroup
			wg.Add(1)
			go func() {
				defer wg.Done()
				p.wsReader(us, "authSessionID", "handlerID")
			}()

			time.Sleep(2 * time.Second)
			close(us.wsCloseCh)

			wg.Wait()
		})

		t.Run("revoked session", func(_ *testing.T) {
			us := newUserSession("userID", "channelID", "connID", "callID", false)

			mockAPI.On("GetSession", "authSessionID").Return(nil,
				model.NewAppError("GetSessionById", "We encountered an error finding the session.", nil, "", http.StatusUnauthorized)).Once()

			mockAPI.On("LogInfo", "invalid or expired session, closing RTC session",
				"origin", mock.AnythingOfType("string"),
				"channelID", us.channelID, "userID", us.userID, "connID", us.connID,
				"err", "GetSessionById: We encountered an error finding the session.").Once()

			mockAPI.On("LogDebug", "closeRTCSession",
				"origin", mock.AnythingOfType("string"),
				"userID", us.userID, "connID", us.connID, "channelID", us.channelID).Once()

			var wg sync.WaitGroup
			wg.Add(1)
			go func() {
				defer wg.Done()
				p.wsReader(us, "authSessionID", "handlerID")
			}()

			time.Sleep(time.Second * 2)
			close(us.wsCloseCh)

			wg.Wait()
		})
	})
}

func TestHandleCallStateRequest(t *testing.T) {
	mockAPI := &pluginMocks.MockAPI{}
	mockMetrics := &serverMocks.MockMetrics{}

	p := Plugin{
		MattermostPlugin: plugin.MattermostPlugin{
			API: mockAPI,
		},
		callsClusterLocks: map[string]*cluster.Mutex{},
		metrics:           mockMetrics,
	}

	store, tearDown := NewTestStore(t)
	t.Cleanup(tearDown)
	p.store = store

	mockAPI.On("LogDebug", mock.Anything, mock.Anything, mock.Anything,
		mock.Anything, mock.Anything, mock.Anything, mock.Anything,
		mock.Anything, mock.Anything, mock.Anything, mock.Anything)
	mockAPI.On("KVSetWithOptions", mock.Anything, mock.Anything, mock.Anything).Return(true, nil)
	mockMetrics.On("ObserveClusterMutexGrabTime", "mutex_call", mock.AnythingOfType("float64"))
	mockMetrics.On("ObserveClusterMutexLockedTime", "mutex_call", mock.AnythingOfType("float64"))
	mockMetrics.On("ObserveAppHandlersTime", mock.AnythingOfType("string"), mock.AnythingOfType("float64"))
	mockMetrics.On("IncStoreOp", "KVGet")
	mockMetrics.On("IncStoreOp", "KVSet")

	channelID := model.NewId()
	userID := model.NewId()
	connID := model.NewId()

	t.Run("no permissions", func(t *testing.T) {
		mockAPI.On("KVDelete", "mutex_call_"+channelID).Return(nil).Once()
		mockAPI.On("HasPermissionToChannel", userID, channelID, model.PermissionReadChannel).Return(false).Once()
		err := p.handleCallStateRequest(channelID, userID, connID)
		require.EqualError(t, err, "forbidden")
	})

	t.Run("no call ongoing", func(t *testing.T) {
		mockAPI.On("KVDelete", "mutex_call_"+channelID).Return(nil).Once()
		mockAPI.On("HasPermissionToChannel", userID, channelID, model.PermissionReadChannel).Return(true).Once()
		err := p.handleCallStateRequest(channelID, userID, connID)
		require.EqualError(t, err, "no call ongoing")
	})

	t.Run("active call", func(t *testing.T) {
		err := p.store.CreateCall(&public.Call{
			ID:        model.NewId(),
			CreateAt:  time.Now().UnixMilli(),
			ChannelID: channelID,
			StartAt:   time.Now().UnixMilli(),
			PostID:    model.NewId(),
			ThreadID:  model.NewId(),
			OwnerID:   model.NewId(),
		})
		require.NoError(t, err)

		mockAPI.On("KVDelete", "mutex_call_"+channelID).Return(nil).Once()
		mockAPI.On("HasPermissionToChannel", userID, channelID, model.PermissionReadChannel).Return(true).Once()
		mockMetrics.On("IncWebSocketEvent", "out", "call_state").Once()
		mockAPI.On("PublishWebSocketEvent", "call_state", mock.Anything, mock.Anything).Once()

		err = p.handleCallStateRequest(channelID, userID, connID)
		require.NoError(t, err)
	})
}

func TestWebSocketBroadcastToModel(t *testing.T) {
	t.Run("nil/empty", func(t *testing.T) {
		var wsb *WebSocketBroadcast
		require.Nil(t, wsb.ToModel())

		wsb = &WebSocketBroadcast{}
		require.NotNil(t, wsb.ToModel())
		require.Empty(t, wsb.ToModel())
	})

	t.Run("not empty", func(t *testing.T) {
		wsb := &WebSocketBroadcast{
			ChannelID:           "channelID",
			UserID:              "userID",
			ConnectionID:        "connID",
			ReliableClusterSend: true,
			OmitUsers: map[string]bool{
				"userA": true,
				"userB": true,
			},
			UserIDs: []string{
				"userC",
				"userD",
			},
		}
		require.Equal(t, &model.WebsocketBroadcast{
			ChannelId:           wsb.ChannelID,
			UserId:              wsb.UserID,
			ConnectionId:        wsb.ConnectionID,
			ReliableClusterSend: wsb.ReliableClusterSend,
			OmitUsers:           wsb.OmitUsers,
		}, wsb.ToModel())
	})
}

func TestPublishWebSocketEvent(t *testing.T) {
	mockAPI := &pluginMocks.MockAPI{}
	mockMetrics := &serverMocks.MockMetrics{}

	p := Plugin{
		MattermostPlugin: plugin.MattermostPlugin{
			API: mockAPI,
		},
		callsClusterLocks: map[string]*cluster.Mutex{},
		metrics:           mockMetrics,
	}

	callChannelID := model.NewId()
	botUserID := model.NewId()

	t.Run("bot", func(t *testing.T) {
		p.botSession = &model.Session{
			UserId: botUserID,
		}
		defer func() { p.botSession = nil }()

		t.Run("wsEventUserJoined/wsEventUserLeft", func(t *testing.T) {
			p.publishWebSocketEvent(wsEventUserJoined, map[string]any{
				"user_id": botUserID,
			}, nil)

			p.publishWebSocketEvent(wsEventUserLeft, map[string]any{
				"user_id": botUserID,
			}, nil)

			mockMetrics.AssertNotCalled(t, "IncWebSocketEvent")
			mockAPI.AssertNotCalled(t, "PublishWebSocketEvent")
		})

		t.Run("broadcast", func(_ *testing.T) {
			data := map[string]any{}
			bc := &WebSocketBroadcast{
				ChannelID: callChannelID,
			}

			mockMetrics.On("IncWebSocketEvent", "out", wsEventUserMuted).Twice()

			mockAPI.On("PublishWebSocketEvent", wsEventUserMuted, map[string]any{
				"channelID": callChannelID,
			}, &model.WebsocketBroadcast{
				UserId: botUserID,
			}).Once()

			mockAPI.On("PublishWebSocketEvent", wsEventUserMuted, map[string]any{
				"channelID": callChannelID,
			}, &model.WebsocketBroadcast{
				ChannelId: callChannelID,
				OmitUsers: map[string]bool{botUserID: true},
			}).Once()

			p.publishWebSocketEvent(wsEventUserMuted, data, bc)
		})

		t.Run("specified users, including bot", func(_ *testing.T) {
			data := map[string]any{}
			bc := &WebSocketBroadcast{
				ChannelID: callChannelID,
				UserIDs: []string{
					"userA",
					"userB",
					botUserID,
				},
			}

			// Event to bot
			mockAPI.On("PublishWebSocketEvent", wsEventUserReacted, data, &model.WebsocketBroadcast{
				UserId: botUserID,
			}).Once()

			// Event to userA
			mockAPI.On("PublishWebSocketEvent", wsEventUserReacted, data, &model.WebsocketBroadcast{
				ChannelId: callChannelID,
				UserId:    "userA",
				OmitUsers: map[string]bool{
					botUserID: true,
				},
			}).Once()

			// Event to userB
			mockAPI.On("PublishWebSocketEvent", wsEventUserReacted, data, &model.WebsocketBroadcast{
				ChannelId: callChannelID,
				UserId:    "userB",
				OmitUsers: map[string]bool{
					botUserID: true,
				},
			}).Once()

			mockMetrics.On("IncWebSocketEvent", "out", wsEventUserReacted).Times(3)

			p.publishWebSocketEvent(wsEventUserReacted, data, bc)
		})
	})

	t.Run("connection specific", func(_ *testing.T) {
		data := map[string]any{
			"session_id": "userSessionID",
		}
		bc := &WebSocketBroadcast{
			ConnectionID: "userConnID",
		}

		mockMetrics.On("IncWebSocketEvent", "out", wsEventUserMuted).Once()
		mockAPI.On("PublishWebSocketEvent", wsEventUserMuted, map[string]any{
			"session_id": "userSessionID",
		}, &model.WebsocketBroadcast{
			ConnectionId: "userConnID",
		}).Once()

		p.publishWebSocketEvent(wsEventUserMuted, data, bc)
	})

	t.Run("specified users", func(_ *testing.T) {
		data := map[string]any{}
		bc := &WebSocketBroadcast{
			ChannelID: callChannelID,
			UserIDs: []string{
				"userA",
				"userC",
				"userD",
			},
		}
		mockMetrics.On("IncWebSocketEvent", "out", wsEventUserMuted).Twice()

		mockAPI.On("PublishWebSocketEvent", wsEventUserMuted, data, &model.WebsocketBroadcast{
			ChannelId: callChannelID,
			UserId:    "userA",
		}).Once()
		mockAPI.On("PublishWebSocketEvent", wsEventUserMuted, data, &model.WebsocketBroadcast{
			ChannelId: callChannelID,
			UserId:    "userC",
		}).Once()
		mockAPI.On("PublishWebSocketEvent", wsEventUserMuted, data, &model.WebsocketBroadcast{
			ChannelId: callChannelID,
			UserId:    "userD",
		}).Once()

		p.publishWebSocketEvent(wsEventUserMuted, data, bc)
	})
}

func TestHandleJoin(t *testing.T) {
	mockAPI := &pluginMocks.MockAPI{}
	mockMetrics := &serverMocks.MockMetrics{}
	mockRTCMetrics := &rtcMocks.MockMetrics{}

	p := Plugin{
		MattermostPlugin: plugin.MattermostPlugin{
			API: mockAPI,
		},
		callsClusterLocks: map[string]*cluster.Mutex{},
		metrics:           mockMetrics,
		configuration: &configuration{
			clientConfig: clientConfig{
				DefaultEnabled: model.NewBool(true),
			},
		},
		sessions:               map[string]*session{},
		addSessionsBatchers:    map[string]*batching.Batcher{},
		removeSessionsBatchers: map[string]*batching.Batcher{},
	}

	mockMetrics.On("RTCMetrics").Return(mockRTCMetrics).Once()
	mockAPI.On("LogDebug", mock.Anything, mock.Anything, mock.Anything,
		mock.Anything, mock.Anything, mock.Anything, mock.Anything,
		mock.Anything, mock.Anything, mock.Anything, mock.Anything)

	mockAPI.On("LogDebug", "session has joined call",
		"origin", mock.AnythingOfType("string"),
		"userID", mock.AnythingOfType("string"),
		"sessionID", mock.AnythingOfType("string"),
		"channelID", mock.AnythingOfType("string"),
		"callID", mock.AnythingOfType("string"),
		"remoteAddr", mock.AnythingOfType("string"),
		"xForwardedFor", mock.AnythingOfType("string"),
	)

	mockAPI.On("LogInfo", mock.Anything, mock.Anything, mock.Anything,
		mock.Anything, mock.Anything, mock.Anything, mock.Anything,
		mock.Anything, mock.Anything, mock.Anything, mock.Anything)

	rtcServer, err := rtc.NewServer(rtc.ServerConfig{
		ICEPortUDP: 33443,
		ICEPortTCP: 33443,
	}, newLogger(&p), p.metrics.RTCMetrics())
	require.NoError(t, err)

	err = rtcServer.Start()
	require.NoError(t, err)

	p.rtcServer = rtcServer
	defer func() {
		err := p.rtcServer.Stop()
		require.NoError(t, err)
	}()

	store, tearDown := NewTestStore(t)
	t.Cleanup(tearDown)
	p.store = store

	mockMetrics.On("ObserveClusterMutexGrabTime", "mutex_call", mock.AnythingOfType("float64"))
	mockMetrics.On("ObserveClusterMutexLockedTime", "mutex_call", mock.AnythingOfType("float64"))
	mockMetrics.On("ObserveAppHandlersTime", mock.AnythingOfType("string"), mock.AnythingOfType("float64"))

	t.Run("no batching", func(t *testing.T) {
		defer mockAPI.AssertExpectations(t)
		defer mockMetrics.AssertExpectations(t)
		defer mockRTCMetrics.AssertExpectations(t)

		channelID := model.NewId()
		userID := model.NewId()
		connID := model.NewId()
		authSessionID := ""
		postID := model.NewId()

		mockAPI.On("HasPermissionToChannel", userID, channelID, model.PermissionCreatePost).Return(true).Once()
		mockAPI.On("GetChannel", channelID).Return(&model.Channel{
			Id: channelID,
		}, nil).Once()

		mockAPI.On("GetChannelStats", channelID).Return(&model.ChannelStats{
			MemberCount: 10,
		}, nil).Once()

		// Call lock
		mockAPI.On("KVSetWithOptions", "mutex_call_"+channelID, []byte{0x1}, mock.Anything).Return(true, nil)

		// We'd be starting a new call
		mockMetrics.On("IncWebSocketEvent", "out", wsEventCallHostChanged).Once()
		mockAPI.On("PublishWebSocketEvent", wsEventCallHostChanged, mock.Anything,
			&model.WebsocketBroadcast{UserId: userID, ChannelId: channelID, ReliableClusterSend: true}).Once()
		// Call started post creation
		mockAPI.On("GetUser", userID).Return(&model.User{Id: userID}, nil).Once()
		mockAPI.On("GetConfig").Return(&model.Config{}, nil).Times(3)
		mockAPI.On("CreatePost", mock.AnythingOfType("*model.Post")).Return(&model.Post{Id: postID}, nil).Once()
		createPost(t, store, postID, userID, channelID)

		mockAPI.On("GetLicense").Return(&model.License{}, nil)
		mockAPI.On("GetChannel", channelID).Return(&model.Channel{
			Id: channelID,
		}, nil).Once()
		mockMetrics.On("IncWebSocketEvent", "out", wsEventCallStart).Once()
		mockAPI.On("PublishWebSocketEvent", wsEventCallStart, mock.Anything,
			&model.WebsocketBroadcast{ChannelId: channelID, ReliableClusterSend: true}).Once()

		mockRTCMetrics.On("IncRTCSessions", "default").Once()

		mockMetrics.On("IncWebSocketEvent", "out", wsEventJoin).Once()
		mockAPI.On("PublishWebSocketEvent", wsEventJoin, map[string]any{"connID": connID},
			&model.WebsocketBroadcast{UserId: userID, ReliableClusterSend: true}).Once()

		// DEPRECATED
		mockMetrics.On("IncWebSocketEvent", "out", wsEventUserConnected).Once()
		mockAPI.On("PublishWebSocketEvent", wsEventUserConnected, map[string]any{"userID": userID},
			&model.WebsocketBroadcast{ChannelId: channelID, ReliableClusterSend: true}).Once()

		mockMetrics.On("IncWebSocketEvent", "out", wsEventUserJoined).Once()
		mockAPI.On("PublishWebSocketEvent", wsEventUserJoined, map[string]any{"session_id": connID, "user_id": userID},
			&model.WebsocketBroadcast{ChannelId: channelID, ReliableClusterSend: true}).Once()

		mockMetrics.On("IncWebSocketEvent", "out", wsEventCallState).Once()
		mockAPI.On("PublishWebSocketEvent", wsEventCallState, mock.Anything,
			&model.WebsocketBroadcast{UserId: userID, ReliableClusterSend: true}).Once()

		mockMetrics.On("IncWebSocketConn").Once()

		// Call unlock
		mockAPI.On("KVDelete", "mutex_call_"+channelID).Return(nil).Once()

		err := p.handleJoin(userID, connID, authSessionID, callsJoinData{
			CallsClientJoinData: CallsClientJoinData{
				ChannelID: channelID,
			},
		})
		require.NoError(t, err)

		// Verify user session was successfully added.
		require.NotNil(t, p.sessions[connID])

		// Verify call was started
		state, err := p.getCallState(channelID, true)
		require.NoError(t, err)
		require.NotNil(t, state)

		// Verify session was added to call.
		require.Len(t, state.sessions, 1)
		require.Equal(t, connID, state.sessions[connID].ID)

		// Verify no batching was needed
		require.Empty(t, p.addSessionsBatchers)

		// Session leaving call path

		// Trigger leave call
		p.mut.RLock()
		close(p.sessions[connID].leaveCh)
		p.mut.RUnlock()

		mockMetrics.On("DecWebSocketConn").Once()
		mockRTCMetrics.On("DecRTCSessions", "default").Once()
		mockRTCMetrics.On("IncRTCConnState", "closed").Once()

		// DEPRECATED
		mockMetrics.On("IncWebSocketEvent", "out", wsEventUserDisconnected).Once()
		mockAPI.On("PublishWebSocketEvent", wsEventUserDisconnected, map[string]any{"userID": userID},
			&model.WebsocketBroadcast{ChannelId: channelID, ReliableClusterSend: true}).Once()

		mockMetrics.On("IncWebSocketEvent", "out", wsEventUserLeft).Once()
		mockAPI.On("PublishWebSocketEvent", wsEventUserLeft, map[string]any{"session_id": connID, "user_id": userID},
			&model.WebsocketBroadcast{ChannelId: channelID, ReliableClusterSend: true}).Once()

		mockAPI.On("UpdatePost", mock.AnythingOfType("*model.Post")).Return(&model.Post{Id: postID}, nil).Once()

		// Call unlock
		mockAPI.On("KVDelete", "mutex_call_"+channelID).Return(nil).Once()

		// Verify no batching was needed
		p.mut.RLock()
		require.Empty(t, p.removeSessionsBatchers)
		p.mut.RUnlock()

		// We need to give it some time as leaving happens in a goroutine.
		time.Sleep(5 * time.Second)

		// Verify user session was removed.
		p.mut.RLock()
		require.Empty(t, p.sessions)
		p.mut.RUnlock()

		// Verify call ended
		state, err = p.getCallState(channelID, true)
		require.NoError(t, err)
		require.Nil(t, state)
	})

	t.Run("batching", func(t *testing.T) {
		defer mockAPI.AssertExpectations(t)
		defer mockMetrics.AssertExpectations(t)
		defer mockRTCMetrics.AssertExpectations(t)

		channelID := model.NewId()
		postID := model.NewId()

		// Call lock
		mockAPI.On("KVSetWithOptions", "mutex_call_"+channelID, []byte{0x1}, mock.Anything).Return(true, nil)
		// Call unlock
		mockAPI.On("KVDelete", "mutex_call_"+channelID).Return(nil).Once()

		// Who gets to be host is non deterministic as it depends on the order in which sessions leave
		// so can only make a generic assertion.
		mockMetrics.On("IncWebSocketEvent", "out", wsEventCallHostChanged)
		defer mockMetrics.On("IncWebSocketEvent", "out", wsEventCallHostChanged).Unset()
		mockAPI.On("PublishWebSocketEvent", wsEventCallHostChanged, mock.Anything, mock.Anything)
		defer mockAPI.On("PublishWebSocketEvent", wsEventCallHostChanged, mock.Anything, mock.Anything).Unset()

		for i := 0; i < 10; i++ {
			userID := model.NewId()
			connID := model.NewId()
			authSessionID := ""

			mockAPI.On("HasPermissionToChannel", userID, channelID, model.PermissionCreatePost).Return(true).Once()
			mockAPI.On("GetChannel", channelID).Return(&model.Channel{
				Id: channelID,
			}, nil).Once()

			mockAPI.On("GetChannelStats", channelID).Return(&model.ChannelStats{
				MemberCount: int64(minMembersCountForBatching),
			}, nil).Once()

			if i == 0 {
				// Call started post creation
				mockAPI.On("GetUser", userID).Return(&model.User{Id: userID}, nil).Once()
				mockAPI.On("GetConfig").Return(&model.Config{}, nil).Times(3)
				mockAPI.On("CreatePost", mock.AnythingOfType("*model.Post")).Return(&model.Post{Id: postID}, nil).Once()
				createPost(t, store, postID, userID, channelID)

				mockMetrics.On("IncWebSocketEvent", "out", wsEventCallStart).Once()
				mockAPI.On("PublishWebSocketEvent", wsEventCallStart, mock.Anything,
					&model.WebsocketBroadcast{ChannelId: channelID, ReliableClusterSend: true}).Once()

				mockAPI.On("GetChannel", channelID).Return(&model.Channel{
					Id: channelID,
				}, nil).Once()
			}

			mockAPI.On("GetLicense").Return(&model.License{}, nil)

			mockRTCMetrics.On("IncRTCSessions", "default").Once()

			mockMetrics.On("IncWebSocketEvent", "out", wsEventJoin).Once()
			mockAPI.On("PublishWebSocketEvent", wsEventJoin, map[string]any{"connID": connID},
				&model.WebsocketBroadcast{UserId: userID, ReliableClusterSend: true}).Once()

			// DEPRECATED
			mockMetrics.On("IncWebSocketEvent", "out", wsEventUserConnected).Once()
			mockAPI.On("PublishWebSocketEvent", wsEventUserConnected, map[string]any{"userID": userID},
				&model.WebsocketBroadcast{ChannelId: channelID, ReliableClusterSend: true}).Once()

			mockMetrics.On("IncWebSocketEvent", "out", wsEventUserJoined).Once()
			mockAPI.On("PublishWebSocketEvent", wsEventUserJoined, map[string]any{"session_id": connID, "user_id": userID},
				&model.WebsocketBroadcast{ChannelId: channelID, ReliableClusterSend: true}).Once()

			mockMetrics.On("IncWebSocketEvent", "out", wsEventCallState).Once()
			mockAPI.On("PublishWebSocketEvent", wsEventCallState, mock.Anything,
				&model.WebsocketBroadcast{UserId: userID, ReliableClusterSend: true}).Once()

			mockMetrics.On("IncWebSocketConn").Once()

			err := p.handleJoin(userID, connID, authSessionID, callsJoinData{
				CallsClientJoinData: CallsClientJoinData{
					ChannelID: channelID,
				},
			})
			require.NoError(t, err)
		}

		// Verify batching was used
		p.mut.RLock()
		require.NotNil(t, p.addSessionsBatchers[channelID])
		p.mut.RUnlock()

		// Give enough time for the batch to run
		time.Sleep(5 * time.Second)

		// Verify user sessions were successfully added
		p.mut.RLock()
		require.Len(t, p.sessions, 10)
		p.mut.RUnlock()

		// Verify call was started
		state, err := p.getCallState(channelID, true)
		require.NoError(t, err)
		require.NotNil(t, state)

		// Verify session was added to call
		require.Len(t, state.sessions, 10)

		// Session leaving call path

		mockMetrics.On("DecWebSocketConn").Times(10)
		mockRTCMetrics.On("DecRTCSessions", "default").Times(10)
		mockRTCMetrics.On("IncRTCConnState", "closed").Times(10)

		// DEPRECATED
		mockMetrics.On("IncWebSocketEvent", "out", wsEventUserDisconnected).Times(10)
		mockAPI.On("PublishWebSocketEvent", wsEventUserDisconnected, mock.Anything,
			&model.WebsocketBroadcast{ChannelId: channelID, ReliableClusterSend: true}).Times(10)

		mockMetrics.On("IncWebSocketEvent", "out", wsEventUserLeft).Times(10)
		mockAPI.On("PublishWebSocketEvent", wsEventUserLeft, mock.Anything,
			&model.WebsocketBroadcast{ChannelId: channelID, ReliableClusterSend: true}).Times(10)

		mockAPI.On("UpdatePost", mock.AnythingOfType("*model.Post")).Return(&model.Post{Id: postID}, nil).Once()

		// Call unlock
		mockAPI.On("KVDelete", "mutex_call_"+channelID).Return(nil).Once()

		minMembersCountForBatching = 10

		p.mut.RLock()
		for _, us := range p.sessions {
			close(us.leaveCh)
		}
		p.mut.RUnlock()

		// We need to give it some time as leaving happens in a goroutine
		time.Sleep(time.Second)

		// Verify batching was used
		p.mut.RLock()
		require.NotNil(t, p.removeSessionsBatchers[channelID])
		p.mut.RUnlock()

		// Give enough time for the batch to run
		time.Sleep(5 * time.Second)

		// Verify user sessions were removed
		p.mut.RLock()
		require.Empty(t, p.sessions)
		p.mut.RUnlock()

		// Verify call ended
		state, err = p.getCallState(channelID, true)
		require.NoError(t, err)
		require.Nil(t, state)

		p.mut.RLock()
		require.Empty(t, p.removeSessionsBatchers)
		require.Empty(t, p.addSessionsBatchers)
		p.mut.RUnlock()
	})

	t.Run("admin warning", func(t *testing.T) {
		defer mockAPI.AssertExpectations(t)
		defer mockMetrics.AssertExpectations(t)
		defer mockRTCMetrics.AssertExpectations(t)

		channelID := model.NewId()
		userID := model.NewId()
		connID := model.NewId()
		postID := model.NewId()
		authSessionID := ""

		os.Setenv("MM_CALLS_CONCURRENT_SESSIONS_THRESHOLD", "1")
		defer os.Unsetenv("MM_CALLS_CONCURRENT_SESSIONS_THRESHOLD")

		mockAPI.On("HasPermissionToChannel", userID, channelID, model.PermissionCreatePost).Return(true).Once()
		mockAPI.On("GetChannel", channelID).Return(&model.Channel{
			Id: channelID,
		}, nil).Twice()

		mockAPI.On("GetChannelStats", channelID).Return(&model.ChannelStats{
			MemberCount: 1,
		}, nil).Once()

		// Call lock
		mockAPI.On("KVSetWithOptions", "mutex_call_"+channelID, []byte{0x1}, mock.Anything).Return(true, nil)

		// We'd be starting a new call
		mockMetrics.On("IncWebSocketEvent", "out", wsEventCallHostChanged).Once()
		mockAPI.On("PublishWebSocketEvent", wsEventCallHostChanged, mock.Anything,
			&model.WebsocketBroadcast{UserId: userID, ChannelId: channelID, ReliableClusterSend: true}).Once()

		// Call started post creation
		mockAPI.On("GetUser", userID).Return(&model.User{Id: userID}, nil).Once()
		mockAPI.On("GetConfig").Return(&model.Config{}, nil).Times(3)
		mockAPI.On("CreatePost", mock.AnythingOfType("*model.Post")).Return(&model.Post{Id: postID}, nil).Once()
		createPost(t, store, postID, userID, channelID)

		mockAPI.On("GetLicense").Return(&model.License{}, nil)

		mockMetrics.On("IncWebSocketEvent", "out", wsEventCallStart).Once()
		mockAPI.On("PublishWebSocketEvent", wsEventCallStart, mock.Anything,
			&model.WebsocketBroadcast{ChannelId: channelID, ReliableClusterSend: true}).Once()

		mockAPI.On("KVSetWithOptions", "concurrent_sessions_warning", mock.Anything, mock.Anything).Return(true, nil).Once()

		mockAPI.On("GetUsers", mock.AnythingOfType("*model.UserGetOptions")).Return([]*model.User{
			{
				Id:     "adminID",
				Locale: "it",
			},
		}, nil).Once()

		mockAPI.On("GetDirectChannel", "adminID", "").Return(&model.Channel{
			Id: "channelID",
		}, nil).Once()

		mockAPI.On("IsEnterpriseReady").Return(false).Once()

		mockAPI.On("CreatePost", &model.Post{
			UserId:    "",
			ChannelId: "channelID",
			Message:   ":warning: app.admin.concurrent_sessions_warning.intro\r\n\r\napp.admin.concurrent_sessions_warning.team",
		}).Return(&model.Post{Id: "postID"}, nil).Once()

		mockRTCMetrics.On("IncRTCSessions", "default").Once()

		mockMetrics.On("IncWebSocketEvent", "out", wsEventJoin).Once()
		mockAPI.On("PublishWebSocketEvent", wsEventJoin, map[string]any{"connID": connID},
			&model.WebsocketBroadcast{UserId: userID, ReliableClusterSend: true}).Once()

		// DEPRECATED
		mockMetrics.On("IncWebSocketEvent", "out", wsEventUserConnected).Once()
		mockAPI.On("PublishWebSocketEvent", wsEventUserConnected, map[string]any{"userID": userID},
			&model.WebsocketBroadcast{ChannelId: channelID, ReliableClusterSend: true}).Once()

		mockMetrics.On("IncWebSocketEvent", "out", wsEventUserJoined).Once()
		mockAPI.On("PublishWebSocketEvent", wsEventUserJoined, map[string]any{"session_id": connID, "user_id": userID},
			&model.WebsocketBroadcast{ChannelId: channelID, ReliableClusterSend: true}).Once()

		mockMetrics.On("IncWebSocketEvent", "out", wsEventCallState).Once()
		mockAPI.On("PublishWebSocketEvent", wsEventCallState, mock.Anything,
			&model.WebsocketBroadcast{UserId: userID, ReliableClusterSend: true}).Once()

		mockMetrics.On("IncWebSocketConn").Once()

		// Call unlock
		mockAPI.On("KVDelete", "mutex_call_"+channelID).Return(nil).Once()

		mockAPI.On("UpdatePost", mock.AnythingOfType("*model.Post")).Return(&model.Post{Id: postID}, nil).Once()

		mockAPI.On("LogWarn", "The number of active call sessions is high. Consider deploying a dedicated RTCD service.", mock.Anything, mock.Anything)

		err := p.handleJoin(userID, connID, authSessionID, callsJoinData{
			CallsClientJoinData: CallsClientJoinData{
				ChannelID: channelID,
			},
		})
		require.NoError(t, err)

		mockMetrics.On("DecWebSocketConn").Once()
		mockRTCMetrics.On("DecRTCSessions", "default").Once()
		mockRTCMetrics.On("IncRTCConnState", "closed").Once()

		// DEPRECATED
		mockMetrics.On("IncWebSocketEvent", "out", wsEventUserDisconnected).Once()
		mockAPI.On("PublishWebSocketEvent", wsEventUserDisconnected, map[string]any{"userID": userID},
			&model.WebsocketBroadcast{ChannelId: channelID, ReliableClusterSend: true}).Once()

		mockMetrics.On("IncWebSocketEvent", "out", wsEventUserLeft).Once()
		mockAPI.On("PublishWebSocketEvent", wsEventUserLeft, map[string]any{"session_id": connID, "user_id": userID},
			&model.WebsocketBroadcast{ChannelId: channelID, ReliableClusterSend: true}).Once()

		// Call unlock
		mockAPI.On("KVDelete", "mutex_call_"+channelID).Return(nil).Once()

		// Trigger leave call
		p.mut.RLock()
		close(p.sessions[connID].leaveCh)
		p.mut.RUnlock()

		// We need to give it some time as leaving happens in a goroutine.
		time.Sleep(2 * time.Second)
	})
}
