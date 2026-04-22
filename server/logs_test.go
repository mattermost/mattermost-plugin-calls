// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
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

	newPlugin := func() (*Plugin, *pluginMocks.MockAPI) {
		mockAPI := &pluginMocks.MockAPI{}
		p := &Plugin{
			MattermostPlugin: plugin.MattermostPlugin{API: mockAPI},
			botSession:       &model.Session{UserId: botID},
		}
		return p, mockAPI
	}

	t.Run("unauthorized without user id header", func(t *testing.T) {
		p, _ := newPlugin()
		body := `{"logs":"test","filename":"call_logs.txt"}`
		w := httptest.NewRecorder()
		r := httptest.NewRequest(http.MethodPost, "/logs/upload", strings.NewReader(body))
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

	t.Run("rejects empty filename", func(t *testing.T) {
		p, _ := newPlugin()
		body := `{"logs":"test","filename":""}`
		w := httptest.NewRecorder()
		r := httptest.NewRequest(http.MethodPost, "/logs/upload", strings.NewReader(body))
		r.Header.Set("Mattermost-User-Id", userID)
		p.handleUploadLogsToBot(w, r)
		require.Equal(t, http.StatusBadRequest, w.Code)
	})

	t.Run("sanitizes crafted filename before upload", func(t *testing.T) {
		p, mockAPI := newPlugin()
		defer mockAPI.AssertExpectations(t)

		// Input contains characters outside the allowlist; they must be
		// replaced with underscores before reaching UploadFile.
		rawFilename := `logs.txt<script>alert(1)</script>`
		wantFilename := `logs.txt_script_alert_1___script_`

		postID := model.NewId()
		fileID := model.NewId()

		mockAPI.On("GetDirectChannel", userID, botID).Return(&model.Channel{Id: dmChannelID}, nil).Once()
		mockAPI.On("UploadFile", mock.Anything, dmChannelID, wantFilename).Return(&model.FileInfo{Id: fileID}, nil).Once()
		mockAPI.On("CreatePost", mock.MatchedBy(func(p *model.Post) bool {
			return p.ChannelId == dmChannelID && len(p.FileIds) == 1 && p.FileIds[0] == fileID
		})).Return(&model.Post{Id: postID, ChannelId: dmChannelID, FileIds: []string{fileID}}, nil).Once()

		body := fmt.Sprintf(`{"logs":"test","filename":%q}`, rawFilename)
		w := httptest.NewRecorder()
		r := httptest.NewRequest(http.MethodPost, "/logs/upload", strings.NewReader(body))
		r.Header.Set("Mattermost-User-Id", userID)
		p.handleUploadLogsToBot(w, r)

		require.Equal(t, http.StatusOK, w.Code)

		var resp map[string]string
		require.NoError(t, json.NewDecoder(w.Result().Body).Decode(&resp))
		require.Equal(t, postID, resp["post_id"])
	})

	t.Run("happy path returns post_id of bot DM post", func(t *testing.T) {
		p, mockAPI := newPlugin()
		defer mockAPI.AssertExpectations(t)

		postID := model.NewId()
		fileID := model.NewId()
		filename := "call_logs_2026-04-22T10-00-00Z.txt"

		mockAPI.On("GetDirectChannel", userID, botID).Return(&model.Channel{Id: dmChannelID}, nil).Once()
		mockAPI.On("UploadFile", mock.Anything, dmChannelID, filename).Return(&model.FileInfo{Id: fileID}, nil).Once()
		mockAPI.On("CreatePost", mock.Anything).Return(&model.Post{Id: postID, ChannelId: dmChannelID, FileIds: []string{fileID}}, nil).Once()

		body := fmt.Sprintf(`{"logs":"test content","filename":%q}`, filename)
		w := httptest.NewRecorder()
		r := httptest.NewRequest(http.MethodPost, "/logs/upload", strings.NewReader(body))
		r.Header.Set("Mattermost-User-Id", userID)
		p.handleUploadLogsToBot(w, r)

		require.Equal(t, http.StatusOK, w.Code)
		var resp map[string]string
		require.NoError(t, json.NewDecoder(w.Result().Body).Decode(&resp))
		require.Equal(t, postID, resp["post_id"])
	})
}

func TestHandleLogsCommand(t *testing.T) {
	botID := model.NewId()
	userID := model.NewId()
	teamID := model.NewId()
	dmChannelID := model.NewId()
	currentChannelID := model.NewId()
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

	args := &model.CommandArgs{
		UserId:    userID,
		TeamId:    teamID,
		ChannelId: currentChannelID,
		SiteURL:   siteURL,
	}

	makeFields := func(payload any) []string {
		raw, err := json.Marshal(payload)
		require.NoError(t, err)
		return []string{"/call", "logs", base64.StdEncoding.EncodeToString(raw)}
	}

	t.Run("empty fields", func(t *testing.T) {
		p, _ := newPlugin()
		_, err := p.handleLogsCommand(args, []string{"/call", "logs"})
		require.EqualError(t, err, "empty logs")
	})

	t.Run("malformed base64 payload", func(t *testing.T) {
		p, _ := newPlugin()
		_, err := p.handleLogsCommand(args, []string{"/call", "logs", "not-base64!@#"})
		require.Error(t, err)
		require.Contains(t, err.Error(), "failed to decode payload")
	})

	t.Run("rejects invalid post id format", func(t *testing.T) {
		p, _ := newPlugin()
		fields := makeFields(map[string]string{"post_id": "too-short"})
		_, err := p.handleLogsCommand(args, fields)
		require.EqualError(t, err, "invalid post id in payload")
	})

	t.Run("rejects post that lives outside caller's bot DM (IDOR defense)", func(t *testing.T) {
		p, mockAPI := newPlugin()
		defer mockAPI.AssertExpectations(t)

		postID := model.NewId()
		otherChannelID := model.NewId()

		mockAPI.On("GetPost", postID).Return(&model.Post{Id: postID, ChannelId: otherChannelID}, nil).Once()
		mockAPI.On("GetDirectChannel", userID, botID).Return(&model.Channel{Id: dmChannelID}, nil).Once()

		fields := makeFields(map[string]string{"post_id": postID})
		_, err := p.handleLogsCommand(args, fields)
		require.EqualError(t, err, "invalid post id in payload")
	})

	t.Run("happy path emits permalink to caller's bot DM", func(t *testing.T) {
		p, mockAPI := newPlugin()
		defer mockAPI.AssertExpectations(t)

		postID := model.NewId()

		mockAPI.On("GetPost", postID).Return(&model.Post{Id: postID, ChannelId: dmChannelID}, nil).Once()
		mockAPI.On("GetDirectChannel", userID, botID).Return(&model.Channel{Id: dmChannelID}, nil).Once()
		mockAPI.On("GetTeam", teamID).Return(&model.Team{Id: teamID, Name: teamName}, nil).Once()

		fields := makeFields(map[string]string{"post_id": postID})
		resp, err := p.handleLogsCommand(args, fields)
		require.NoError(t, err)
		require.Equal(t, model.CommandResponseTypeEphemeral, resp.ResponseType)
		require.Contains(t, resp.Text, fmt.Sprintf("%s/%s/pl/%s", siteURL, teamName, postID))
	})
}
