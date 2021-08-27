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

type ChannelState struct {
	Enabled bool     `json:"enabled"`
	Users   []string `json:"users"`
}

func (p *Plugin) handleGetChannel(w http.ResponseWriter, r *http.Request, channelID string) {
	userID := r.Header.Get("Mattermost-User-Id")
	if !p.API.HasPermissionToChannel(userID, channelID, model.PERMISSION_CREATE_POST) {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}

	state, err := p.kvGetChannelState(channelID)
	if err != nil {
		p.API.LogError(err.Error())
	}
	if state == nil {
		http.NotFound(w, r)
		return
	}

	var i int
	users := make([]string, len(state.Users))
	for id := range state.Users {
		users[i] = id
		i++
	}

	info := ChannelState{
		Enabled: state.Enabled,
		Users:   users,
	}

	w.Header().Set("Content-Type", "application/json")

	if err := json.NewEncoder(w).Encode(info); err != nil {
		p.API.LogError(err.Error())
	}
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

	var info ChannelState
	if err := json.Unmarshal(data, &info); err != nil {
		p.API.LogError(err.Error())
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if err := p.kvSetAtomicChannelState(channelID, func(state *channelState) (*channelState, error) {
		if state == nil {
			state = &channelState{}
		}
		state.Enabled = info.Enabled
		return state, nil
	}); err != nil {
		// handle creation case
		p.API.LogError(err.Error())
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	var evType string
	if info.Enabled {
		evType = "channel_enable_voice"
	} else {
		evType = "channel_disable_voice"
	}

	p.API.PublishWebSocketEvent(evType, nil, &model.WebsocketBroadcast{ChannelId: channelID})

	if _, err := w.Write(data); err != nil {
		p.API.LogError(err.Error())
	}
}

func (p *Plugin) ServeHTTP(c *plugin.Context, w http.ResponseWriter, r *http.Request) {
	if r.Header.Get("Mattermost-User-Id") == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	if matches := wsRE.FindStringSubmatch(r.URL.Path); len(matches) == 2 {
		p.handleWebSocket(w, r, matches[1])
		p.LogDebug("ws handler done")
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
