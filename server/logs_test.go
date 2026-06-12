// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"regexp"
	"strings"
	"testing"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/plugin"

	pluginMocks "github.com/mattermost/mattermost-plugin-calls/server/mocks/github.com/mattermost/mattermost/server/public/plugin"

	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
)

func TestHandleUploadLogsToBot(t *testing.T) {
	botID := model.NewId()
	userID := model.NewId()
	dmChannelID := model.NewId()
	originChannelID := model.NewId()
	teamID := model.NewId()
	teamName := "myteam"
	siteURL := "https://example.test"

	newPlugin := func() (*Plugin, *pluginMocks.MockAPI) {
		mockAPI := &pluginMocks.MockAPI{}
		p := &Plugin{
			MattermostPlugin: plugin.MattermostPlugin{API: mockAPI},
			botSession:       &model.Session{UserId: botID},
		}
		return p, mockAPI
	}

	body := func(payload any) string {
		raw, err := json.Marshal(payload)
		require.NoError(t, err)
		return string(raw)
	}

	t.Run("unauthorized without user id header", func(t *testing.T) {
		p, _ := newPlugin()
		w := httptest.NewRecorder()
		r := httptest.NewRequest(http.MethodPost, "/logs/upload", strings.NewReader(body(map[string]string{
			"logs":       "test",
			"channel_id": originChannelID,
			"team_id":    teamID,
		})))
		p.handleUploadLogsToBot(w, r)
		require.Equal(t, http.StatusUnauthorized, w.Code)
	})

	t.Run("invalid request body", func(t *testing.T) {
		p, _ := newPlugin()
		w := httptest.NewRecorder()
		r := httptest.NewRequest(http.MethodPost, "/logs/upload", strings.NewReader("not json"))
		r.Header.Set("Mattermost-User-Id", userID)
		p.handleUploadLogsToBot(w, r)
		require.Equal(t, http.StatusBadRequest, w.Code)
	})

	t.Run("rejects invalid channel_id", func(t *testing.T) {
		p, _ := newPlugin()
		w := httptest.NewRecorder()
		r := httptest.NewRequest(http.MethodPost, "/logs/upload", strings.NewReader(body(map[string]string{
			"logs":       "test",
			"channel_id": "too-short",
			"team_id":    teamID,
		})))
		r.Header.Set("Mattermost-User-Id", userID)
		p.handleUploadLogsToBot(w, r)
		require.Equal(t, http.StatusBadRequest, w.Code)
	})

	t.Run("rejects invalid team_id", func(t *testing.T) {
		p, _ := newPlugin()
		w := httptest.NewRecorder()
		r := httptest.NewRequest(http.MethodPost, "/logs/upload", strings.NewReader(body(map[string]string{
			"logs":       "test",
			"channel_id": originChannelID,
			"team_id":    "",
		})))
		r.Header.Set("Mattermost-User-Id", userID)
		p.handleUploadLogsToBot(w, r)
		require.Equal(t, http.StatusBadRequest, w.Code)
	})

	t.Run("happy path uploads, posts, and emits ephemeral with permalink", func(t *testing.T) {
		p, mockAPI := newPlugin()
		defer mockAPI.AssertExpectations(t)

		postID := model.NewId()
		fileID := model.NewId()
		filenameRE := regexp.MustCompile(`^call_logs_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z\.txt$`)

		mockAPI.On("GetDirectChannel", userID, botID).Return(&model.Channel{Id: dmChannelID}, nil).Once()
		mockAPI.On("UploadFile", mock.Anything, dmChannelID, mock.MatchedBy(func(name string) bool {
			return filenameRE.MatchString(name)
		})).Return(&model.FileInfo{Id: fileID}, nil).Once()
		mockAPI.On("CreatePost", mock.MatchedBy(func(p *model.Post) bool {
			return p.UserId == botID && p.ChannelId == dmChannelID && len(p.FileIds) == 1 && p.FileIds[0] == fileID
		})).Return(&model.Post{Id: postID, ChannelId: dmChannelID, FileIds: []string{fileID}}, nil).Once()
		mockAPI.On("GetTeam", teamID).Return(&model.Team{Id: teamID, Name: teamName}, nil).Once()
		mockAPI.On("GetConfig").Return(&model.Config{
			ServiceSettings: model.ServiceSettings{SiteURL: model.NewPointer(siteURL)},
		}).Once()

		expectedPermalink := fmt.Sprintf("%s/%s/pl/%s", siteURL, teamName, postID)
		mockAPI.On("SendEphemeralPost", userID, mock.MatchedBy(func(post *model.Post) bool {
			return post.ChannelId == originChannelID && strings.Contains(post.Message, expectedPermalink)
		})).Return(&model.Post{}).Once()

		w := httptest.NewRecorder()
		r := httptest.NewRequest(http.MethodPost, "/logs/upload", strings.NewReader(body(map[string]string{
			"logs":       "test content",
			"channel_id": originChannelID,
			"team_id":    teamID,
		})))
		r.Header.Set("Mattermost-User-Id", userID)
		p.handleUploadLogsToBot(w, r)

		require.Equal(t, http.StatusOK, w.Code)
		require.Equal(t, "application/json", w.Header().Get("Content-Type"))
		require.JSONEq(t, "{}", w.Body.String())
	})

	t.Run("accepts logs above the old 1MB body limit, leaving margin for JSON escaping", func(t *testing.T) {
		p, mockAPI := newPlugin()
		defer mockAPI.AssertExpectations(t)

		postID := model.NewId()
		fileID := model.NewId()

		// 1.5MB of log text: comfortably over the client's 1MB cap once
		// JSON-escaping overhead is added, yet under the upload limit. This
		// used to trip the old 1MB server body limit and 400.
		logs := strings.Repeat("a", 1536*1024)

		mockAPI.On("GetDirectChannel", userID, botID).Return(&model.Channel{Id: dmChannelID}, nil).Once()
		mockAPI.On("UploadFile", mock.Anything, dmChannelID, mock.Anything).Return(&model.FileInfo{Id: fileID}, nil).Once()
		mockAPI.On("CreatePost", mock.Anything).Return(&model.Post{Id: postID, ChannelId: dmChannelID, FileIds: []string{fileID}}, nil).Once()
		mockAPI.On("GetTeam", teamID).Return(&model.Team{Id: teamID, Name: teamName}, nil).Once()
		mockAPI.On("GetConfig").Return(&model.Config{
			ServiceSettings: model.ServiceSettings{SiteURL: model.NewPointer(siteURL)},
		}).Once()
		mockAPI.On("SendEphemeralPost", userID, mock.Anything).Return(&model.Post{}).Once()

		w := httptest.NewRecorder()
		r := httptest.NewRequest(http.MethodPost, "/logs/upload", strings.NewReader(body(map[string]string{
			"logs":       logs,
			"channel_id": originChannelID,
			"team_id":    teamID,
		})))
		r.Header.Set("Mattermost-User-Id", userID)
		p.handleUploadLogsToBot(w, r)

		require.Equal(t, http.StatusOK, w.Code)
	})

	t.Run("rejects bodies beyond the upload size limit", func(t *testing.T) {
		p, _ := newPlugin()
		w := httptest.NewRecorder()
		// A logs string larger than logsUploadMaxSizeBytes (2MB) on its own.
		r := httptest.NewRequest(http.MethodPost, "/logs/upload", strings.NewReader(body(map[string]string{
			"logs":       strings.Repeat("a", 3*1024*1024),
			"channel_id": originChannelID,
			"team_id":    teamID,
		})))
		r.Header.Set("Mattermost-User-Id", userID)
		p.handleUploadLogsToBot(w, r)
		require.Equal(t, http.StatusBadRequest, w.Code)
	})
}
