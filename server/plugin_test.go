// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/plugin"

	"github.com/stretchr/testify/assert"
)

func TestServeHTTP(t *testing.T) {
	assert := assert.New(t)
	plugin := Plugin{}
	w := httptest.NewRecorder()
	r := httptest.NewRequest(http.MethodGet, "/", nil)
	plugin.apiRouter = plugin.newAPIRouter()

	plugin.ServeHTTP(nil, w, r)

	result := w.Result()
	assert.NotNil(result)
	defer result.Body.Close()
	bodyBytes, err := io.ReadAll(result.Body)
	assert.Nil(err)
	bodyString := string(bodyBytes)

	assert.Equal("404 page not found\n", bodyString)
	assert.Equal(http.StatusNotFound, result.StatusCode)
}

func TestMessageWillBeUpdated(t *testing.T) {
	botSessionID := model.NewId()

	callPost := &model.Post{Id: model.NewId(), Type: callEventPostType}
	newPost := &model.Post{Id: callPost.Id, Message: "edited"}

	t.Run("a user cannot edit a call post", func(t *testing.T) {
		p := Plugin{botSession: &model.Session{Id: botSessionID}}

		post, reason := p.MessageWillBeUpdated(&plugin.Context{SessionId: model.NewId()}, newPost, callPost)

		assert.Nil(t, post)
		assert.Equal(t, "you are not allowed to edit a call post", reason)
	})

	t.Run("a user cannot edit a call post before the bot session is known", func(t *testing.T) {
		p := Plugin{}

		post, reason := p.MessageWillBeUpdated(&plugin.Context{SessionId: model.NewId()}, newPost, callPost)

		assert.Nil(t, post)
		assert.Equal(t, "you are not allowed to edit a call post", reason)
	})

	t.Run("the bot can edit a call post, which is how call metadata gets updated", func(t *testing.T) {
		p := Plugin{botSession: &model.Session{Id: botSessionID}}

		post, reason := p.MessageWillBeUpdated(&plugin.Context{SessionId: botSessionID}, newPost, callPost)

		assert.Equal(t, newPost, post)
		assert.Empty(t, reason)
	})

	t.Run("the plugin itself can edit a call post, having no session of its own", func(t *testing.T) {
		p := Plugin{botSession: &model.Session{Id: botSessionID}}

		post, reason := p.MessageWillBeUpdated(&plugin.Context{}, newPost, callPost)

		assert.Equal(t, newPost, post)
		assert.Empty(t, reason)
	})

	t.Run("an ordinary post can be edited", func(t *testing.T) {
		p := Plugin{botSession: &model.Session{Id: botSessionID}}

		post, reason := p.MessageWillBeUpdated(&plugin.Context{SessionId: model.NewId()}, newPost, &model.Post{Id: model.NewId()})

		assert.Equal(t, newPost, post)
		assert.Empty(t, reason)
	})
}
