// Copyright (c) 2022-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"database/sql/driver"
	"encoding/json"
	"testing"

	"github.com/mattermost/mattermost-plugin-calls/server/cluster"
	serverMocks "github.com/mattermost/mattermost-plugin-calls/server/mocks/github.com/mattermost/mattermost-plugin-calls/server/interfaces"
	pluginMocks "github.com/mattermost/mattermost-plugin-calls/server/mocks/github.com/mattermost/mattermost/server/public/plugin"
	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/plugin"

	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
)

func TestHandleBotWSReconnect(t *testing.T) {
	mockAPI := &pluginMocks.MockAPI{}
	mockDriver := &pluginMocks.MockDriver{}
	mockMetrics := &serverMocks.MockMetrics{}

	p := Plugin{
		MattermostPlugin: plugin.MattermostPlugin{
			API:    mockAPI,
			Driver: mockDriver,
		},
		callsClusterLocks: map[string]*cluster.Mutex{},
		metrics:           mockMetrics,
	}

	channelID := "channelID"

	// Boilerplate mocking
	var mockConfig model.Config
	mockConfig.SetDefaults()
	mockAPI.On("GetConfig").Return(&mockConfig).Once()
	mockDriver.On("Conn", true).Return("dbConnID", nil).Once()
	mockDriver.On("ConnPing", "dbConnID").Return(nil).Once()
	mockDriver.On("ConnQuery", "dbConnID", mock.AnythingOfType("string"), mock.AnythingOfType("[]driver.NamedValue")).Return("rowsID", nil)
	mockDriver.On("RowsColumns", "rowsID").Return([]string{"PValue"})
	mockDriver.On("RowsClose", "rowsID").Return(nil)
	mockAPI.On("KVDelete", "mutex_call_"+channelID).Return(nil)
	mockAPI.On("LogInfo",
		mock.AnythingOfType("string"),
		mock.AnythingOfType("string"),
		mock.AnythingOfType("string"),
		mock.AnythingOfType("string"),
		mock.AnythingOfType("string"),
	).Once()
	err := p.initDB()
	require.NoError(t, err)
	mockAPI.On("LogDebug", mock.Anything, mock.Anything, mock.Anything,
		mock.Anything, mock.Anything, mock.Anything, mock.Anything,
		mock.Anything, mock.Anything, mock.Anything, mock.Anything)
	mockAPI.On("KVSetWithOptions", mock.Anything, mock.Anything, mock.Anything).Return(true, nil)
	mockMetrics.On("ObserveClusterMutexGrabTime", "mutex_call", mock.AnythingOfType("float64"))
	mockMetrics.On("ObserveClusterMutexLockedTime", "mutex_call", mock.AnythingOfType("float64"))
	mockMetrics.On("IncStoreOp", "KVGet")
	mockMetrics.On("IncStoreOp", "KVSet")

	t.Run("no call ongoing", func(t *testing.T) {
		stateJSON, err := json.Marshal(&channelState{})
		require.NoError(t, err)

		// Here we define what data p.kvGetChannelState would return.
		mockDriver.On("RowsNext", "rowsID", mock.AnythingOfType("[]driver.Value")).Return(func(rowsID string, dest []driver.Value) error {
			require.Equal(t, "rowsID", rowsID)
			dest[0] = stateJSON
			return nil
		}).Once()

		// Here we assert that KVSet gets called with the expected serialized state.
		mockAPI.On("KVSet", "channelID", stateJSON).Return(nil).Once()

		err = p.handleBotWSReconnect("", "", "", channelID)
		require.NoError(t, err)
	})

	t.Run("no job", func(t *testing.T) {
		stateJSON, err := json.Marshal(&channelState{
			Call: &callState{
				ID: "callID",
			},
		})
		require.NoError(t, err)

		// Here we define what data p.kvGetChannelState would return.
		mockDriver.On("RowsNext", "rowsID", mock.AnythingOfType("[]driver.Value")).Return(func(rowsID string, dest []driver.Value) error {
			require.Equal(t, "rowsID", rowsID)
			dest[0] = stateJSON
			return nil
		}).Once()

		// Here we assert that KVSet gets called with the expected serialized state.
		mockAPI.On("KVSet", "channelID", stateJSON).Return(nil).Once()

		err = p.handleBotWSReconnect("", "", "", channelID)
		require.NoError(t, err)
	})

	t.Run("only recording job", func(t *testing.T) {
		state := &channelState{
			Call: &callState{
				ID: "callID",
				Recording: &jobState{
					BotConnID: "prevConnID",
				},
			},
		}
		stateJSON, err := json.Marshal(state)
		require.NoError(t, err)

		// Here we define what data p.kvGetChannelState would return.
		mockDriver.On("RowsNext", "rowsID", mock.AnythingOfType("[]driver.Value")).Return(func(rowsID string, dest []driver.Value) error {
			require.Equal(t, "rowsID", rowsID)
			dest[0] = stateJSON
			return nil
		}).Once()

		// We do the expected mutation.
		state.Call.Recording.BotConnID = "connID"
		expectedStateJSON, err := json.Marshal(state)
		require.NoError(t, err)

		// Here we assert that KVSet gets called with the expected serialized state.
		mockAPI.On("KVSet", "channelID", expectedStateJSON).Return(nil).Once()

		err = p.handleBotWSReconnect("connID", "prevConnID", "originalConnID", channelID)
		require.NoError(t, err)
	})

	t.Run("only transcribing job", func(t *testing.T) {
		state := &channelState{
			Call: &callState{
				ID: "callID",
				Transcription: &jobState{
					BotConnID: "prevConnID",
				},
			},
		}
		stateJSON, err := json.Marshal(state)
		require.NoError(t, err)

		// Here we define what data p.kvGetChannelState would return.
		mockDriver.On("RowsNext", "rowsID", mock.AnythingOfType("[]driver.Value")).Return(func(rowsID string, dest []driver.Value) error {
			require.Equal(t, "rowsID", rowsID)
			dest[0] = stateJSON
			return nil
		}).Once()

		// We do the expected mutation.
		state.Call.Transcription.BotConnID = "connID"
		expectedStateJSON, err := json.Marshal(state)
		require.NoError(t, err)

		mockAPI.On("KVSet", "channelID", expectedStateJSON).Return(nil).Once()

		// Here we assert that KVSet gets called with the expected serialized state.
		err = p.handleBotWSReconnect("connID", "prevConnID", "originalConnID", channelID)
		require.NoError(t, err)
	})

	t.Run("both jobs", func(t *testing.T) {
		t.Run("recording", func(t *testing.T) {
			state := &channelState{
				Call: &callState{
					ID: "callID",
					Recording: &jobState{
						BotConnID: "prevRecordingBotConnID",
					},
					Transcription: &jobState{
						BotConnID: "prevTranscribingBotConnID",
					},
				},
			}
			stateJSON, err := json.Marshal(state)
			require.NoError(t, err)

			// Here we define what data p.kvGetChannelState would return.
			mockDriver.On("RowsNext", "rowsID", mock.AnythingOfType("[]driver.Value")).Return(func(rowsID string, dest []driver.Value) error {
				require.Equal(t, "rowsID", rowsID)
				dest[0] = stateJSON
				return nil
			}).Once()

			// We do the expected mutation.
			state.Call.Recording.BotConnID = "newRecordingBotConnID"
			expectedStateJSON, err := json.Marshal(state)
			require.NoError(t, err)

			// Here we assert that KVSet gets called with the expected serialized state.
			mockAPI.On("KVSet", "channelID", expectedStateJSON).Return(nil).Once()

			err = p.handleBotWSReconnect("newRecordingBotConnID", "prevRecordingBotConnID", "originalConnID", channelID)
			require.NoError(t, err)
		})

		t.Run("transcription", func(t *testing.T) {
			state := &channelState{
				Call: &callState{
					ID: "callID",
					Recording: &jobState{
						BotConnID: "prevRecordingBotConnID",
					},
					Transcription: &jobState{
						BotConnID: "prevTranscribingBotConnID",
					},
				},
			}
			stateJSON, err := json.Marshal(state)
			require.NoError(t, err)

			// Here we define what data p.kvGetChannelState would return.
			mockDriver.On("RowsNext", "rowsID", mock.AnythingOfType("[]driver.Value")).Return(func(rowsID string, dest []driver.Value) error {
				require.Equal(t, "rowsID", rowsID)
				dest[0] = stateJSON
				return nil
			}).Once()

			// We do the expected mutation.
			state.Call.Transcription.BotConnID = "newTranscribingBotConnID"
			expectedStateJSON, err := json.Marshal(state)
			require.NoError(t, err)

			// Here we assert that KVSet gets called with the expected serialized state.
			mockAPI.On("KVSet", "channelID", expectedStateJSON).Return(nil).Once()

			err = p.handleBotWSReconnect("newTranscribingBotConnID", "prevTranscribingBotConnID", "originalConnID", channelID)
			require.NoError(t, err)
		})
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

	callChannelID := "callChannelID"

	t.Run("bot", func(t *testing.T) {
		p.botSession = &model.Session{
			UserId: "botUserID",
		}
		defer func() { p.botSession = nil }()

		t.Run("wsEventUserJoined/wsEventUserLeft", func(t *testing.T) {
			p.publishWebSocketEvent(wsEventUserJoined, map[string]any{
				"user_id": "botUserID",
			}, nil, nil)

			p.publishWebSocketEvent(wsEventUserLeft, map[string]any{
				"user_id": "botUserID",
			}, nil, nil)

			mockMetrics.AssertNotCalled(t, "IncWebSocketEvent")
			mockAPI.AssertNotCalled(t, "PublishWebSocketEvent")
		})

		t.Run("broadcast", func(t *testing.T) {
			data := map[string]any{}
			bc := &model.WebsocketBroadcast{
				ChannelId: callChannelID,
			}

			mockMetrics.On("IncWebSocketEvent", "out", wsEventUserMuted).Twice()

			mockAPI.On("PublishWebSocketEvent", wsEventUserMuted, map[string]any{
				"channelID": callChannelID,
			}, &model.WebsocketBroadcast{
				UserId: "botUserID",
			}).Once()

			mockAPI.On("PublishWebSocketEvent", wsEventUserMuted, map[string]any{
				"channelID": callChannelID,
			}, &model.WebsocketBroadcast{
				ChannelId: callChannelID,
				OmitUsers: map[string]bool{"botUserID": true},
			}).Once()

			p.publishWebSocketEvent(wsEventUserMuted, data, bc, nil)
		})
	})

	t.Run("connection specific", func(t *testing.T) {
		data := map[string]any{
			"session_id": "userSessionID",
		}
		bc := &model.WebsocketBroadcast{
			ConnectionId: "userConnID",
		}

		mockMetrics.On("IncWebSocketEvent", "out", wsEventUserMuted).Once()
		mockAPI.On("PublishWebSocketEvent", wsEventUserMuted, map[string]any{
			"session_id": "userSessionID",
		}, &model.WebsocketBroadcast{
			ConnectionId: "userConnID",
		}).Once()

		p.publishWebSocketEvent(wsEventUserMuted, data, bc, nil)
	})

	t.Run("missing call state", func(t *testing.T) {
		data := map[string]any{}
		bc := &model.WebsocketBroadcast{
			ChannelId: callChannelID,
		}

		mockMetrics.On("IncWebSocketEvent", "out", wsEventUserMuted).Once()
		mockAPI.On("PublishWebSocketEvent", wsEventUserMuted, data, &model.WebsocketBroadcast{
			ChannelId: callChannelID,
		}).Once()

		p.publishWebSocketEvent(wsEventUserMuted, data, bc, nil)
	})

	t.Run("call participants", func(t *testing.T) {
		data := map[string]any{}
		bc := &model.WebsocketBroadcast{
			ChannelId: callChannelID,
		}
		call := &callState{
			Sessions: map[string]*userState{
				"connA": {
					UserID: "userA",
				},
				"connB": {
					UserID: "userA",
				},
				"connC": {
					UserID: "userB",
				},
				"connD": {
					UserID: "userC",
				},
			},
		}

		mockMetrics.On("IncWebSocketEvent", "out", wsEventUserMuted).Times(3)
		mockAPI.On("PublishWebSocketEvent", wsEventUserMuted, data, &model.WebsocketBroadcast{
			ChannelId: callChannelID,
			UserId:    "userA",
		}).Once()
		mockAPI.On("PublishWebSocketEvent", wsEventUserMuted, data, &model.WebsocketBroadcast{
			ChannelId: callChannelID,
			UserId:    "userB",
		}).Once()
		mockAPI.On("PublishWebSocketEvent", wsEventUserMuted, data, &model.WebsocketBroadcast{
			ChannelId: callChannelID,
			UserId:    "userC",
		}).Once()

		p.publishWebSocketEvent(wsEventUserMuted, data, bc, call)
	})
}
