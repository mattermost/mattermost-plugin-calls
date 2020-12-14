package main

import (
	"encoding/json"
	"io/ioutil"
	"net/http"
	"regexp"

	"github.com/mattermost/mattermost-server/v5/model"
	"github.com/mattermost/mattermost-server/v5/plugin"
)

var wsRE = regexp.MustCompile(`^\/([a-z0-9]+)\/ws$`)
var chRE = regexp.MustCompile(`^\/([a-z0-9]+)$`)

func (p *Plugin) handleGetChannel(w http.ResponseWriter, r *http.Request, channelID string) {
	userID := r.Header.Get("Mattermost-User-Id")
	if !p.API.HasPermissionToChannel(userID, channelID, model.PERMISSION_CREATE_POST) {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}

	data, err := p.API.KVGet(channelID)
	if err != nil {
		p.API.LogError(err.Error())
		http.NotFound(w, r)
		return
	}
	if data == nil {
		http.NotFound(w, r)
		return
	}

	var info map[string]interface{}
	if err := json.Unmarshal(data, &info); err != nil {
		p.API.LogError(err.Error())
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	users := make([]string, 0)
	p.mut.RLock()
	for userID, session := range p.sessions {
		if session.channelID == channelID {
			users = append(users, userID)
		}
	}
	p.mut.RUnlock()

	info["users"] = users

	w.Header().Set("Content-Type", "application/json")

	json.NewEncoder(w).Encode(info)
}

func (p *Plugin) handlePostChannel(w http.ResponseWriter, r *http.Request, channelID string) {
	userID := r.Header.Get("Mattermost-User-Id")

	channel, appErr := p.API.GetChannel(channelID)
	if appErr != nil {
		p.API.LogError(appErr.Error())
		http.Error(w, appErr.Error(), http.StatusInternalServerError)
		return
	}

	cm, appErr := p.API.GetChannelMember(channelID, userID)
	if appErr != nil {
		p.API.LogError(appErr.Error())
		http.Error(w, appErr.Error(), http.StatusInternalServerError)
		return
	}

	switch channel.Type {
	case model.CHANNEL_OPEN, model.CHANNEL_PRIVATE:
		if !cm.SchemeAdmin && !p.API.HasPermissionTo(userID, model.PERMISSION_MANAGE_SYSTEM) {
			http.Error(w, "Forbidden", http.StatusForbidden)
			return
		}
	case model.CHANNEL_DIRECT, model.CHANNEL_GROUP:
		if !p.API.HasPermissionToChannel(userID, channelID, model.PERMISSION_CREATE_POST) {
			http.Error(w, "Forbidden", http.StatusForbidden)
			return
		}
	}

	data, err := ioutil.ReadAll(r.Body)
	if err != nil {
		p.API.LogError(err.Error())
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	var info map[string]interface{}
	if err := json.Unmarshal(data, &info); err != nil {
		p.API.LogError(err.Error())
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if err := p.API.KVSet(channelID, data); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	var evType string
	if info["enabled"].(bool) {
		evType = "channel_enable_voice"
	} else {
		evType = "channel_disable_voice"
	}

	p.API.PublishWebSocketEvent(evType, nil, &model.WebsocketBroadcast{ChannelId: channelID})

	w.Write(data)
}

func (p *Plugin) ServeHTTP(c *plugin.Context, w http.ResponseWriter, r *http.Request) {
	if r.Header.Get("Mattermost-User-Id") == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	if matches := wsRE.FindStringSubmatch(r.URL.Path); len(matches) == 2 {
		p.handleWebSocket(w, r, matches[1])
		return
	}

	if r.Method == http.MethodGet {
		if matches := chRE.FindStringSubmatch(r.URL.Path); len(matches) == 2 {
			p.handleGetChannel(w, r, matches[1])
			return
		}
	}

	if r.Method == http.MethodPost {
		if matches := chRE.FindStringSubmatch(r.URL.Path); len(matches) == 2 {
			p.handlePostChannel(w, r, matches[1])
			return
		}
	}

	http.NotFound(w, r)
}
