package main

import (
	"encoding/json"
	"io/ioutil"
	"net/http"
	"net/http/pprof"
	"regexp"
	"strings"

	"github.com/mattermost/mattermost-server/v6/model"
	"github.com/mattermost/mattermost-server/v6/plugin"
)

var chRE = regexp.MustCompile(`^\/([a-z0-9]+)$`)

type Call struct {
	ID              string      `json:"id"`
	StartAt         int64       `json:"start_at"`
	Users           []string    `json:"users"`
	States          []userState `json:"states,omitempty"`
	ThreadID        string      `json:"thread_id"`
	ScreenSharingID string      `json:"screen_sharing_id"`
}

type ChannelState struct {
	ChannelID string `json:"channel_id"`
	Enabled   bool   `json:"enabled"`
	Call      *Call  `json:"call,omitempty"`
}

func (p *Plugin) handleGetVersion(w http.ResponseWriter, r *http.Request) {
	info := map[string]interface{}{
		"version": manifest.Version,
		"build":   buildHash,
	}
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(info); err != nil {
		p.LogError(err.Error())
	}
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

	info := ChannelState{
		ChannelID: channelID,
	}

	cfg := p.getConfiguration()
	if state == nil && cfg.DefaultEnabled != nil && *cfg.DefaultEnabled {
		state = &channelState{
			Enabled: true,
		}
	}

	if state != nil {
		info.Enabled = state.Enabled
		if state.Call != nil {
			users, states := state.Call.getUsersAndStates()
			info.Call = &Call{
				ID:              state.Call.ID,
				StartAt:         state.Call.StartAt,
				Users:           users,
				States:          states,
				ThreadID:        state.Call.ThreadID,
				ScreenSharingID: state.Call.ScreenSharingID,
			}
		}
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(info); err != nil {
		p.LogError(err.Error())
	}
}

func (p *Plugin) hasPermissionToChannel(cm *model.ChannelMember, perm *model.Permission) bool {
	if cm == nil {
		return false
	}

	if p.API.RolesGrantPermission(cm.GetRoles(), perm.Id) {
		return true
	}

	channel, appErr := p.API.GetChannel(cm.ChannelId)
	if appErr == nil {
		return p.API.HasPermissionToTeam(cm.UserId, channel.TeamId, perm)
	}

	return p.API.HasPermissionTo(cm.UserId, perm)
}

func (p *Plugin) handleGetAllChannels(w http.ResponseWriter, r *http.Request) {
	userID := r.Header.Get("Mattermost-User-Id")

	var page int
	var channels []ChannelState
	channelMembers := map[string]*model.ChannelMember{}
	perPage := 200

	// getting all channel members for the asking user.
	for {
		cms, appErr := p.API.GetChannelMembersForUser("", userID, page, perPage)
		if appErr != nil {
			p.LogError(appErr.Error())
			http.Error(w, appErr.Error(), http.StatusInternalServerError)
			return
		}
		for i := range cms {
			channelMembers[cms[i].ChannelId] = cms[i]
		}
		if len(cms) < perPage {
			break
		}
		page++
	}

	// loop on channels to check membership/permissions
	page = 0
	for {
		p.metrics.IncStoreOp("KVList")
		channelIDs, appErr := p.API.KVList(page, perPage)
		if appErr != nil {
			p.LogError(appErr.Error())
			http.Error(w, appErr.Error(), http.StatusInternalServerError)
			return
		}

		for _, channelID := range channelIDs {
			if len(channelID) != 26 || !p.hasPermissionToChannel(channelMembers[channelID], model.PermissionReadChannel) {
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
				users, states := state.Call.getUsersAndStates()
				info.Call = &Call{
					ID:              state.Call.ID,
					StartAt:         state.Call.StartAt,
					Users:           users,
					States:          states,
					ThreadID:        state.Call.ThreadID,
					ScreenSharingID: state.Call.ScreenSharingID,
				}
			}
			channels = append(channels, info)
		}

		if len(channelIDs) < perPage {
			break
		}

		page++
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(channels); err != nil {
		p.LogError(err.Error())
	}
}

func (p *Plugin) handlePostChannel(w http.ResponseWriter, r *http.Request, channelID string) {
	var res httpResponse
	defer p.httpAudit("handlePostChannel", res, w, r)

	userID := r.Header.Get("Mattermost-User-Id")

	cfg := p.getConfiguration()
	if !*cfg.AllowEnableCalls && !p.API.HasPermissionTo(userID, model.PermissionManageSystem) {
		res.err = "Forbidden"
		res.code = http.StatusForbidden
		return
	}

	channel, appErr := p.API.GetChannel(channelID)
	if appErr != nil {
		res.err = appErr.Error()
		res.code = http.StatusInternalServerError
		return
	}

	cm, appErr := p.API.GetChannelMember(channelID, userID)
	if appErr != nil {
		res.err = appErr.Error()
		res.code = http.StatusInternalServerError
		return
	}

	switch channel.Type {
	case model.ChannelTypeOpen, model.ChannelTypePrivate:
		if !cm.SchemeAdmin && !p.API.HasPermissionTo(userID, model.PermissionManageSystem) {
			res.err = "Forbidden"
			res.code = http.StatusForbidden
			return
		}
	case model.ChannelTypeDirect, model.ChannelTypeGroup:
		if !p.API.HasPermissionToChannel(userID, channelID, model.PermissionCreatePost) {
			res.err = "Forbidden"
			res.code = http.StatusForbidden
			return
		}
	}

	data, err := ioutil.ReadAll(r.Body)
	if err != nil {
		res.err = err.Error()
		res.code = http.StatusInternalServerError
		return
	}

	var info ChannelState
	if err := json.Unmarshal(data, &info); err != nil {
		res.err = err.Error()
		res.code = http.StatusBadRequest
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
		res.err = err.Error()
		res.code = http.StatusInternalServerError
		return
	}

	var evType string
	if info.Enabled {
		evType = "channel_enable_voice"
	} else {
		evType = "channel_disable_voice"
	}

	p.API.PublishWebSocketEvent(evType, nil, &model.WebsocketBroadcast{ChannelId: channelID, ReliableClusterSend: true})

	if _, err := w.Write(data); err != nil {
		p.LogError(err.Error())
	}
}

func (p *Plugin) handleDebug(w http.ResponseWriter, r *http.Request) {
	var res httpResponse
	defer p.httpAudit("handleDebug", res, w, r)

	userID := r.Header.Get("Mattermost-User-Id")
	if !p.API.HasPermissionTo(userID, model.PermissionManageSystem) {
		res.err = "Forbidden"
		res.code = http.StatusForbidden
		return
	}
	if strings.HasPrefix(r.URL.Path, "/debug/pprof/profile") {
		pprof.Profile(w, r)
		return
	} else if strings.HasPrefix(r.URL.Path, "/debug/pprof/trace") {
		pprof.Trace(w, r)
		return
	} else if strings.HasPrefix(r.URL.Path, "/debug/pprof") {
		pprof.Index(w, r)
		return
	}
	res.err = "Not found"
	res.code = http.StatusNotFound
}

func (p *Plugin) ServeHTTP(c *plugin.Context, w http.ResponseWriter, r *http.Request) {
	if strings.HasPrefix(r.URL.Path, "/version") {
		p.handleGetVersion(w, r)
		return
	}

	if strings.HasPrefix(r.URL.Path, "/metrics") && p.metrics != nil {
		p.metrics.Handler().ServeHTTP(w, r)
		return
	}

	if r.Header.Get("Mattermost-User-Id") == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	if strings.HasPrefix(r.URL.Path, "/debug") {
		p.handleDebug(w, r)
		return
	}

	if r.Method == http.MethodGet {
		if r.URL.Path == "/config" {
			w.Header().Set("Content-Type", "application/json")
			if err := json.NewEncoder(w).Encode(p.getConfiguration().getClientConfig()); err != nil {
				p.LogError(err.Error())
			}
			return
		}

		// Return license information that isn't exposed to clients yet
		if r.URL.Path == "/cloud-info" {
			p.handleCloudInfo(w)
			return
		}

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
