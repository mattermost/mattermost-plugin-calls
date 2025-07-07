// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/mattermost/mattermost-plugin-calls/server/cluster"
	"github.com/mattermost/mattermost-plugin-calls/server/enterprise"
	"github.com/mattermost/mattermost-plugin-calls/server/public"
	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/plugin"

	serverMocks "github.com/mattermost/mattermost-plugin-calls/server/mocks/github.com/mattermost/mattermost-plugin-calls/server/interfaces"
	pluginMocks "github.com/mattermost/mattermost-plugin-calls/server/mocks/github.com/mattermost/mattermost/server/public/plugin"

	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
)

func TestHandleBotGetProfileForSession(t *testing.T) {
	mockAPI := &pluginMocks.MockAPI{}
	mockMetrics := &serverMocks.MockMetrics{}

	botUserID := model.NewId()

	p := Plugin{
		MattermostPlugin: plugin.MattermostPlugin{
			API: mockAPI,
		},
		metrics: mockMetrics,
		botSession: &model.Session{
			UserId: botUserID,
		},
		callsClusterLocks: map[string]*cluster.Mutex{},
	}

	p.licenseChecker = enterprise.NewLicenseChecker(p.API)

	store, tearDown := NewTestStore(t)
	t.Cleanup(tearDown)
	p.store = store

	mockAPI.On("KVSetWithOptions", mock.Anything, mock.Anything, mock.Anything).Return(true, nil)
	mockMetrics.On("ObserveClusterMutexGrabTime", "mutex_call", mock.AnythingOfType("float64"))
	mockMetrics.On("ObserveAppHandlersTime", mock.AnythingOfType("string"), mock.AnythingOfType("float64"))
	mockMetrics.On("ObserveClusterMutexLockedTime", "mutex_call", mock.AnythingOfType("float64"))
	mockMetrics.On("Handler").Return(nil).Once()

	mockAPI.On("GetConfig").Return(&model.Config{}, nil)
	mockAPI.On("GetLicense").Return(&model.License{
		SkuShortName: "enterprise",
	}, nil)

	apiRouter := p.newAPIRouter()

	t.Run("no call ongoing", func(t *testing.T) {
		defer mockAPI.AssertExpectations(t)
		defer mockMetrics.AssertExpectations(t)

		channelID := model.NewId()
		sessionID := model.NewId()

		mockAPI.On("LogDebug", "creating cluster mutex for call",
			"origin", mock.AnythingOfType("string"), "channelID", channelID).Once()
		mockAPI.On("KVDelete", "mutex_call_"+channelID).Return(nil).Once()

		w := httptest.NewRecorder()
		r := httptest.NewRequest("GET", fmt.Sprintf("/bot/calls/%s/sessions/%s/profile", channelID, sessionID), nil)
		r.Header.Set("Mattermost-User-Id", botUserID)

		apiRouter.ServeHTTP(w, r)

		resp := w.Result()
		require.Equal(t, http.StatusBadRequest, resp.StatusCode)
		var res httpResponse
		err := json.NewDecoder(resp.Body).Decode(&res)
		require.NoError(t, err)
		require.Equal(t, "no call ongoing", res.Msg)
		require.Equal(t, 400, res.Code)
	})

	t.Run("session not found", func(t *testing.T) {
		defer mockAPI.AssertExpectations(t)
		defer mockMetrics.AssertExpectations(t)

		channelID := model.NewId()
		sessionID := model.NewId()
		call := &public.Call{
			ID:        model.NewId(),
			ChannelID: channelID,
			CreateAt:  45,
			StartAt:   45,
			OwnerID:   botUserID,
		}
		err := store.CreateCall(call)
		require.NoError(t, err)

		w := httptest.NewRecorder()
		r := httptest.NewRequest("GET", fmt.Sprintf("/bot/calls/%s/sessions/%s/profile", channelID, sessionID), nil)

		mockAPI.On("LogDebug", "creating cluster mutex for call",
			"origin", mock.AnythingOfType("string"), "channelID", channelID).Once()
		mockAPI.On("KVDelete", "mutex_call_"+channelID).Return(nil).Once()

		r.Header.Set("Mattermost-User-Id", botUserID)
		apiRouter.ServeHTTP(w, r)

		resp := w.Result()
		require.Equal(t, http.StatusNotFound, resp.StatusCode)
		var res httpResponse
		err = json.NewDecoder(resp.Body).Decode(&res)
		require.NoError(t, err)
		require.Equal(t, "not found", res.Msg)
		require.Equal(t, 404, res.Code)
	})

	t.Run("get user error", func(t *testing.T) {
		channelID := model.NewId()
		userID := model.NewId()
		sessionID := model.NewId()
		call := &public.Call{
			ID:        model.NewId(),
			ChannelID: channelID,
			CreateAt:  45,
			StartAt:   45,
			OwnerID:   userID,
		}
		err := store.CreateCall(call)
		require.NoError(t, err)

		err = store.CreateCallSession(&public.CallSession{
			ID:     sessionID,
			CallID: call.ID,
			UserID: userID,
			JoinAt: 45,
		})
		require.NoError(t, err)

		mockAPI.On("GetUser", userID).Return(nil, &model.AppError{
			Message: "failed to get user",
		}).Once()

		w := httptest.NewRecorder()
		r := httptest.NewRequest("GET", "/bot/calls/"+channelID+"/sessions/"+sessionID+"/profile", nil)

		mockAPI.On("LogDebug", "creating cluster mutex for call",
			"origin", mock.AnythingOfType("string"), "channelID", channelID).Once()
		mockAPI.On("KVDelete", "mutex_call_"+channelID).Return(nil).Once()

		r.Header.Set("Mattermost-User-Id", botUserID)
		apiRouter.ServeHTTP(w, r)

		resp := w.Result()
		require.Equal(t, http.StatusInternalServerError, resp.StatusCode)

		var res httpResponse
		err = json.NewDecoder(resp.Body).Decode(&res)
		require.NoError(t, err)
		require.Equal(t, "failed to get user", res.Msg)
		require.Equal(t, 500, res.Code)
	})

	t.Run("success", func(t *testing.T) {
		channelID := model.NewId()
		userID := model.NewId()
		sessionID := model.NewId()
		call := &public.Call{
			ID:        model.NewId(),
			ChannelID: channelID,
			CreateAt:  45,
			StartAt:   45,
			OwnerID:   userID,
		}
		err := store.CreateCall(call)
		require.NoError(t, err)

		err = store.CreateCallSession(&public.CallSession{
			ID:     sessionID,
			CallID: call.ID,
			UserID: userID,
			JoinAt: 45,
		})
		require.NoError(t, err)

		user := &model.User{
			Id:       userID,
			Username: "testuser",
			Email:    "test@example.com",
		}
		mockAPI.On("GetUser", userID).Return(user, nil).Once()

		w := httptest.NewRecorder()
		r := httptest.NewRequest("GET", "/bot/calls/"+channelID+"/sessions/"+sessionID+"/profile", nil)

		mockAPI.On("LogDebug", "creating cluster mutex for call",
			"origin", mock.AnythingOfType("string"), "channelID", channelID).Once()
		mockAPI.On("KVDelete", "mutex_call_"+channelID).Return(nil).Once()

		r.Header.Set("Mattermost-User-Id", botUserID)
		apiRouter.ServeHTTP(w, r)

		resp := w.Result()
		require.Equal(t, http.StatusOK, resp.StatusCode)

		var respUser model.User
		err = json.NewDecoder(resp.Body).Decode(&respUser)
		require.NoError(t, err)
		require.Equal(t, userID, respUser.Id)
		require.Equal(t, user.Username, respUser.Username)
		require.Equal(t, user.Email, respUser.Email)
	})
}

func TestHandleBotUploadData(t *testing.T) {
	mockAPI := &pluginMocks.MockAPI{}
	mockMetrics := &serverMocks.MockMetrics{}

	botUserID := model.NewId()

	p := Plugin{
		MattermostPlugin: plugin.MattermostPlugin{
			API: mockAPI,
		},
		metrics: mockMetrics,
		botSession: &model.Session{
			UserId: botUserID,
		},
		callsClusterLocks: map[string]*cluster.Mutex{},
	}

	p.licenseChecker = enterprise.NewLicenseChecker(p.API)

	mockMetrics.On("Handler").Return(nil).Once()

	// Audit log
	mockAPI.On("LogDebug", "handleBotUploadData",
		"origin", mock.AnythingOfType("string"), mock.Anything, mock.Anything, mock.Anything,
		mock.Anything, mock.Anything, mock.Anything, mock.Anything,
		mock.Anything, mock.Anything, mock.Anything, mock.Anything,
		mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything)

	apiRouter := p.newAPIRouter()

	t.Run("upload session not found", func(t *testing.T) {
		defer mockAPI.AssertExpectations(t)
		defer mockMetrics.AssertExpectations(t)

		uploadID := model.NewId()

		mockAPI.On("GetConfig").Return(&model.Config{}, nil).Once()
		mockAPI.On("GetLicense").Return(&model.License{
			SkuShortName: "enterprise",
		}, nil).Once()
		mockAPI.On("GetUploadSession", uploadID).Return(nil, &model.AppError{
			Message:    "upload session not found",
			StatusCode: http.StatusNotFound,
		}).Once()

		w := httptest.NewRecorder()
		r := httptest.NewRequest("POST", "/bot/uploads/"+uploadID, nil)
		r.Header.Set("Mattermost-User-Id", botUserID)

		apiRouter.ServeHTTP(w, r)

		resp := w.Result()
		require.Equal(t, http.StatusNotFound, resp.StatusCode)
		var res httpResponse
		err := json.NewDecoder(resp.Body).Decode(&res)
		require.NoError(t, err)
		require.Equal(t, "upload session not found", res.Msg)
		require.Equal(t, 404, res.Code)
	})

	t.Run("invalid upload type", func(t *testing.T) {
		defer mockAPI.AssertExpectations(t)
		defer mockMetrics.AssertExpectations(t)

		uploadID := model.NewId()
		us := &model.UploadSession{
			Id:     uploadID,
			Type:   "invalid_type",
			UserId: botUserID,
		}

		mockAPI.On("GetConfig").Return(&model.Config{}, nil).Once()
		mockAPI.On("GetLicense").Return(&model.License{
			SkuShortName: "enterprise",
		}, nil).Once()
		mockAPI.On("GetUploadSession", uploadID).Return(us, nil).Once()

		w := httptest.NewRecorder()
		r := httptest.NewRequest("POST", "/bot/uploads/"+uploadID, nil)
		r.Header.Set("Mattermost-User-Id", botUserID)

		apiRouter.ServeHTTP(w, r)

		resp := w.Result()
		require.Equal(t, http.StatusBadRequest, resp.StatusCode)
		var res httpResponse
		err := json.NewDecoder(resp.Body).Decode(&res)
		require.NoError(t, err)
		require.Equal(t, "invalid upload type", res.Msg)
		require.Equal(t, 400, res.Code)
	})

	t.Run("not allowed to upload for different user", func(t *testing.T) {
		defer mockAPI.AssertExpectations(t)
		defer mockMetrics.AssertExpectations(t)

		uploadID := model.NewId()
		otherUserID := model.NewId()
		us := &model.UploadSession{
			Id:     uploadID,
			Type:   model.UploadTypeAttachment,
			UserId: otherUserID,
		}

		mockAPI.On("GetConfig").Return(&model.Config{}, nil).Once()
		mockAPI.On("GetLicense").Return(&model.License{
			SkuShortName: "enterprise",
		}, nil).Once()
		mockAPI.On("GetUploadSession", uploadID).Return(us, nil).Once()

		w := httptest.NewRecorder()
		r := httptest.NewRequest("POST", "/bot/uploads/"+uploadID, nil)
		r.Header.Set("Mattermost-User-Id", botUserID)

		apiRouter.ServeHTTP(w, r)

		resp := w.Result()
		require.Equal(t, http.StatusForbidden, resp.StatusCode)
		var res httpResponse
		err := json.NewDecoder(resp.Body).Decode(&res)
		require.NoError(t, err)
		require.Equal(t, "not allowed to upload data for this session", res.Msg)
		require.Equal(t, 403, res.Code)
	})

	t.Run("failed to get server configuration", func(t *testing.T) {
		defer mockAPI.AssertExpectations(t)
		defer mockMetrics.AssertExpectations(t)

		uploadID := model.NewId()
		us := &model.UploadSession{
			Id:     uploadID,
			Type:   model.UploadTypeAttachment,
			UserId: botUserID,
		}

		mockAPI.On("GetConfig").Return(&model.Config{}).Once()
		mockAPI.On("GetLicense").Return(&model.License{
			SkuShortName: "enterprise",
		}, nil).Once()
		mockAPI.On("GetUploadSession", uploadID).Return(us, nil).Once()
		mockAPI.On("GetConfig").Return(nil).Once()

		w := httptest.NewRecorder()
		r := httptest.NewRequest("POST", "/bot/uploads/"+uploadID, nil)
		r.Header.Set("Mattermost-User-Id", botUserID)

		apiRouter.ServeHTTP(w, r)

		resp := w.Result()
		require.Equal(t, http.StatusInternalServerError, resp.StatusCode)
		var res httpResponse
		err := json.NewDecoder(resp.Body).Decode(&res)
		require.NoError(t, err)
		require.Equal(t, "failed to get server configuration", res.Msg)
		require.Equal(t, 500, res.Code)
	})

	t.Run("upload data error", func(t *testing.T) {
		defer mockAPI.AssertExpectations(t)
		defer mockMetrics.AssertExpectations(t)

		uploadID := model.NewId()
		us := &model.UploadSession{
			Id:     uploadID,
			Type:   model.UploadTypeAttachment,
			UserId: botUserID,
		}

		maxFileSize := int64(1024 * 1024)
		config := &model.Config{
			FileSettings: model.FileSettings{
				MaxFileSize: &maxFileSize,
			},
		}

		mockAPI.On("GetConfig").Return(&model.Config{}).Once()
		mockAPI.On("GetLicense").Return(&model.License{
			SkuShortName: "enterprise",
		}, nil).Once()
		mockAPI.On("GetUploadSession", uploadID).Return(us, nil).Once()
		mockAPI.On("GetConfig").Return(config).Once()
		mockAPI.On("UploadData", us, mock.Anything).Return(nil, &model.AppError{
			Message:    "upload failed",
			StatusCode: http.StatusInternalServerError,
		}).Once()

		w := httptest.NewRecorder()
		r := httptest.NewRequest("POST", "/bot/uploads/"+uploadID, nil)
		r.Header.Set("Mattermost-User-Id", botUserID)

		apiRouter.ServeHTTP(w, r)

		resp := w.Result()
		require.Equal(t, http.StatusInternalServerError, resp.StatusCode)
		var res httpResponse
		err := json.NewDecoder(resp.Body).Decode(&res)
		require.NoError(t, err)
		require.Equal(t, "upload failed", res.Msg)
		require.Equal(t, 500, res.Code)
	})

	t.Run("upload incomplete", func(t *testing.T) {
		defer mockAPI.AssertExpectations(t)
		defer mockMetrics.AssertExpectations(t)

		uploadID := model.NewId()
		us := &model.UploadSession{
			Id:     uploadID,
			Type:   model.UploadTypeAttachment,
			UserId: botUserID,
		}

		maxFileSize := int64(1024 * 1024)
		config := &model.Config{
			FileSettings: model.FileSettings{
				MaxFileSize: &maxFileSize,
			},
		}

		mockAPI.On("GetConfig").Return(&model.Config{}).Once()
		mockAPI.On("GetLicense").Return(&model.License{
			SkuShortName: "enterprise",
		}, nil).Once()
		mockAPI.On("GetUploadSession", uploadID).Return(us, nil).Once()
		mockAPI.On("GetConfig").Return(config).Once()
		mockAPI.On("UploadData", us, mock.Anything).Return(nil, nil).Once()

		w := httptest.NewRecorder()
		r := httptest.NewRequest("POST", "/bot/uploads/"+uploadID, nil)
		r.Header.Set("Mattermost-User-Id", botUserID)

		apiRouter.ServeHTTP(w, r)

		resp := w.Result()
		require.Equal(t, http.StatusNoContent, resp.StatusCode)
	})

	t.Run("success", func(t *testing.T) {
		defer mockAPI.AssertExpectations(t)
		defer mockMetrics.AssertExpectations(t)

		uploadID := model.NewId()
		us := &model.UploadSession{
			Id:     uploadID,
			Type:   model.UploadTypeAttachment,
			UserId: botUserID,
		}

		maxFileSize := int64(1024 * 1024)
		config := &model.Config{
			FileSettings: model.FileSettings{
				MaxFileSize: &maxFileSize,
			},
		}

		fileInfo := &model.FileInfo{
			Id:   model.NewId(),
			Name: "test.txt",
			Size: 100,
		}

		mockAPI.On("GetConfig").Return(&model.Config{}).Once()
		mockAPI.On("GetLicense").Return(&model.License{
			SkuShortName: "enterprise",
		}, nil).Once()
		mockAPI.On("GetUploadSession", uploadID).Return(us, nil).Once()
		mockAPI.On("GetConfig").Return(config).Once()
		mockAPI.On("UploadData", us, mock.Anything).Return(fileInfo, nil).Once()

		w := httptest.NewRecorder()
		r := httptest.NewRequest("POST", "/bot/uploads/"+uploadID, nil)
		r.Header.Set("Mattermost-User-Id", botUserID)

		apiRouter.ServeHTTP(w, r)

		resp := w.Result()
		require.Equal(t, http.StatusOK, resp.StatusCode)

		var respFileInfo model.FileInfo
		err := json.NewDecoder(resp.Body).Decode(&respFileInfo)
		require.NoError(t, err)
		require.Equal(t, fileInfo.Id, respFileInfo.Id)
		require.Equal(t, fileInfo.Name, respFileInfo.Name)
		require.Equal(t, fileInfo.Size, respFileInfo.Size)
	})
}
