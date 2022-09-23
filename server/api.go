// Copyright (c) 2022-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/pprof"
	"regexp"
	"strings"
	"time"

	"golang.org/x/time/rate"

	"github.com/mattermost/rtcd/service/rtc"

	"github.com/mattermost/mattermost-server/v6/model"
	"github.com/mattermost/mattermost-server/v6/plugin"
)

var chRE = regexp.MustCompile(`^\/([a-z0-9]+)$`)
var callEndRE = regexp.MustCompile(`^\/calls\/([a-z0-9]+)\/end$`)
var agendaGetRE = regexp.MustCompile(`^\/agenda\/([a-z0-9]+)$`)
var agendaUpdateRE = regexp.MustCompile(`^\/agenda\/([a-z0-9]+)\/item$`)
var agendaAddRE = regexp.MustCompile(`^\/agenda\/([a-z0-9]+)\/item$`)

const requestBodyMaxSizeBytes = 1024 * 1024 // 1MB

type Call struct {
	ID              string      `json:"id"`
	StartAt         int64       `json:"start_at"`
	Users           []string    `json:"users"`
	States          []userState `json:"states,omitempty"`
	ThreadID        string      `json:"thread_id"`
	ScreenSharingID string      `json:"screen_sharing_id"`
	OwnerID         string      `json:"owner_id"`
}

type ChannelState struct {
	ChannelID string `json:"channel_id,omitempty"`
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
				OwnerID:         state.Call.OwnerID,
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
	channels := []ChannelState{}
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
					OwnerID:         state.Call.OwnerID,
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

func (p *Plugin) handleEndCall(w http.ResponseWriter, r *http.Request, channelID string) {
	var res httpResponse
	defer p.httpAudit("handleEndCall", &res, w, r)

	userID := r.Header.Get("Mattermost-User-Id")

	isAdmin := p.API.HasPermissionTo(userID, model.PermissionManageSystem)

	state, err := p.kvGetChannelState(channelID)
	if err != nil {
		res.Err = err.Error()
		res.Code = http.StatusInternalServerError
		return
	}

	if state == nil || state.Call == nil {
		res.Err = "no call ongoing"
		res.Code = http.StatusBadRequest
		return
	}

	if !isAdmin && state.Call.OwnerID != userID {
		res.Err = "no permissions to end the call"
		res.Code = http.StatusForbidden
		return
	}

	callID := state.Call.ID

	if err := p.kvSetAtomicChannelState(channelID, func(state *channelState) (*channelState, error) {
		if state == nil || state.Call == nil {
			return nil, nil
		}

		if state.Call.ID != callID {
			return nil, fmt.Errorf("previous call has ended and new one has started")
		}

		if state.Call.EndAt == 0 {
			state.Call.EndAt = time.Now().UnixMilli()
		}

		return state, nil
	}); err != nil {
		res.Err = err.Error()
		res.Code = http.StatusForbidden
		return
	}

	p.metrics.IncWebSocketEvent("out", "call_end")
	p.API.PublishWebSocketEvent(wsEventCallEnd, map[string]interface{}{}, &model.WebsocketBroadcast{ChannelId: channelID, ReliableClusterSend: true})

	go func() {
		// We wait a few seconds for the call to end cleanly. If this doesn't
		// happen we force end it.
		time.Sleep(5 * time.Second)

		state, err := p.kvGetChannelState(channelID)
		if err != nil {
			p.LogError(err.Error())
			return
		}
		if state == nil || state.Call == nil || state.Call.ID != callID {
			return
		}

		p.LogInfo("call state is still in store, force ending it")

		for connID := range state.Call.Sessions {
			if err := p.closeRTCSession(userID, connID, channelID, state.NodeID); err != nil {
				p.LogError(err.Error())
			}
		}

		if err := p.cleanCallState(channelID); err != nil {
			p.LogError(err.Error())
		}
	}()

	res.Code = http.StatusOK
	res.Msg = "success"
}

func (p *Plugin) handlePostChannel(w http.ResponseWriter, r *http.Request, channelID string) {
	var res httpResponse
	defer p.httpAudit("handlePostChannel", &res, w, r)

	userID := r.Header.Get("Mattermost-User-Id")

	cfg := p.getConfiguration()
	if !*cfg.AllowEnableCalls && !p.API.HasPermissionTo(userID, model.PermissionManageSystem) {
		res.Err = "Forbidden"
		res.Code = http.StatusForbidden
		return
	}

	channel, appErr := p.API.GetChannel(channelID)
	if appErr != nil {
		res.Err = appErr.Error()
		res.Code = http.StatusInternalServerError
		return
	}

	cm, appErr := p.API.GetChannelMember(channelID, userID)
	if appErr != nil {
		res.Err = appErr.Error()
		res.Code = http.StatusInternalServerError
		return
	}

	switch channel.Type {
	case model.ChannelTypeOpen, model.ChannelTypePrivate:
		if !cm.SchemeAdmin && !p.API.HasPermissionTo(userID, model.PermissionManageSystem) {
			res.Err = "Forbidden"
			res.Code = http.StatusForbidden
			return
		}
	case model.ChannelTypeDirect, model.ChannelTypeGroup:
		if !p.API.HasPermissionToChannel(userID, channelID, model.PermissionCreatePost) {
			res.Err = "Forbidden"
			res.Code = http.StatusForbidden
			return
		}
	}

	var info ChannelState
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, requestBodyMaxSizeBytes)).Decode(&info); err != nil {
		res.Err = err.Error()
		res.Code = http.StatusBadRequest
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
		res.Err = err.Error()
		res.Code = http.StatusInternalServerError
		return
	}

	var evType string
	if info.Enabled {
		evType = "channel_enable_voice"
	} else {
		evType = "channel_disable_voice"
	}

	p.API.PublishWebSocketEvent(evType, nil, &model.WebsocketBroadcast{ChannelId: channelID, ReliableClusterSend: true})

	if err := json.NewEncoder(w).Encode(info); err != nil {
		p.LogError(err.Error())
	}
}

func (p *Plugin) handleDebug(w http.ResponseWriter, r *http.Request) {
	var res httpResponse
	defer p.httpAudit("handleDebug", &res, w, r)

	userID := r.Header.Get("Mattermost-User-Id")
	if !p.API.HasPermissionTo(userID, model.PermissionManageSystem) {
		res.Err = "Forbidden"
		res.Code = http.StatusForbidden
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
	res.Err = "Not found"
	res.Code = http.StatusNotFound
}

func (p *Plugin) handleGetTURNCredentials(w http.ResponseWriter, r *http.Request) {
	var res httpResponse
	defer p.httpAudit("handleGetTURNCredentials", &res, w, r)

	cfg := p.getConfiguration()
	if cfg.TURNStaticAuthSecret == "" {
		res.Err = "TURNStaticAuthSecret should be set"
		res.Code = http.StatusForbidden
		return
	}

	turnServers := cfg.ICEServersConfigs.getTURNConfigsForCredentials()
	if len(turnServers) == 0 {
		res.Err = "No TURN server was configured"
		res.Code = http.StatusForbidden
		return
	}

	user, appErr := p.API.GetUser(r.Header.Get("Mattermost-User-Id"))
	if appErr != nil {
		res.Err = appErr.Error()
		res.Code = http.StatusInternalServerError
		return
	}

	configs, err := rtc.GenTURNConfigs(turnServers, user.Username, cfg.TURNStaticAuthSecret, *cfg.TURNCredentialsExpirationMinutes)
	if err != nil {
		res.Err = err.Error()
		res.Code = http.StatusInternalServerError
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(configs); err != nil {
		p.LogError(err.Error())
	}
}

// handleConfig returns the client configuration, and cloud license information
// that isn't exposed to clients yet on the webapp
func (p *Plugin) handleConfig(w http.ResponseWriter) error {
	skuShortName := "starter"
	license := p.pluginAPI.System.GetLicense()
	if license != nil {
		skuShortName = license.SkuShortName
	}

	type config struct {
		clientConfig
		SkuShortName string `json:"sku_short_name"`
	}
	ret := config{
		clientConfig: p.getConfiguration().getClientConfig(),
		SkuShortName: skuShortName,
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(ret); err != nil {
		return fmt.Errorf("error encoding config: %w", err)
	}

	return nil
}

func (p *Plugin) checkAPIRateLimits(userID string) error {
	p.apiLimitersMut.RLock()
	limiter := p.apiLimiters[userID]
	p.apiLimitersMut.RUnlock()
	if limiter == nil {
		limiter = rate.NewLimiter(1, 10)
		p.apiLimitersMut.Lock()
		p.apiLimiters[userID] = limiter
		p.apiLimitersMut.Unlock()
	}

	if !limiter.Allow() {
		return fmt.Errorf(`{"message": "too many requests", "status_code": %d}`, http.StatusTooManyRequests)
	}

	return nil
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

	userID := r.Header.Get("Mattermost-User-Id")
	if userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	if err := p.checkAPIRateLimits(userID); err != nil {
		http.Error(w, err.Error(), http.StatusTooManyRequests)
		return
	}

	if strings.HasPrefix(r.URL.Path, "/debug") {
		p.handleDebug(w, r)
		return
	}

	if r.Method == http.MethodGet {
		if r.URL.Path == "/config" {
			if err := p.handleConfig(w); err != nil {
				p.handleError(w, err)
			}
			return
		}

		if r.URL.Path == "/channels" {
			p.handleGetAllChannels(w, r)
			return
		}

		if r.URL.Path == "/turn-credentials" {
			p.handleGetTURNCredentials(w, r)
			return
		}

		if matches := chRE.FindStringSubmatch(r.URL.Path); len(matches) == 2 {
			p.handleGetChannel(w, r, matches[1])
			return
		}

		if matches := agendaGetRE.FindStringSubmatch(r.URL.Path); len(matches) == 2 {
			session, err := p.pluginAPI.Session.Get(c.SessionId)
			if err != nil {
				p.handleErrorWithCode(w, http.StatusInternalServerError, "could not get session token", err)
			}
			p.handleGetAgenda(w, r, session.Token, matches[1])
			return
		}
	}

	if r.Method == http.MethodPut {
		if matches := agendaUpdateRE.FindStringSubmatch(r.URL.Path); len(matches) == 2 {
			session, err := p.pluginAPI.Session.Get(c.SessionId)
			if err != nil {
				p.handleErrorWithCode(w, http.StatusInternalServerError, "could not get session token", err)
			}
			p.handleUpdateAgendaItem(w, r, session.Id, matches[1])
			return
		}
	}

	if r.Method == http.MethodPost {
		// End user has requested to notify their admin about upgrading for calls
		if r.URL.Path == "/cloud-notify-admins" {
			if err := p.handleCloudNotifyAdmins(w, r); err != nil {
				p.handleError(w, err)
			}
			return
		}

		if matches := chRE.FindStringSubmatch(r.URL.Path); len(matches) == 2 {
			p.handlePostChannel(w, r, matches[1])
			return
		}

		if matches := callEndRE.FindStringSubmatch(r.URL.Path); len(matches) == 2 {
			p.handleEndCall(w, r, matches[1])
			return
		}

		if matches := agendaAddRE.FindStringSubmatch(r.URL.Path); len(matches) == 2 {
			session, err := p.pluginAPI.Session.Get(c.SessionId)
			if err != nil {
				p.handleErrorWithCode(w, http.StatusInternalServerError, "could not get session token", err)
			}
			p.handleAddAgendaItem(w, r, session.Id, matches[1])
			return
		}

		if r.URL.Path == "/telemetry/track" {
			p.handleTrackEvent(w, r)
			return
		}
	}

	http.NotFound(w, r)
}
