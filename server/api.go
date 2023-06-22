// Copyright (c) 2022-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/pprof"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"golang.org/x/time/rate"

	"github.com/mattermost/rtcd/service/rtc"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/plugin"
)

var chRE = regexp.MustCompile(`^\/([a-z0-9]+)$`)
var callEndRE = regexp.MustCompile(`^\/calls\/([a-z0-9]+)\/end$`)

const requestBodyMaxSizeBytes = 1024 * 1024 // 1MB

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
	// We should go through only if the user has permissions to the requested channel
	// or if the user is the Calls bot.
	if !(p.isBotSession(r) || p.API.HasPermissionToChannel(userID, channelID, model.PermissionReadChannel)) {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}

	mobile, postGA := isMobilePostGA(r)

	state, err := p.kvGetChannelState(channelID)
	if err != nil {
		p.LogError(err.Error())
	}

	info := ChannelStateClient{
		ChannelID: channelID,
	}

	if state != nil {
		info.Enabled = state.Enabled
		// This is for backwards compatibility for mobile pre-v2
		if info.Enabled == nil && mobile && !postGA {
			cfg := p.getConfiguration()
			info.Enabled = model.NewBool(cfg.DefaultEnabled != nil && *cfg.DefaultEnabled)
		}

		if state.Call != nil {
			info.Call = state.Call.getClientState(p.getBotID())
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
	mobile, postGA := isMobilePostGA(r)

	var page int
	channels := []ChannelStateClient{}
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

			enabled := state.Enabled
			// This is for backwards compatibility for mobile pre-v2
			if enabled == nil && mobile && !postGA {
				cfg := p.getConfiguration()
				enabled = model.NewBool(cfg.DefaultEnabled != nil && *cfg.DefaultEnabled)
			}
			info := ChannelStateClient{
				ChannelID: channelID,
				Enabled:   enabled,
			}
			if state.Call != nil {
				info.Call = state.Call.getClientState(p.getBotID())
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

	p.publishWebSocketEvent(wsEventCallEnd, map[string]interface{}{}, &model.WebsocketBroadcast{ChannelId: channelID, ReliableClusterSend: true})

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

		p.LogInfo("call state is still in store, force ending it", "channelID", channelID)

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

func (p *Plugin) handleServeStandalone(w http.ResponseWriter, r *http.Request) {
	bundlePath, err := p.API.GetBundlePath()
	if err != nil {
		p.LogError(err.Error())
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	standalonePath := filepath.Join(bundlePath, "standalone/dist/")

	http.StripPrefix("/standalone/", http.FileServer(http.Dir(standalonePath))).ServeHTTP(w, r)
}

func (p *Plugin) permissionToEnableDisableChannel(userID, channelID string) (bool, *model.AppError) {
	// If TestMode (DefaultEnabled=false): only sysadmins can modify
	// If LiveMode (DefaultEnabled=true): channel, team, sysadmin, DM/GM participants can modify

	// Sysadmin has permission regardless
	if p.API.HasPermissionTo(userID, model.PermissionManageSystem) {
		return true, nil
	}

	// if DefaultEnabled=false, no-one else has permissions
	cfg := p.getConfiguration()
	if cfg.DefaultEnabled != nil && !*cfg.DefaultEnabled {
		return false, nil
	}

	// Must be live mode.

	// Channel admin?
	channel, appErr := p.API.GetChannel(channelID)
	if appErr != nil {
		return false, appErr
	}
	cm, appErr := p.API.GetChannelMember(channelID, userID)
	if appErr != nil {
		return false, appErr
	}
	if cm.SchemeAdmin {
		return true, nil
	}

	// Team admin?
	if p.API.HasPermissionToTeam(userID, channel.TeamId, model.PermissionManageTeam) {
		return true, nil
	}

	// DM/GM participant
	switch channel.Type {
	case model.ChannelTypeDirect, model.ChannelTypeGroup:
		if p.API.HasPermissionToChannel(userID, channelID, model.PermissionCreatePost) {
			return true, nil
		}
	}

	return false, nil
}

func (p *Plugin) handlePostChannel(w http.ResponseWriter, r *http.Request, channelID string) {
	var res httpResponse
	defer p.httpAudit("handlePostChannel", &res, w, r)

	userID := r.Header.Get("Mattermost-User-Id")

	if permission, appErr := p.permissionToEnableDisableChannel(userID, channelID); appErr != nil || !permission {
		res.Err = "Forbidden"
		if appErr != nil {
			res.Err = appErr.Error()
		}
		res.Code = http.StatusForbidden
		return
	}

	var info ChannelStateClient
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
	if info.Enabled != nil && *info.Enabled {
		evType = "channel_enable_voice"
	} else {
		evType = "channel_disable_voice"
	}

	p.publishWebSocketEvent(evType, nil, &model.WebsocketBroadcast{ChannelId: channelID, ReliableClusterSend: true})

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
	license := p.API.GetLicense()
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

	if strings.HasPrefix(r.URL.Path, "/standalone/") {
		p.handleServeStandalone(w, r)
		return
	}

	userID := r.Header.Get("Mattermost-User-Id")
	if userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	if strings.HasPrefix(r.URL.Path, "/bot") {
		p.handleBotAPI(w, r)
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

		if matches := jobsRE.FindStringSubmatch(r.URL.Path); len(matches) == 2 {
			p.handleGetJob(w, r, matches[1])
			return
		}

		if matches := jobsLogsRE.FindStringSubmatch(r.URL.Path); len(matches) == 2 {
			p.handleGetJobLogs(w, r, matches[1])
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

		if r.URL.Path == "/telemetry/track" {
			p.handleTrackEvent(w, r)
			return
		}

		if matches := callRecordingActionRE.FindStringSubmatch(r.URL.Path); len(matches) == 3 {
			p.handleRecordingAction(w, r, matches[1], matches[2])
			return
		}
	}

	http.NotFound(w, r)
}
