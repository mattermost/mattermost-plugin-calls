// Copyright (c) 2022-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"fmt"
	"net/http"
	"sync"
	"testing"
	"time"

	"github.com/mattermost/mattermost-plugin-calls/server/cluster"
	serverMocks "github.com/mattermost/mattermost-plugin-calls/server/mocks/github.com/mattermost/mattermost-plugin-calls/server/interfaces"
	pluginMocks "github.com/mattermost/mattermost-plugin-calls/server/mocks/github.com/mattermost/mattermost/server/public/plugin"
	"github.com/mattermost/mattermost-plugin-calls/server/public"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/plugin"

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
