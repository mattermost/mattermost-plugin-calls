package main

import (
	"encoding/json"
	"io/ioutil"
	"net/http"
	"regexp"

	"github.com/mattermost/mattermost-server/v6/model"
	"github.com/mattermost/mattermost-server/v6/plugin"
)

var wsRE = regexp.MustCompile(`^\/([a-z0-9]+)\/ws$`)
var chRE = regexp.MustCompile(`^\/([a-z0-9]+)$`)

type Call struct {
	ID              string   `json:"id"`
	StartAt         int64    `json:"start_at"`
	Users           []string `json:"users"`
	ThreadID        string   `json:"thread_id"`
	ScreenSharingID string   `json:"screen_sharing_id"`
}

type ChannelState struct {
	ChannelID string `json:"channel_id"`
	Enabled   bool   `json:"enabled"`
	Call      *Call  `json:"call,omitempty"`
}

func (p *Plugin) handleGetChannel(w http.ResponseWriter, r *http.Request, channelID string) {
	userID := r.Header.Get("Mattermost-User-Id")
	if !p.API.HasPermissionToChannel(userID, channelID, model.PermissionReadChannel) {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}

	state, err := p.kvGetChannelState(channelID)
	if err != nil {
		p.LogError(err.Error())
	}
	if state == nil {
		http.NotFound(w, r)
		return
	}

	info := ChannelState{
		ChannelID: channelID,
		Enabled:   state.Enabled,
	}
	if state.Call != nil {
		info.Call = &Call{
			ID:              state.Call.ID,
			StartAt:         state.Call.StartAt,
			Users:           state.Call.getUsers(),
			ThreadID:        state.Call.ThreadID,
			ScreenSharingID: state.Call.ScreenSharingID,
		}
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(info); err != nil {
		p.LogError(err.Error())
	}
}

func (p *Plugin) handleGetAllChannels(w http.ResponseWriter, r *http.Request) {
	userID := r.Header.Get("Mattermost-User-Id")

	// TODO: implement proper paging
	channelIDs, appErr := p.API.KVList(0, 30)
	if appErr != nil {
		p.LogError(appErr.Error())
		http.Error(w, appErr.Error(), http.StatusInternalServerError)
		return
	}

	var channels []ChannelState
	for _, channelID := range channelIDs {
		if !p.API.HasPermissionToChannel(userID, channelID, model.PermissionReadChannel) {
			continue
		}

		state, err := p.kvGetChannelState(channelID)
		if err != nil {
			p.LogError(err.Error())
			http.Error(w, appErr.Error(), http.StatusInternalServerError)
		}

		info := ChannelState{
			ChannelID: channelID,
			Enabled:   state.Enabled,
		}
		if state.Call != nil {
			info.Call = &Call{
				ID:              state.Call.ID,
				StartAt:         state.Call.StartAt,
				Users:           state.Call.getUsers(),
				ThreadID:        state.Call.ThreadID,
				ScreenSharingID: state.Call.ScreenSharingID,
			}
		}
		channels = append(channels, info)
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(channels); err != nil {
		p.LogError(err.Error())
	}
}

func (p *Plugin) handlePostChannel(w http.ResponseWriter, r *http.Request, channelID string) {
	userID := r.Header.Get("Mattermost-User-Id")

	channel, appErr := p.API.GetChannel(channelID)
	if appErr != nil {
		p.LogError(appErr.Error())
		http.Error(w, appErr.Error(), http.StatusInternalServerError)
		return
	}

	cm, appErr := p.API.GetChannelMember(channelID, userID)
	if appErr != nil {
		p.LogError(appErr.Error())
		http.Error(w, appErr.Error(), http.StatusInternalServerError)
		return
	}

	switch channel.Type {
	case model.ChannelTypeOpen, model.ChannelTypePrivate:
		if !cm.SchemeAdmin && !p.API.HasPermissionTo(userID, model.PermissionManageSystem) {
			http.Error(w, "Forbidden", http.StatusForbidden)
			return
		}
	case model.ChannelTypeDirect, model.ChannelTypeGroup:
		if !p.API.HasPermissionToChannel(userID, channelID, model.PermissionCreatePost) {
			http.Error(w, "Forbidden", http.StatusForbidden)
			return
		}
	}

	data, err := ioutil.ReadAll(r.Body)
	if err != nil {
		p.LogError(err.Error())
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	var info ChannelState
	if err := json.Unmarshal(data, &info); err != nil {
		p.LogError(err.Error())
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
		p.LogError(err.Error())
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
		p.LogError(err.Error())
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
		if r.URL.Path == "/channels" {
			p.handleGetAllChannels(w, r)
			return
		}

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
