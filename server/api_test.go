// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"github.com/mattermost/mattermost-plugin-calls/server/cluster"
	"github.com/mattermost/mattermost-plugin-calls/server/db"
	"github.com/mattermost/mattermost-plugin-calls/server/public"

	serverMocks "github.com/mattermost/mattermost-plugin-calls/server/mocks/github.com/mattermost/mattermost-plugin-calls/server/interfaces"
	pluginMocks "github.com/mattermost/mattermost-plugin-calls/server/mocks/github.com/mattermost/mattermost/server/public/plugin"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/plugin"
	rtcd "github.com/mattermost/rtcd/service"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
	"golang.org/x/time/rate"
)

func newAPITestPlugin(t *testing.T) (*Plugin, *pluginMocks.MockAPI, *serverMocks.MockMetrics) {
	t.Helper()

	mockAPI := &pluginMocks.MockAPI{}
	mockMetrics := &serverMocks.MockMetrics{}

	p := &Plugin{
		MattermostPlugin:  plugin.MattermostPlugin{API: mockAPI},
		callsClusterLocks: map[string]*cluster.Mutex{},
		metrics:           mockMetrics,
		dmNoAnswerTimers:  map[string]*time.Timer{},
		apiLimiters:       map[string]*rate.Limiter{},
	}

	store, tearDown := NewTestStore(t)
	t.Cleanup(tearDown)
	p.store = store

	mockAPI.On("KVSetWithOptions", mock.Anything, mock.Anything, mock.Anything).Return(true, nil).Maybe()
	mockMetrics.On("ObserveClusterMutexGrabTime", "mutex_call", mock.AnythingOfType("float64")).Maybe()
	mockMetrics.On("ObserveClusterMutexLockedTime", "mutex_call", mock.AnythingOfType("float64")).Maybe()
	mockMetrics.On("ObserveAppHandlersTime", mock.AnythingOfType("string"), mock.AnythingOfType("float64")).Maybe()
	mockLogs(mockAPI)

	return p, mockAPI, mockMetrics
}

// mockLogs registers permissive expectations for the log methods at every arity
// they're called with. httpAudit logs ~18 key/value fields, so a fixed-width
// catch-all isn't enough.
func mockLogs(mockAPI *pluginMocks.MockAPI) {
	const maxLogFields = 32
	for _, method := range []string{"LogDebug", "LogInfo", "LogWarn", "LogError"} {
		for n := 0; n <= maxLogFields; n++ {
			args := make([]interface{}, n+1)
			for i := range args {
				args[i] = mock.Anything
			}
			mockAPI.On(method, args...).Maybe()
		}
	}
}

// createDMCall stores a call with a single session belonging to callerID, i.e.
// the state of a DM call that's ringing but not yet answered.
// shortenCallEndGracePeriod makes the out-of-band force-close of leftover RTC sessions run
// promptly, so tests don't have to wait out the production grace period.
func shortenCallEndGracePeriod(t *testing.T) {
	t.Helper()

	previous := dmCallEndGracePeriod
	dmCallEndGracePeriod = 10 * time.Millisecond
	t.Cleanup(func() { dmCallEndGracePeriod = previous })
}

// callEventRecorder records call_end publishes and RTC disconnects in the order they happen, so
// tests can assert clients are told the call ended before their sessions are torn down.
type callEventRecorder struct {
	mut    sync.Mutex
	events []string
}

func (r *callEventRecorder) record(event string) {
	r.mut.Lock()
	defer r.mut.Unlock()
	r.events = append(r.events, event)
}

// recordRTCDLeave records the disconnect rtcd was asked to perform for a session.
func (r *callEventRecorder) recordRTCDLeave(args mock.Arguments) {
	msg, ok := args.Get(0).(rtcd.ClientMessage)
	if !ok {
		r.record("unexpected rtcd message")
		return
	}

	data, ok := msg.Data.(map[string]string)
	if !ok {
		r.record("unexpected rtcd message data")
		return
	}

	r.record(fmt.Sprintf("%s:%s", msg.Type, data["sessionID"]))
}

// waitFor blocks until count events have been recorded and returns them.
func (r *callEventRecorder) waitFor(t *testing.T, count int) []string {
	t.Helper()

	require.Eventually(t, func() bool {
		r.mut.Lock()
		defer r.mut.Unlock()
		return len(r.events) >= count
	}, 5*time.Second, 5*time.Millisecond, "timed out waiting for %d call events", count)

	r.mut.Lock()
	defer r.mut.Unlock()

	return append([]string(nil), r.events...)
}

func createDMCall(t *testing.T, p *Plugin, channelID, callerID, callerConnID, postID string) *public.Call {
	t.Helper()

	call := &public.Call{
		ID:        model.NewId(),
		CreateAt:  time.Now().UnixMilli(),
		ChannelID: channelID,
		StartAt:   time.Now().UnixMilli(),
		PostID:    postID,
		ThreadID:  model.NewId(),
		OwnerID:   callerID,
		Props: public.CallProps{
			Participants: map[string]struct{}{
				callerID: {},
			},
		},
	}
	require.NoError(t, p.store.CreateCall(call))
	require.NoError(t, p.store.CreateCallSession(&public.CallSession{
		ID:     callerConnID,
		CallID: call.ID,
		UserID: callerID,
		JoinAt: time.Now().UnixMilli(),
	}))

	return call
}

func TestDeclineCall(t *testing.T) {
	t.Run("permission denied", func(t *testing.T) {
		p, mockAPI, _ := newAPITestPlugin(t)
		defer mockAPI.AssertExpectations(t)

		channelID := model.NewId()
		userID := model.NewId()

		mockAPI.On("HasPermissionToChannel", userID, channelID, model.PermissionCreatePost).Return(false).Once()

		code, err := p.declineCall(channelID, userID)
		require.Error(t, err)
		assert.Equal(t, http.StatusForbidden, code)
	})

	t.Run("no call ongoing", func(t *testing.T) {
		p, mockAPI, _ := newAPITestPlugin(t)
		defer mockAPI.AssertExpectations(t)

		channelID := model.NewId()
		userID := model.NewId()

		mockAPI.On("HasPermissionToChannel", userID, channelID, model.PermissionCreatePost).Return(true).Once()
		mockAPI.On("KVDelete", "mutex_call_"+channelID).Return(nil).Once()

		code, err := p.declineCall(channelID, userID)
		require.Error(t, err)
		assert.Equal(t, http.StatusBadRequest, code)
	})

	t.Run("caller cannot decline their own call", func(t *testing.T) {
		p, mockAPI, _ := newAPITestPlugin(t)
		defer mockAPI.AssertExpectations(t)
		defer ResetTestStore(t, p.store)

		channelID := model.NewId()
		callerID := model.NewId()

		call := createDMCall(t, p, channelID, callerID, model.NewId(), model.NewId())

		mockAPI.On("HasPermissionToChannel", callerID, channelID, model.PermissionCreatePost).Return(true).Once()
		mockAPI.On("KVDelete", "mutex_call_"+channelID).Return(nil).Once()

		// The requester owns the only session, so they're the caller, not the callee.
		code, err := p.declineCall(channelID, callerID)
		require.Error(t, err)
		assert.Equal(t, http.StatusForbidden, code)

		// The call is untouched.
		storedCall, err := p.store.GetCall(call.ID, db.GetCallOpts{FromWriter: true})
		require.NoError(t, err)
		assert.Zero(t, storedCall.EndAt)
	})

	t.Run("another session exists — no side effects", func(t *testing.T) {
		p, mockAPI, _ := newAPITestPlugin(t)
		defer mockAPI.AssertExpectations(t)
		defer ResetTestStore(t, p.store)

		channelID := model.NewId()
		callerID := model.NewId()
		calleeID := model.NewId()
		otherUserID := model.NewId()

		call := createDMCall(t, p, channelID, callerID, model.NewId(), model.NewId())

		// A second user has a session, so the callee answered elsewhere first and the
		// decline bails out without side effects. It has to belong to someone other than
		// the requester: a requester who owns a session is rejected earlier as already
		// being in the call, never reaching this branch.
		require.NoError(t, p.store.CreateCallSession(&public.CallSession{
			ID:     model.NewId(),
			CallID: call.ID,
			UserID: otherUserID,
			JoinAt: time.Now().UnixMilli(),
		}))

		mockAPI.On("HasPermissionToChannel", calleeID, channelID, model.PermissionCreatePost).Return(true).Once()
		mockAPI.On("KVDelete", "mutex_call_"+channelID).Return(nil).Once()

		code, err := p.declineCall(channelID, calleeID)
		require.NoError(t, err)
		assert.Equal(t, http.StatusOK, code)

		// No UpdatePost / PublishWebSocketEvent expectations were set, so
		// AssertExpectations plus the strict mock catch any side effect here.
		storedCall, err := p.store.GetCall(call.ID, db.GetCallOpts{FromWriter: true})
		require.NoError(t, err)
		assert.Zero(t, storedCall.EndAt)

		sessions, err := p.store.GetCallSessions(call.ID, db.GetCallSessionOpts{FromWriter: true})
		require.NoError(t, err)
		assert.Len(t, sessions, 2)
	})

	t.Run("declined — call ended, post updated, WS events published, timer cancelled", func(t *testing.T) {
		p, mockAPI, mockMetrics := newAPITestPlugin(t)
		defer mockAPI.AssertExpectations(t)
		defer mockMetrics.AssertExpectations(t)
		defer ResetTestStore(t, p.store)

		channelID := model.NewId()
		callerID := model.NewId()
		calleeID := model.NewId()
		postID := model.NewId()

		call := createDMCall(t, p, channelID, callerID, model.NewId(), postID)
		createPost(t, p.store, postID, callerID, channelID)

		// A no-answer timer is running for the ringing call; declining must cancel it.
		p.startDMNoAnswerTimer(channelID, call.ID)

		mockAPI.On("HasPermissionToChannel", calleeID, channelID, model.PermissionCreatePost).Return(true).Once()
		mockAPI.On("KVDelete", "mutex_call_"+channelID).Return(nil).Once()
		mockAPI.On("GetConfig").Return(&model.Config{}, nil).Once()

		var capturedPost *model.Post
		mockAPI.On("UpdatePost", mock.AnythingOfType("*model.Post")).Run(func(args mock.Arguments) {
			capturedPost = args.Get(0).(*model.Post)
		}).Return(&model.Post{}, nil).Once()

		mockMetrics.On("IncWebSocketEvent", "out", wsEventCallEnd).Once()
		mockAPI.On("PublishWebSocketEvent", wsEventCallEnd, map[string]interface{}{},
			&model.WebsocketBroadcast{ChannelId: channelID, ReliableClusterSend: true}).Once()

		mockMetrics.On("IncWebSocketEvent", "out", wsEventUserDismissedNotification).Once()
		mockAPI.On("PublishWebSocketEvent", wsEventUserDismissedNotification, map[string]interface{}{
			"userID": calleeID,
			"callID": call.ID,
		}, &model.WebsocketBroadcast{UserId: calleeID, ReliableClusterSend: true}).Once()

		code, err := p.declineCall(channelID, calleeID)
		require.NoError(t, err)
		assert.Equal(t, http.StatusOK, code)

		require.NotNil(t, capturedPost)
		assert.Equal(t, callStatusDeclined, capturedPost.GetProp("call_status"))
		assert.NotNil(t, capturedPost.GetProp("end_at"))

		storedCall, err := p.store.GetCall(call.ID, db.GetCallOpts{FromWriter: true})
		require.NoError(t, err)
		assert.Greater(t, storedCall.EndAt, int64(0))
		assert.ElementsMatch(t, []string{callerID}, storedCall.Participants)

		sessions, err := p.store.GetCallSessions(call.ID, db.GetCallSessionOpts{FromWriter: true})
		require.NoError(t, err)
		assert.Empty(t, sessions)

		p.dmNoAnswerTimersMut.Lock()
		_, timerStillRunning := p.dmNoAnswerTimers[channelID]
		p.dmNoAnswerTimersMut.Unlock()
		assert.False(t, timerStillRunning)
	})

	t.Run("caller ringing from two devices — every caller session is disconnected", func(t *testing.T) {
		p, mockAPI, mockMetrics := newAPITestPlugin(t)
		defer mockAPI.AssertExpectations(t)
		defer mockMetrics.AssertExpectations(t)
		defer ResetTestStore(t, p.store)

		shortenCallEndGracePeriod(t)

		channelID := model.NewId()
		callerID := model.NewId()
		calleeID := model.NewId()
		postID := model.NewId()
		callerConnID := model.NewId()
		callerSecondConnID := model.NewId()

		call := createDMCall(t, p, channelID, callerID, callerConnID, postID)
		createPost(t, p.store, postID, callerID, channelID)

		// The caller is ringing from a second device. That's still an unanswered call.
		require.NoError(t, p.store.CreateCallSession(&public.CallSession{
			ID:     callerSecondConnID,
			CallID: call.ID,
			UserID: callerID,
			JoinAt: time.Now().UnixMilli(),
		}))

		// Run through rtcd so the disconnects are observable, and so they have to be routed with
		// the host captured before setCallEnded blanked it.
		const hostIP = "127.0.0.1"
		mockRTCDClient := &serverMocks.MockRTCDClient{}
		defer mockRTCDClient.AssertExpectations(t)

		p.rtcdManager = &rtcdClientManager{
			ctx:   p,
			hosts: map[string]*rtcdHost{hostIP: {ip: hostIP, client: mockRTCDClient}},
		}
		call.Props.RTCDHost = hostIP
		require.NoError(t, p.store.UpdateCall(call))

		var recorder callEventRecorder
		mockRTCDClient.On("Send", mock.AnythingOfType("service.ClientMessage")).
			Run(recorder.recordRTCDLeave).Return(nil).Twice()

		mockAPI.On("HasPermissionToChannel", calleeID, channelID, model.PermissionCreatePost).Return(true).Once()
		mockAPI.On("KVDelete", "mutex_call_"+channelID).Return(nil).Once()
		mockAPI.On("GetConfig").Return(&model.Config{}, nil).Once()
		mockAPI.On("UpdatePost", mock.AnythingOfType("*model.Post")).Return(&model.Post{}, nil).Once()

		mockMetrics.On("IncWebSocketEvent", "out", wsEventCallEnd).Once()
		mockAPI.On("PublishWebSocketEvent", wsEventCallEnd, map[string]interface{}{},
			&model.WebsocketBroadcast{ChannelId: channelID, ReliableClusterSend: true}).
			Run(func(_ mock.Arguments) { recorder.record(wsEventCallEnd) }).Once()

		mockMetrics.On("IncWebSocketEvent", "out", wsEventUserDismissedNotification).Once()
		mockAPI.On("PublishWebSocketEvent", wsEventUserDismissedNotification, map[string]interface{}{
			"userID": calleeID,
			"callID": call.ID,
		}, &model.WebsocketBroadcast{UserId: calleeID, ReliableClusterSend: true}).Once()

		code, err := p.declineCall(channelID, calleeID)
		require.NoError(t, err)
		assert.Equal(t, http.StatusOK, code)

		// Clients are told the call ended first and only then are any sessions still connected
		// force-closed, out of band. Tearing the peer down first makes clients report a failed
		// connection rather than an ended call, and doing it inline would run the close under the
		// call lock, which closeRTCSession can re-enter.
		events := recorder.waitFor(t, 3)
		require.Equal(t, wsEventCallEnd, events[0])
		assert.ElementsMatch(t, []string{
			fmt.Sprintf("%s:%s", rtcd.ClientMessageLeave, callerConnID),
			fmt.Sprintf("%s:%s", rtcd.ClientMessageLeave, callerSecondConnID),
		}, events[1:])

		storedCall, err := p.store.GetCall(call.ID, db.GetCallOpts{FromWriter: true})
		require.NoError(t, err)
		assert.Greater(t, storedCall.EndAt, int64(0))

		sessions, err := p.store.GetCallSessions(call.ID, db.GetCallSessionOpts{FromWriter: true})
		require.NoError(t, err)
		assert.Empty(t, sessions)
	})

	t.Run("still ends the call when the caller cannot be disconnected", func(t *testing.T) {
		p, mockAPI, mockMetrics := newAPITestPlugin(t)
		defer mockAPI.AssertExpectations(t)
		defer mockMetrics.AssertExpectations(t)
		defer ResetTestStore(t, p.store)

		shortenCallEndGracePeriod(t)

		channelID := model.NewId()
		callerID := model.NewId()
		calleeID := model.NewId()
		postID := model.NewId()

		call := createDMCall(t, p, channelID, callerID, model.NewId(), postID)
		createPost(t, p.store, postID, callerID, channelID)

		const hostIP = "127.0.0.1"
		mockRTCDClient := &serverMocks.MockRTCDClient{}
		defer mockRTCDClient.AssertExpectations(t)

		p.rtcdManager = &rtcdClientManager{
			ctx:   p,
			hosts: map[string]*rtcdHost{hostIP: {ip: hostIP, client: mockRTCDClient}},
		}
		call.Props.RTCDHost = hostIP
		require.NoError(t, p.store.UpdateCall(call))

		// Force-closing is only a fallback for clients that don't act on call_end, so its
		// failure must not stop the decline from going through.
		var recorder callEventRecorder
		mockRTCDClient.On("Send", mock.AnythingOfType("service.ClientMessage")).
			Run(recorder.recordRTCDLeave).Return(fmt.Errorf("rtcd unreachable")).Once()

		mockAPI.On("HasPermissionToChannel", calleeID, channelID, model.PermissionCreatePost).Return(true).Once()
		mockAPI.On("KVDelete", "mutex_call_"+channelID).Return(nil).Once()
		mockAPI.On("GetConfig").Return(&model.Config{}, nil).Once()

		var capturedPost *model.Post
		mockAPI.On("UpdatePost", mock.AnythingOfType("*model.Post")).Run(func(args mock.Arguments) {
			capturedPost = args.Get(0).(*model.Post)
		}).Return(&model.Post{}, nil).Once()

		mockMetrics.On("IncWebSocketEvent", "out", wsEventCallEnd).Once()
		mockAPI.On("PublishWebSocketEvent", wsEventCallEnd, map[string]interface{}{},
			&model.WebsocketBroadcast{ChannelId: channelID, ReliableClusterSend: true}).Once()

		mockMetrics.On("IncWebSocketEvent", "out", wsEventUserDismissedNotification).Once()
		mockAPI.On("PublishWebSocketEvent", wsEventUserDismissedNotification, map[string]interface{}{
			"userID": calleeID,
			"callID": call.ID,
		}, &model.WebsocketBroadcast{UserId: calleeID, ReliableClusterSend: true}).Once()

		code, err := p.declineCall(channelID, calleeID)
		require.NoError(t, err)
		assert.Equal(t, http.StatusOK, code)

		require.NotNil(t, capturedPost)
		assert.Equal(t, callStatusDeclined, capturedPost.GetProp("call_status"))

		storedCall, err := p.store.GetCall(call.ID, db.GetCallOpts{FromWriter: true})
		require.NoError(t, err)
		assert.Greater(t, storedCall.EndAt, int64(0))

		// The failing disconnect is attempted out of band; wait for it so it doesn't outlive
		// the test.
		recorder.waitFor(t, 1)
	})
}

func TestHandleDeclineCall(t *testing.T) {
	t.Run("failed to get channel", func(t *testing.T) {
		p, mockAPI, _ := newAPITestPlugin(t)
		defer mockAPI.AssertExpectations(t)

		mockMetricsForRouter(t, p)
		apiRouter := p.newAPIRouter()

		channelID := model.NewId()
		userID := model.NewId()

		mockAPI.On("GetChannel", channelID).Return(nil, &model.AppError{Message: "not found"}).Once()

		w := httptest.NewRecorder()
		r := httptest.NewRequest("POST", fmt.Sprintf("/calls/%s/decline", channelID), nil)
		r.Header.Set("Mattermost-User-Id", userID)
		apiRouter.ServeHTTP(w, r)

		assert.Equal(t, http.StatusInternalServerError, w.Result().StatusCode)
	})

	t.Run("non-DM channel", func(t *testing.T) {
		p, mockAPI, _ := newAPITestPlugin(t)
		defer mockAPI.AssertExpectations(t)

		mockMetricsForRouter(t, p)
		apiRouter := p.newAPIRouter()

		channelID := model.NewId()
		userID := model.NewId()

		mockAPI.On("GetChannel", channelID).Return(&model.Channel{
			Id:   channelID,
			Type: model.ChannelTypeOpen,
		}, nil).Once()

		w := httptest.NewRecorder()
		r := httptest.NewRequest("POST", fmt.Sprintf("/calls/%s/decline", channelID), nil)
		r.Header.Set("Mattermost-User-Id", userID)
		apiRouter.ServeHTTP(w, r)

		assert.Equal(t, http.StatusBadRequest, w.Result().StatusCode)
	})

	t.Run("unauthenticated", func(t *testing.T) {
		p, mockAPI, _ := newAPITestPlugin(t)
		defer mockAPI.AssertExpectations(t)

		mockMetricsForRouter(t, p)
		apiRouter := p.newAPIRouter()

		w := httptest.NewRecorder()
		r := httptest.NewRequest("POST", fmt.Sprintf("/calls/%s/decline", model.NewId()), nil)
		apiRouter.ServeHTTP(w, r)

		assert.Equal(t, http.StatusUnauthorized, w.Result().StatusCode)
	})

	t.Run("DM channel — delegates to declineCall", func(t *testing.T) {
		p, mockAPI, _ := newAPITestPlugin(t)
		defer mockAPI.AssertExpectations(t)

		mockMetricsForRouter(t, p)
		apiRouter := p.newAPIRouter()

		channelID := model.NewId()
		userID := model.NewId()

		mockAPI.On("GetChannel", channelID).Return(&model.Channel{
			Id:   channelID,
			Type: model.ChannelTypeDirect,
		}, nil).Once()
		mockAPI.On("HasPermissionToChannel", userID, channelID, model.PermissionCreatePost).Return(true).Once()
		mockAPI.On("KVDelete", "mutex_call_"+channelID).Return(nil).Once()

		w := httptest.NewRecorder()
		r := httptest.NewRequest("POST", fmt.Sprintf("/calls/%s/decline", channelID), nil)
		r.Header.Set("Mattermost-User-Id", userID)
		apiRouter.ServeHTTP(w, r)

		// No call ongoing, which is declineCall's own error path surfacing through the handler.
		assert.Equal(t, http.StatusBadRequest, w.Result().StatusCode)
	})

	t.Run("DM channel — the callee declines a ringing call", func(t *testing.T) {
		p, mockAPI, mockMetrics := newAPITestPlugin(t)
		defer mockAPI.AssertExpectations(t)
		defer ResetTestStore(t, p.store)

		mockMetricsForRouter(t, p)
		apiRouter := p.newAPIRouter()

		channelID := model.NewId()
		callerID := model.NewId()
		calleeID := model.NewId()
		postID := model.NewId()

		call := createDMCall(t, p, channelID, callerID, model.NewId(), postID)
		createPost(t, p.store, postID, callerID, channelID)

		mockAPI.On("GetChannel", channelID).Return(&model.Channel{
			Id:   channelID,
			Type: model.ChannelTypeDirect,
		}, nil).Once()
		mockAPI.On("HasPermissionToChannel", calleeID, channelID, model.PermissionCreatePost).Return(true).Once()
		mockAPI.On("KVDelete", "mutex_call_"+channelID).Return(nil).Once()
		mockAPI.On("GetConfig").Return(&model.Config{}, nil).Once()
		mockAPI.On("UpdatePost", mock.AnythingOfType("*model.Post")).Return(&model.Post{}, nil).Once()

		mockMetrics.On("IncWebSocketEvent", "out", wsEventCallEnd).Once()
		mockAPI.On("PublishWebSocketEvent", wsEventCallEnd, map[string]interface{}{},
			&model.WebsocketBroadcast{ChannelId: channelID, ReliableClusterSend: true}).Once()

		mockMetrics.On("IncWebSocketEvent", "out", wsEventUserDismissedNotification).Once()
		mockAPI.On("PublishWebSocketEvent", wsEventUserDismissedNotification, map[string]interface{}{
			"userID": calleeID,
			"callID": call.ID,
		}, &model.WebsocketBroadcast{UserId: calleeID, ReliableClusterSend: true}).Once()

		w := httptest.NewRecorder()
		r := httptest.NewRequest("POST", fmt.Sprintf("/calls/%s/decline", channelID), nil)
		r.Header.Set("Mattermost-User-Id", calleeID)
		apiRouter.ServeHTTP(w, r)

		assert.Equal(t, http.StatusOK, w.Result().StatusCode)

		storedCall, err := p.store.GetCall(call.ID, db.GetCallOpts{FromWriter: true})
		require.NoError(t, err)
		assert.Greater(t, storedCall.EndAt, int64(0))
	})
}

// mockMetricsForRouter satisfies the metrics handler lookup newAPIRouter performs.
func mockMetricsForRouter(t *testing.T, p *Plugin) {
	t.Helper()
	p.metrics.(*serverMocks.MockMetrics).On("Handler").Return(nil).Once()
}

func TestCreateCallStartedPost(t *testing.T) {
	tests := []struct {
		name           string
		channelType    model.ChannelType
		wantCallStatus interface{}
	}{
		{
			name:           "DM channel gets the calling status",
			channelType:    model.ChannelTypeDirect,
			wantCallStatus: callStatusCalling,
		},
		{
			name:           "non-DM channel has no call status",
			channelType:    model.ChannelTypeOpen,
			wantCallStatus: nil,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			p, mockAPI, _ := newAPITestPlugin(t)
			defer mockAPI.AssertExpectations(t)

			channelID := model.NewId()
			userID := model.NewId()

			state := &callState{
				Call: public.Call{
					ID:        model.NewId(),
					ChannelID: channelID,
					StartAt:   time.Now().UnixMilli(),
				},
			}

			user := &model.User{Id: userID, Username: "caller"}
			mockAPI.On("GetUser", userID).Return(user, nil).Once()
			mockAPI.On("GetConfig").Return(&model.Config{}, nil)
			mockAPI.On("GetLicense").Return(nil, nil).Once()

			var capturedPost *model.Post
			createdPostID := model.NewId()
			mockAPI.On("CreatePost", mock.AnythingOfType("*model.Post")).Run(func(args mock.Arguments) {
				capturedPost = args.Get(0).(*model.Post)
			}).Return(&model.Post{Id: createdPostID}, nil).Once()

			// sendPushNotifications runs after the post is created; for a DM it looks up
			// the members, and for any other channel type it bails out early.
			mockAPI.On("GetChannel", channelID).Return(&model.Channel{
				Id:   channelID,
				Type: tc.channelType,
			}, nil).Once()
			if tc.channelType == model.ChannelTypeDirect {
				mockAPI.On("GetUsersInChannel", channelID, model.ChannelSortByUsername, 0, 8).
					Return([]*model.User{user}, nil).Once()
			}

			postID, threadID, err := p.createCallStartedPost(state, userID, channelID, "", "", tc.channelType)
			require.NoError(t, err)
			assert.Equal(t, createdPostID, postID)
			assert.Equal(t, createdPostID, threadID)

			require.NotNil(t, capturedPost)
			assert.Equal(t, callEventPostType, capturedPost.Type)
			assert.Equal(t, tc.wantCallStatus, capturedPost.GetProp("call_status"))
		})
	}
}
