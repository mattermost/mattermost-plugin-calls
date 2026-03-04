// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"time"

	"golang.org/x/time/rate"

	"github.com/mattermost/mattermost-plugin-calls/server/db"
	"github.com/mattermost/mattermost-plugin-calls/server/public"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/plugin"

	"github.com/gorilla/mux"

	"github.com/livekit/protocol/auth"
)

const requestBodyMaxSizeBytes = 1024 * 1024 // 1MB

func (p *Plugin) handleGetVersion(w http.ResponseWriter, _ *http.Request) {
	info := public.VersionInfo{
		Version: manifest.Version,
		Build:   buildHash,
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(info); err != nil {
		p.LogError(err.Error())
	}
}

func (p *Plugin) handleGetLiveKitToken(w http.ResponseWriter, r *http.Request) {
	var res httpResponse
	defer p.httpAudit("handleGetLiveKitToken", &res, w, r)

	userID := r.Header.Get("Mattermost-User-Id")
	channelID := r.URL.Query().Get("channel_id")

	if channelID == "" {
		res.Err = "missing channel_id parameter"
		res.Code = http.StatusBadRequest
		return
	}

	// Verify user has channel access
	if !p.API.HasPermissionToChannel(userID, channelID, model.PermissionCreatePost) {
		res.Err = "Forbidden"
		res.Code = http.StatusForbidden
		return
	}

	cfg := p.getConfiguration()

	// Generate LiveKit token
	at := auth.NewAccessToken(cfg.LiveKitAPIKey, cfg.LiveKitAPISecret)
	grant := &auth.VideoGrant{
		RoomJoin: true,
		Room:     channelID,
	}
	at.SetVideoGrant(grant).
		SetIdentity(userID).
		SetValidFor(24 * time.Hour)

	// Get user info for display name
	user, appErr := p.API.GetUser(userID)
	if appErr == nil {
		at.SetName(user.GetDisplayName(model.ShowNicknameFullName))
	}

	token, err := at.ToJWT()
	if err != nil {
		res.Err = fmt.Errorf("failed to generate token: %w", err).Error()
		res.Code = http.StatusInternalServerError
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(map[string]string{
		"token": token,
		"url":   cfg.LiveKitURL,
	}); err != nil {
		p.LogError(err.Error())
	}
}

// DEPRECATED in v1
func (p *Plugin) handleGetCallChannelState(w http.ResponseWriter, r *http.Request) {
	userID := r.Header.Get("Mattermost-User-Id")
	channelID := mux.Vars(r)["channel_id"]

	if !(p.isBotSession(r) || p.API.HasPermissionToChannel(userID, channelID, model.PermissionReadChannel)) {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}

	channel, err := p.store.GetCallsChannel(channelID, db.GetCallsChannelOpts{})
	if err != nil && !errors.Is(err, db.ErrNotFound) {
		p.LogError(err.Error())
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	if channel == nil {
		cfg := p.getConfiguration()
		channel = &public.CallsChannel{
			ChannelID: channelID,
			Enabled:   cfg.DefaultEnabled != nil && *cfg.DefaultEnabled,
		}
	}

	call, err := p.store.GetActiveCallByChannelID(channelID, db.GetCallOpts{})
	if err != nil && !errors.Is(err, db.ErrNotFound) {
		p.LogError(err.Error())
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// No call ongoing, we send the channel info only.
	if call == nil {
		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(channel); err != nil {
			p.LogError(err.Error())
		}
		return
	}

	cs, err := p.getCallStateFromCall(call, false)
	if err != nil {
		p.LogError(err.Error())
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	data := map[string]any{}
	data["channel_id"] = channel.ChannelID
	data["enabled"] = channel.Enabled
	data["call"] = cs.getClientState(p.getBotID(), userID)

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(data); err != nil {
		p.LogError(err.Error())
	}
}

func (p *Plugin) handleGetCallActive(w http.ResponseWriter, r *http.Request) {
	userID := r.Header.Get("Mattermost-User-Id")
	channelID := mux.Vars(r)["channel_id"]

	if !(p.isBotSession(r) || p.API.HasPermissionToChannel(userID, channelID, model.PermissionReadChannel)) {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}

	active, err := p.store.GetCallActive(channelID, db.GetCallOpts{FromWriter: true})
	if err != nil {
		p.LogError(err.Error())
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(map[string]bool{"active": active}); err != nil {
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

func (p *Plugin) handleGetAllCallChannelStates(w http.ResponseWriter, r *http.Request) {
	userID := r.Header.Get("Mattermost-User-Id")

	channelMembers := map[string]*model.ChannelMember{}
	var page int
	perPage := 200

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

	channels, err := p.store.GetAllCallsChannels(db.GetCallsChannelOpts{})
	if err != nil {
		p.LogError("failed to get all calls channels", "err", err.Error())
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	calls, err := p.store.GetAllActiveCalls(db.GetCallOpts{})
	if err != nil {
		p.LogError("failed to get all active calls", "err", err.Error())
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	callsMap := make(map[string]*public.Call)
	for _, call := range calls {
		if p.hasPermissionToChannel(channelMembers[call.ChannelID], model.PermissionReadChannel) {
			callsMap[call.ChannelID] = call
		}
	}

	data := []any{}
	for _, ch := range channels {
		if !p.hasPermissionToChannel(channelMembers[ch.ChannelID], model.PermissionReadChannel) {
			continue
		}

		channelData := map[string]any{
			"channel_id": ch.ChannelID,
			"enabled":    ch.Enabled,
		}
		if call := callsMap[ch.ChannelID]; call != nil {
			cs, err := p.getCallStateFromCall(call, false)
			if err != nil {
				p.LogError(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			channelData["call"] = cs.getClientState(p.getBotID(), userID)
			delete(callsMap, ch.ChannelID)
		}

		data = append(data, channelData)
	}

	for _, call := range callsMap {
		cs, err := p.getCallStateFromCall(call, false)
		if err != nil {
			p.LogError(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		data = append(data, map[string]any{
			"channel_id": call.ChannelID,
			"call":       cs.getClientState(p.getBotID(), userID),
		})
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(data); err != nil {
		p.LogError(err.Error())
	}
}

func (p *Plugin) handleDismissNotification(w http.ResponseWriter, r *http.Request) {
	var res httpResponse
	defer p.httpAudit("handleDismissNotification", &res, w, r)

	userID := r.Header.Get("Mattermost-User-Id")
	channelID := mux.Vars(r)["channel_id"]

	state, err := p.lockCallReturnState(channelID)
	if err != nil {
		res.Err = fmt.Errorf("failed to lock call: %w", err).Error()
		res.Code = http.StatusInternalServerError
		return
	}
	defer p.unlockCall(channelID)

	if state == nil {
		res.Err = "no call ongoing"
		res.Code = http.StatusBadRequest
		return
	}

	if state.Call.Props.DismissedNotification == nil {
		state.Call.Props.DismissedNotification = make(map[string]bool)
	}
	state.Call.Props.DismissedNotification[userID] = true

	if err := p.store.UpdateCall(&state.Call); err != nil {
		res.Err = fmt.Errorf("failed to update call: %w", err).Error()
		res.Code = http.StatusInternalServerError
		return
	}

	p.publishWebSocketEvent(wsEventUserDismissedNotification, map[string]interface{}{
		"userID": userID,
		"callID": state.Call.ID,
	}, &WebSocketBroadcast{UserID: userID, ReliableClusterSend: true})

	res.Code = http.StatusOK
	res.Msg = "success"
}

func (p *Plugin) permissionToEnableDisableChannel(userID, channelID string) (bool, *model.AppError) {
	if p.API.HasPermissionTo(userID, model.PermissionManageSystem) {
		return true, nil
	}

	cfg := p.getConfiguration()
	if cfg.DefaultEnabled != nil && !*cfg.DefaultEnabled {
		return false, nil
	}

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

	if p.API.HasPermissionToTeam(userID, channel.TeamId, model.PermissionManageTeam) {
		return true, nil
	}

	switch channel.Type {
	case model.ChannelTypeDirect, model.ChannelTypeGroup:
		if p.API.HasPermissionToChannel(userID, channelID, model.PermissionCreatePost) {
			return true, nil
		}
	}

	return false, nil
}

func (p *Plugin) handlePostCallsChannel(w http.ResponseWriter, r *http.Request) {
	var res httpResponse
	defer p.httpAudit("handlePostCallsChannel", &res, w, r)

	userID := r.Header.Get("Mattermost-User-Id")
	channelID := mux.Vars(r)["channel_id"]

	if permission, appErr := p.permissionToEnableDisableChannel(userID, channelID); appErr != nil || !permission {
		res.Err = "Forbidden"
		if appErr != nil {
			res.Err = appErr.Error()
		}
		res.Code = http.StatusForbidden
		return
	}

	var channel public.CallsChannel
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, requestBodyMaxSizeBytes)).Decode(&channel); err != nil {
		res.Err = err.Error()
		res.Code = http.StatusBadRequest
		return
	}

	storedChannel, err := p.store.GetCallsChannel(channelID, db.GetCallsChannelOpts{})
	if err != nil && !errors.Is(err, db.ErrNotFound) {
		res.Err = fmt.Errorf("failed to get calls channel: %w", err).Error()
		res.Code = http.StatusInternalServerError
		return
	}

	defer func() {
		if res.Err != "" {
			return
		}
		if err := json.NewEncoder(w).Encode(storedChannel); err != nil {
			p.LogError(err.Error())
		}
	}()

	if storedChannel == nil {
		storedChannel = &public.CallsChannel{
			ChannelID: channelID,
			Enabled:   channel.Enabled,
			Props:     channel.Props,
		}
		if err := p.store.CreateCallsChannel(storedChannel); err != nil {
			res.Err = fmt.Errorf("failed to create calls channel: %w", err).Error()
			res.Code = http.StatusInternalServerError
			return
		}
	} else {
		storedChannel.ChannelID = channelID
		storedChannel.Enabled = channel.Enabled
		storedChannel.Props = channel.Props
		if err := p.store.UpdateCallsChannel(storedChannel); err != nil {
			res.Err = fmt.Errorf("failed to update calls channel: %w", err).Error()
			res.Code = http.StatusInternalServerError
			return
		}
	}

	var evType string
	if storedChannel.Enabled {
		evType = "channel_enable_voice"
	} else {
		evType = "channel_disable_voice"
	}

	p.publishWebSocketEvent(evType, nil, &WebSocketBroadcast{ChannelID: channelID, ReliableClusterSend: true})
}

// handleConfig returns the client configuration
func (p *Plugin) handleConfig(w http.ResponseWriter, r *http.Request) error {
	userID := r.Header.Get("Mattermost-User-Id")
	isAdmin := p.API.HasPermissionTo(userID, model.PermissionManageSystem)

	w.Header().Set("Content-Type", "application/json")

	if isAdmin {
		if err := json.NewEncoder(w).Encode(p.getAdminClientConfig(p.getConfiguration())); err != nil {
			return fmt.Errorf("error encoding config: %w", err)
		}
	} else {
		if err := json.NewEncoder(w).Encode(p.getClientConfig(p.getConfiguration())); err != nil {
			return fmt.Errorf("error encoding config: %w", err)
		}
	}

	return nil
}

// handleEnv returns the config env overrides
func (p *Plugin) handleEnv(w http.ResponseWriter, r *http.Request) error {
	userID := r.Header.Get("Mattermost-User-Id")
	isAdmin := p.API.HasPermissionTo(userID, model.PermissionManageSystem)

	if !isAdmin {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return nil
	}

	w.Header().Set("Content-Type", "application/json")

	p.configurationLock.Lock()
	defer p.configurationLock.Unlock()
	if err := json.NewEncoder(w).Encode(p.configEnvOverrides); err != nil {
		return fmt.Errorf("error encoding config env overrides: %w", err)
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

func (p *Plugin) ServeHTTP(_ *plugin.Context, w http.ResponseWriter, r *http.Request) {
	defer func() {
		if r := recover(); r != nil {
			p.logPanic(r)
		}
	}()

	p.apiRouter.ServeHTTP(w, r)
}

func (p *Plugin) handleGetStats(w http.ResponseWriter) error {
	stats, err := p.store.GetCallsStats()
	if err != nil {
		return fmt.Errorf("failed to get stats from store: %w", err)
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(stats); err != nil {
		return fmt.Errorf("failed to marshal: %w", err)
	}

	return nil
}
