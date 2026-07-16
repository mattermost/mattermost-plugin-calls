// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"testing"
	"time"

	"github.com/mattermost/mattermost-plugin-calls/server/cluster"
	"github.com/mattermost/mattermost-plugin-calls/server/db"
	"github.com/mattermost/mattermost-plugin-calls/server/public"

	serverMocks "github.com/mattermost/mattermost-plugin-calls/server/mocks/github.com/mattermost/mattermost-plugin-calls/server/interfaces"
	pluginMocks "github.com/mattermost/mattermost-plugin-calls/server/mocks/github.com/mattermost/mattermost/server/public/plugin"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/plugin"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
)

func newDMTimerTestPlugin(t *testing.T) (*Plugin, *pluginMocks.MockAPI, *serverMocks.MockMetrics) {
	t.Helper()

	mockAPI := &pluginMocks.MockAPI{}
	mockMetrics := &serverMocks.MockMetrics{}

	p := &Plugin{
		MattermostPlugin:  plugin.MattermostPlugin{API: mockAPI},
		callsClusterLocks: map[string]*cluster.Mutex{},
		metrics:           mockMetrics,
		dmNoAnswerTimers:  map[string]*time.Timer{},
	}

	store, tearDown := NewTestStore(t)
	t.Cleanup(tearDown)
	p.store = store

	mockAPI.On("KVSetWithOptions", mock.Anything, mock.Anything, mock.Anything).Return(true, nil).Maybe()
	mockMetrics.On("ObserveClusterMutexGrabTime", "mutex_call", mock.AnythingOfType("float64")).Maybe()
	mockMetrics.On("ObserveClusterMutexLockedTime", "mutex_call", mock.AnythingOfType("float64")).Maybe()
	mockMetrics.On("ObserveAppHandlersTime", mock.AnythingOfType("string"), mock.AnythingOfType("float64")).Maybe()
	mockAPI.On("LogDebug", mock.Anything, mock.Anything, mock.Anything,
		mock.Anything, mock.Anything, mock.Anything, mock.Anything,
		mock.Anything, mock.Anything, mock.Anything, mock.Anything).Maybe()

	return p, mockAPI, mockMetrics
}

func TestStartCancelDMNoAnswerTimer(t *testing.T) {
	p := &Plugin{
		dmNoAnswerTimers: map[string]*time.Timer{},
	}

	channelID := model.NewId()
	callID := model.NewId()

	t.Run("start creates timer", func(t *testing.T) {
		p.startDMNoAnswerTimer(channelID, callID)

		p.dmNoAnswerTimersMut.Lock()
		_, ok := p.dmNoAnswerTimers[channelID]
		p.dmNoAnswerTimersMut.Unlock()

		assert.True(t, ok)
	})

	t.Run("start is idempotent", func(t *testing.T) {
		p.startDMNoAnswerTimer(channelID, callID)

		p.dmNoAnswerTimersMut.Lock()
		count := len(p.dmNoAnswerTimers)
		p.dmNoAnswerTimersMut.Unlock()

		assert.Equal(t, 1, count)
	})

	t.Run("cancel removes timer and returns true", func(t *testing.T) {
		canceled := p.cancelDMNoAnswerTimer(channelID)
		assert.True(t, canceled)

		p.dmNoAnswerTimersMut.Lock()
		_, ok := p.dmNoAnswerTimers[channelID]
		p.dmNoAnswerTimersMut.Unlock()

		assert.False(t, ok)
	})

	t.Run("cancel on missing timer returns false", func(t *testing.T) {
		canceled := p.cancelDMNoAnswerTimer(channelID)
		assert.False(t, canceled)
	})
}

func TestHandleDMNoAnswer(t *testing.T) {
	t.Run("no call ongoing", func(t *testing.T) {
		p, mockAPI, _ := newDMTimerTestPlugin(t)
		defer mockAPI.AssertExpectations(t)

		channelID := model.NewId()

		// lockCallReturnState returns nil state → bail without touching post or WS
		mockAPI.On("KVDelete", "mutex_call_"+channelID).Return(nil).Once()

		p.handleDMNoAnswer(channelID, model.NewId())
	})

	t.Run("stale call ID", func(t *testing.T) {
		p, mockAPI, _ := newDMTimerTestPlugin(t)
		defer mockAPI.AssertExpectations(t)
		defer ResetTestStore(t, p.store)

		channelID := model.NewId()
		userID := model.NewId()

		call := &public.Call{
			ID:        model.NewId(),
			CreateAt:  time.Now().UnixMilli(),
			ChannelID: channelID,
			StartAt:   time.Now().UnixMilli(),
			PostID:    model.NewId(),
			ThreadID:  model.NewId(),
			OwnerID:   userID,
		}
		require.NoError(t, p.store.CreateCall(call))
		require.NoError(t, p.store.CreateCallSession(&public.CallSession{
			ID:     model.NewId(),
			CallID: call.ID,
			UserID: userID,
			JoinAt: time.Now().UnixMilli(),
		}))

		mockAPI.On("KVDelete", "mutex_call_"+channelID).Return(nil).Once()

		// A different callID than what's in the DB → state.Call.ID != callID → bail
		p.handleDMNoAnswer(channelID, model.NewId())
	})

	t.Run("second participant already joined", func(t *testing.T) {
		p, mockAPI, _ := newDMTimerTestPlugin(t)
		defer mockAPI.AssertExpectations(t)
		defer ResetTestStore(t, p.store)

		channelID := model.NewId()
		userID := model.NewId()

		call := &public.Call{
			ID:        model.NewId(),
			CreateAt:  time.Now().UnixMilli(),
			ChannelID: channelID,
			StartAt:   time.Now().UnixMilli(),
			PostID:    model.NewId(),
			ThreadID:  model.NewId(),
			OwnerID:   userID,
		}
		require.NoError(t, p.store.CreateCall(call))
		require.NoError(t, p.store.CreateCallSession(&public.CallSession{
			ID:     model.NewId(),
			CallID: call.ID,
			UserID: userID,
			JoinAt: time.Now().UnixMilli(),
		}))
		require.NoError(t, p.store.CreateCallSession(&public.CallSession{
			ID:     model.NewId(),
			CallID: call.ID,
			UserID: model.NewId(),
			JoinAt: time.Now().UnixMilli(),
		}))

		mockAPI.On("KVDelete", "mutex_call_"+channelID).Return(nil).Once()

		// 2 active sessions → len(state.sessions) != 1 → bail
		p.handleDMNoAnswer(channelID, call.ID)
	})

	t.Run("no answer — call ended, post updated, WS event published", func(t *testing.T) {
		p, mockAPI, mockMetrics := newDMTimerTestPlugin(t)
		defer mockAPI.AssertExpectations(t)
		defer mockMetrics.AssertExpectations(t)
		defer ResetTestStore(t, p.store)

		channelID := model.NewId()
		userID := model.NewId()
		postID := model.NewId()

		call := &public.Call{
			ID:        model.NewId(),
			CreateAt:  time.Now().UnixMilli(),
			ChannelID: channelID,
			StartAt:   time.Now().UnixMilli(),
			PostID:    postID,
			ThreadID:  model.NewId(),
			OwnerID:   userID,
		}
		require.NoError(t, p.store.CreateCall(call))
		require.NoError(t, p.store.CreateCallSession(&public.CallSession{
			ID:     model.NewId(),
			CallID: call.ID,
			UserID: userID,
			JoinAt: time.Now().UnixMilli(),
		}))
		createPost(t, p.store, postID, userID, channelID)

		mockAPI.On("KVDelete", "mutex_call_"+channelID).Return(nil).Once()
		mockAPI.On("GetConfig").Return(&model.Config{}, nil).Once()

		var capturedPost *model.Post
		mockAPI.On("UpdatePost", mock.AnythingOfType("*model.Post")).Run(func(args mock.Arguments) {
			capturedPost = args.Get(0).(*model.Post)
		}).Return(&model.Post{}, nil).Once()

		mockMetrics.On("IncWebSocketEvent", "out", wsEventCallEnd).Once()
		mockAPI.On("PublishWebSocketEvent", wsEventCallEnd, map[string]interface{}{},
			&model.WebsocketBroadcast{ChannelId: channelID, ReliableClusterSend: true}).Once()

		p.handleDMNoAnswer(channelID, call.ID)

		require.NotNil(t, capturedPost)
		assert.Equal(t, callStatusNoAnswer, capturedPost.GetProp("call_status"))
		assert.NotNil(t, capturedPost.GetProp("end_at"))

		updatedCall, err := p.store.GetCall(call.ID, db.GetCallOpts{FromWriter: true})
		require.NoError(t, err)
		assert.Greater(t, updatedCall.EndAt, int64(0))

		sessions, err := p.store.GetCallSessions(call.ID, db.GetCallSessionOpts{FromWriter: true})
		require.NoError(t, err)
		assert.Empty(t, sessions)
	})
}

func TestUpdateCallPostEnded(t *testing.T) {
	tests := []struct {
		name       string
		reason     callEndReason
		wantStatus string
	}{
		{
			name:       "normal end",
			reason:     callEndReasonNormal,
			wantStatus: callStatusEnded,
		},
		{
			name:       "no answer",
			reason:     callEndReasonNoAnswer,
			wantStatus: callStatusNoAnswer,
		},
		{
			name:       "canceled by caller",
			reason:     callEndReasonCanceledByCaller,
			wantStatus: callStatusCanceledByCaller,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			p, mockAPI, _ := newDMTimerTestPlugin(t)
			defer mockAPI.AssertExpectations(t)

			userID := model.NewId()
			channelID := model.NewId()
			postID := model.NewId()
			createPost(t, p.store, postID, userID, channelID)

			mockAPI.On("GetConfig").Return(&model.Config{}, nil).Once()

			var capturedPost *model.Post
			mockAPI.On("UpdatePost", mock.AnythingOfType("*model.Post")).Run(func(args mock.Arguments) {
				capturedPost = args.Get(0).(*model.Post)
			}).Return(&model.Post{}, nil).Once()

			_, err := p.updateCallPostEnded(postID, []string{userID}, tc.reason)
			require.NoError(t, err)

			require.NotNil(t, capturedPost)
			assert.Equal(t, tc.wantStatus, capturedPost.GetProp("call_status"))
			assert.NotNil(t, capturedPost.GetProp("end_at"))
		})
	}
}
