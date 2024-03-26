// Copyright (c) 2022-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	// "encoding/json"
	"fmt"
	"net/http"
	"sync"
	"testing"
	"time"

	"github.com/mattermost/mattermost-plugin-calls/server/cluster"
	serverMocks "github.com/mattermost/mattermost-plugin-calls/server/mocks/github.com/mattermost/mattermost-plugin-calls/server/interfaces"
	pluginMocks "github.com/mattermost/mattermost-plugin-calls/server/mocks/github.com/mattermost/mattermost/server/public/plugin"
	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/plugin"

	"github.com/stretchr/testify/mock"
	// "github.com/stretchr/testify/require"
)

// func TestHandleBotWSReconnect(t *testing.T) {
// 	mockAPI := &pluginMocks.MockAPI{}
// 	mockMetrics := &serverMocks.MockMetrics{}
// 	mockStore := &serverMocks.MockStore{}

// 	p := Plugin{
// 		MattermostPlugin: plugin.MattermostPlugin{
// 			API: mockAPI,
// 		},
// 		callsClusterLocks: map[string]*cluster.Mutex{},
// 		metrics:           mockMetrics,
// 		store:             mockStore,
// 	}

// 	channelID := "channelID"

// 	mockAPI.On("LogDebug", mock.Anything, mock.Anything, mock.Anything,
// 		mock.Anything, mock.Anything, mock.Anything, mock.Anything,
// 		mock.Anything, mock.Anything, mock.Anything, mock.Anything)
// 	mockAPI.On("KVSetWithOptions", mock.Anything, mock.Anything, mock.Anything).Return(true, nil)
// 	mockMetrics.On("ObserveClusterMutexGrabTime", "mutex_call", mock.AnythingOfType("float64"))
// 	mockMetrics.On("ObserveClusterMutexLockedTime", "mutex_call", mock.AnythingOfType("float64"))
// 	mockMetrics.On("IncStoreOp", "KVGet")
// 	mockMetrics.On("IncStoreOp", "KVSet")

// 	t.Run("no call ongoing", func(t *testing.T) {
// 		stateJSON, err := json.Marshal(&channelState{})
// 		require.NoError(t, err)

// 		// Here we define what data p.kvGetChannelState would return.
// 		mockStore.On("KVGet", "com.mattermost.calls", "channelID", true).Return(stateJSON, nil).Once()
// 		mockAPI.On("KVDelete", "mutex_call_channelID").Return(nil).Once()

// 		// Here we assert that KVSet gets called with the expected serialized state.
// 		mockAPI.On("KVSet", "channelID", stateJSON).Return(nil).Once()

// 		err = p.handleBotWSReconnect("", "", "", channelID)
// 		require.NoError(t, err)
// 	})

// 	t.Run("no job", func(t *testing.T) {
// 		stateJSON, err := json.Marshal(&channelState{
// 			Call: &callState{
// 				ID: "callID",
// 			},
// 		})
// 		require.NoError(t, err)

// 		// Here we define what data p.kvGetChannelState would return.
// 		mockStore.On("KVGet", "com.mattermost.calls", "channelID", true).Return(stateJSON, nil).Once()
// 		mockAPI.On("KVDelete", "mutex_call_channelID").Return(nil).Once()

// 		// Here we assert that KVSet gets called with the expected serialized state.
// 		mockAPI.On("KVSet", "channelID", stateJSON).Return(nil).Once()

// 		err = p.handleBotWSReconnect("", "", "", channelID)
// 		require.NoError(t, err)
// 	})

// 	t.Run("only recording job", func(t *testing.T) {
// 		state := &channelState{
// 			Call: &callState{
// 				ID: "callID",
// 				Recording: &jobState{
// 					BotConnID: "prevConnID",
// 				},
// 			},
// 		}
// 		stateJSON, err := json.Marshal(state)
// 		require.NoError(t, err)

// 		// Here we define what data p.kvGetChannelState would return.
// 		mockStore.On("KVGet", "com.mattermost.calls", "channelID", true).Return(stateJSON, nil).Once()
// 		mockAPI.On("KVDelete", "mutex_call_channelID").Return(nil).Once()

// 		// We do the expected mutation.
// 		state.Recording.BotConnID = "connID"
// 		expectedStateJSON, err := json.Marshal(state)
// 		require.NoError(t, err)

// 		// Here we assert that KVSet gets called with the expected serialized state.
// 		mockAPI.On("KVSet", "channelID", expectedStateJSON).Return(nil).Once()

// 		err = p.handleBotWSReconnect("connID", "prevConnID", "originalConnID", channelID)
// 		require.NoError(t, err)
// 	})

// 	t.Run("only transcribing job", func(t *testing.T) {
// 		state := &channelState{
// 			Call: &callState{
// 				ID: "callID",
// 				Transcription: &jobState{
// 					BotConnID: "prevConnID",
// 				},
// 			},
// 		}
// 		stateJSON, err := json.Marshal(state)
// 		require.NoError(t, err)

// 		// Here we define what data p.kvGetChannelState would return.
// 		mockStore.On("KVGet", "com.mattermost.calls", "channelID", true).Return(stateJSON, nil).Once()
// 		mockAPI.On("KVDelete", "mutex_call_channelID").Return(nil).Once()

// 		// We do the expected mutation.
// 		state.Transcription.BotConnID = "connID"
// 		expectedStateJSON, err := json.Marshal(state)
// 		require.NoError(t, err)

// 		mockAPI.On("KVSet", "channelID", expectedStateJSON).Return(nil).Once()

// 		// Here we assert that KVSet gets called with the expected serialized state.
// 		err = p.handleBotWSReconnect("connID", "prevConnID", "originalConnID", channelID)
// 		require.NoError(t, err)
// 	})

// 	t.Run("both jobs", func(t *testing.T) {
// 		t.Run("recording", func(t *testing.T) {
// 			state := &channelState{
// 				Call: &callState{
// 					ID: "callID",
// 					Recording: &jobState{
// 						BotConnID: "prevRecordingBotConnID",
// 					},
// 					Transcription: &jobState{
// 						BotConnID: "prevTranscribingBotConnID",
// 					},
// 				},
// 			}
// 			stateJSON, err := json.Marshal(state)
// 			require.NoError(t, err)

// 			// Here we define what data p.kvGetChannelState would return.
// 			mockStore.On("KVGet", "com.mattermost.calls", "channelID", true).Return(stateJSON, nil).Once()
// 			mockAPI.On("KVDelete", "mutex_call_channelID").Return(nil).Once()

// 			// We do the expected mutation.
// 			state.Recording.BotConnID = "newRecordingBotConnID"
// 			expectedStateJSON, err := json.Marshal(state)
// 			require.NoError(t, err)

// 			// Here we assert that KVSet gets called with the expected serialized state.
// 			mockAPI.On("KVSet", "channelID", expectedStateJSON).Return(nil).Once()

// 			err = p.handleBotWSReconnect("newRecordingBotConnID", "prevRecordingBotConnID", "originalConnID", channelID)
// 			require.NoError(t, err)
// 		})

// 		t.Run("transcription", func(t *testing.T) {
// 			state := &channelState{
// 				Call: &callState{
// 					ID: "callID",
// 					Recording: &jobState{
// 						BotConnID: "prevRecordingBotConnID",
// 					},
// 					Transcription: &jobState{
// 						BotConnID: "prevTranscribingBotConnID",
// 					},
// 				},
// 			}
// 			stateJSON, err := json.Marshal(state)
// 			require.NoError(t, err)

// 			// Here we define what data p.kvGetChannelState would return.
// 			mockStore.On("KVGet", "com.mattermost.calls", "channelID", true).Return(stateJSON, nil).Once()
// 			mockAPI.On("KVDelete", "mutex_call_channelID").Return(nil).Once()

// 			// We do the expected mutation.
// 			state.Transcription.BotConnID = "newTranscribingBotConnID"
// 			expectedStateJSON, err := json.Marshal(state)
// 			require.NoError(t, err)

// 			// Here we assert that KVSet gets called with the expected serialized state.
// 			mockAPI.On("KVSet", "channelID", expectedStateJSON).Return(nil).Once()

// 			err = p.handleBotWSReconnect("newTranscribingBotConnID", "prevTranscribingBotConnID", "originalConnID", channelID)
// 			require.NoError(t, err)
// 		})
// 	})
// }

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

		t.Run("empty session ID", func(t *testing.T) {
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

		t.Run("valid session", func(t *testing.T) {
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

		t.Run("valid session, no expiration", func(t *testing.T) {
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

		t.Run("expired session", func(t *testing.T) {
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

		t.Run("revoked session", func(t *testing.T) {
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
