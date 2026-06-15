// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"path/filepath"
	"strings"
	"time"

	"golang.org/x/time/rate"

	"github.com/mattermost/mattermost-plugin-calls/server/db"
	"github.com/mattermost/mattermost-plugin-calls/server/public"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/plugin"

	"github.com/gorilla/mux"
	"github.com/livekit/protocol/auth"
	"github.com/livekit/protocol/livekit"
	"github.com/livekit/protocol/webhook"
)

const requestBodyMaxSizeBytes = 1024 * 1024 // 1MB

// logsUploadMaxSizeBytes is larger than the client's MAX_ACCUMULATED_LOG_SIZE
// (1MB) to leave margin for JSON-escaping overhead: newlines, quotes and
// control chars in the log text inflate the encoded body beyond the raw log
// size, and the JSON wrapper fields add a little more on top.
const logsUploadMaxSizeBytes = 2 * 1024 * 1024 // 2MB

func (p *Plugin) handleGetVersion(w http.ResponseWriter, _ *http.Request) {
	p.mut.RLock()
	defer p.mut.RUnlock()

	info := public.VersionInfo{
		Version: manifest.Version,
		Build:   buildHash,
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(info); err != nil {
		p.LogError(err.Error())
	}
}

// DEPRECATED in v1
func (p *Plugin) handleGetCallChannelState(w http.ResponseWriter, r *http.Request) {
	userID := r.Header.Get("Mattermost-User-Id")
	channelID := mux.Vars(r)["channel_id"]

	// We should go through only if the user has permissions to the requested channel
	// or if the user is the Calls bot.
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

	// Here we need to keep backwards compatibility so we send both
	// channel info and current call state, as expected by our older clients.
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

	// We should go through only if the user has permissions to the requested channel
	// or if the user is the Calls bot.
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
		// only include calls user has access to
		if p.hasPermissionToChannel(channelMembers[call.ChannelID], model.PermissionReadChannel) {
			callsMap[call.ChannelID] = call
		}
	}

	data := []any{}
	// loop on channels to check membership/permissions
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

		// Here we need to keep backwards compatibility so we send both
		// channel info and current call state, as expected by our older clients.
		data = append(data, channelData)
	}

	// We also need to include any active calls that may not have an explicit entry in
	// calls_channels
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

	// For now, only send to the user that dismissed the notification. May change in the future.
	p.publishWebSocketEvent(wsEventUserDismissedNotification, map[string]interface{}{
		"userID": userID,
		"callID": state.Call.ID,
	}, &WebSocketBroadcast{UserID: userID, ReliableClusterSend: true})

	res.Code = http.StatusOK
	res.Msg = "success"
}

func (p *Plugin) handleServeStandalone(w http.ResponseWriter, r *http.Request) {
	// Referrer-based CSRF protection
	referrer := r.Header.Get("Referer")
	userAgent := r.UserAgent()

	// Allow desktop or recorder (which uses our custom recorder header), or E2E
	isDesktopApp := strings.Contains(userAgent, "Mattermost") && strings.Contains(userAgent, "Electron")
	hasRecorderHeader := r.Header.Get("X-Calls-Recorder") == "true"
	hasE2EHeader := r.Header.Get("X-Calls-E2E") == "true"
	needsReferrerCheck := !(isDesktopApp || hasRecorderHeader || hasE2EHeader)
	if needsReferrerCheck {
		if referrer != "" {
			// For web browsers, check referrer for CSRF protection
			referrerURL, err := url.Parse(referrer)
			if err != nil {
				p.LogWarn("Serve standalone, BLOCKED: Invalid referrer", "err", err.Error())
				http.Error(w, "Forbidden", http.StatusForbidden)
				return
			}

			if referrerURL.Host != r.Host {
				p.LogWarn("Serve standalone, BLOCKED: Cross-origin referrer", "from", referrerURL.Host, "to", r.Host)
				http.Error(w, "Forbidden", http.StatusForbidden)
				return
			}

			// Allow same-origin referrers
		} else {
			// No referrer - could be direct navigation (OK) or malicious site with referrer policy
			p.LogWarn("Serve standalone, BLOCKED: no referrer")
			http.Error(w, "Forbidden", http.StatusForbidden)
			return
		}
	}

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

func (p *Plugin) handleGetLiveKitToken(w http.ResponseWriter, r *http.Request) {
	var res httpResponse
	defer p.httpAudit("handleGetLiveKitToken", &res, w, r)

	requestingUserID := r.Header.Get("Mattermost-User-Id")
	requestingChannelID := r.URL.Query().Get("channel_id")
	if requestingChannelID == "" {
		res.Err = "channel_id is required"
		res.Code = http.StatusBadRequest
		return
	}

	requestingSessionID := r.URL.Query().Get("session_id")
	if requestingSessionID == "" {
		res.Err = "session_id is required"
		res.Code = http.StatusBadRequest
		return
	}

	// Require the requesting user to have read permissions on the requested channel.
	// The recording/transcribing bot is exempt: it's never a channel member, so it
	// can't satisfy this check. Its authorization is instead established below by
	// owning a valid call session tied to the active call, which it can only obtain
	// through the job-gated bot join.
	if requestingUserID != p.getBotID() &&
		!p.API.HasPermissionToChannel(requestingUserID, requestingChannelID, model.PermissionReadChannel) {
		res.Err = "Forbidden"
		res.Code = http.StatusForbidden
		return
	}

	// Require the session to belong to the requesting user to prevent unauthorized token minting.
	// Read from the writer: this is a security gate that immediately follows the join write
	// (especially the recorder bot's job-gated join), and a read-replica lag under load would
	// otherwise miss the just-written session and 403 a legitimate request.
	callSession, err := p.store.GetCallSession(requestingSessionID, db.GetCallSessionOpts{FromWriter: true})
	if err != nil && !errors.Is(err, db.ErrNotFound) {
		p.LogError("failed to get call session", "err", err.Error(), "session_id", requestingSessionID)
		res.Err = "Internal server error"
		res.Code = http.StatusInternalServerError
		return
	}
	if callSession == nil || callSession.UserID != requestingUserID {
		res.Err = "Forbidden"
		res.Code = http.StatusForbidden
		return
	}

	// Require the session to belong to the active call in the requested channel.
	// Read from the writer for the same reason as the session lookup above.
	activeCall, err := p.store.GetActiveCallByChannelID(requestingChannelID, db.GetCallOpts{FromWriter: true})
	if err != nil && !errors.Is(err, db.ErrNotFound) {
		p.LogError("failed to get active call", "err", err.Error(), "channel_id", requestingChannelID)
		res.Err = "Internal server error"
		res.Code = http.StatusInternalServerError
		return
	}
	if activeCall == nil || activeCall.ID != callSession.CallID {
		res.Err = "Forbidden"
		res.Code = http.StatusForbidden
		return
	}

	cfg := p.getConfiguration()
	lkURL := cfg.getLiveKitURL()
	if lkURL == "" || cfg.LiveKitAPIKey == "" || cfg.LiveKitAPISecret == "" {
		res.Err = "LiveKit is not configured"
		res.Code = http.StatusInternalServerError
		return
	}

	// Bot (recorder/transcriber) jobs may reach LiveKit at a different address than
	// browser clients do, so hand them the bot-specific signaling URL if configured.
	if requestingUserID == p.getBotID() {
		lkURL = cfg.getLiveKitURLForBot()
	}

	user, appErr := p.API.GetUser(requestingUserID)
	if appErr != nil {
		res.Err = appErr.Error()
		res.Code = http.StatusInternalServerError
		return
	}

	at := auth.NewAccessToken(cfg.LiveKitAPIKey, cfg.LiveKitAPISecret)
	grant := &auth.VideoGrant{
		RoomJoin: true,
		Room:     requestingChannelID,
	}
	if requestingUserID == p.getBotID() {
		// The recording/transcribing bot only consumes media — it never publishes
		// tracks or data, and never updates its own metadata (no raised hand).
		// Restrict its grant to subscribe-only so the bot token can't be used to
		// inject audio, video, or data into the call.
		grant.SetCanPublish(false)
		grant.SetCanPublishData(false)
		grant.SetCanSubscribe(true)
	} else {
		grant.SetCanUpdateOwnMetadata(true)
	}
	at.SetVideoGrant(grant).
		SetIdentity(composeLivekitIdentity(requestingUserID, requestingSessionID)).
		SetName(user.Id).
		SetValidFor(time.Hour)

	token, err := at.ToJWT()
	if err != nil {
		res.Err = fmt.Errorf("failed to generate LiveKit token: %w", err).Error()
		res.Code = http.StatusInternalServerError
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(map[string]string{
		"token": token,
		"url":   lkURL,
	}); err != nil {
		p.LogError("failed to encode LiveKit token response", "err", err.Error())
	}
}

// handleConfig returns the client configuration, and cloud license information
// that isn't exposed to clients yet on the webapp
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

// getAPILimiter returns the per-user plugin API rate limiter, creating it on
// first use. Static asset routes (/standalone/) are exempted upstream in the
// router middleware, so this limit only governs real API calls.
func (p *Plugin) getAPILimiter(userID string) *rate.Limiter {
	p.apiLimitersMut.RLock()
	limiter := p.apiLimiters[userID]
	p.apiLimitersMut.RUnlock()
	if limiter == nil {
		limiter = rate.NewLimiter(1, 10)
		p.apiLimitersMut.Lock()
		p.apiLimiters[userID] = limiter
		p.apiLimitersMut.Unlock()
	}
	return limiter
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

	// TODO (MM-58565): consider implementing some caching for heaviest queries.

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(stats); err != nil {
		return fmt.Errorf("failed to marshal: %w", err)
	}

	return nil
}

func (p *Plugin) handleLiveKitWebhook(w http.ResponseWriter, r *http.Request) {
	cfg := p.getConfiguration()
	if cfg.LiveKitAPIKey == "" || cfg.LiveKitAPISecret == "" {
		p.LogError("handleLiveKitWebhook: LiveKit not configured")
		http.Error(w, "LiveKit is not configured", http.StatusServiceUnavailable)
		return
	}

	event, err := webhook.ReceiveWebhookEvent(r, auth.NewSimpleKeyProvider(cfg.LiveKitAPIKey, cfg.LiveKitAPISecret))
	if err != nil {
		p.LogError("handleLiveKitWebhook: failed to verify webhook", "err", err.Error())
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}

	p.LogDebug("handleLiveKitWebhook: received event",
		"event", event.GetEvent(),
		"room", event.GetRoom().GetName())

	switch event.GetEvent() {
	case webhook.EventParticipantJoined:
		p.handleLiveKitSIPParticipantJoined(event)
	case webhook.EventParticipantLeft:
		p.handleLiveKitSIPParticipantLeft(event)
	case webhook.EventRoomStarted, webhook.EventRoomFinished:
		p.LogDebug("handleLiveKitWebhook: room lifecycle event (informational only)",
			"event", event.GetEvent(),
			"room", event.GetRoom().GetName())
	default:
		p.LogDebug("handleLiveKitWebhook: ignoring event", "event", event.GetEvent())
	}

	w.WriteHeader(http.StatusOK)
}

func (p *Plugin) handleLiveKitSIPParticipantJoined(event *livekit.WebhookEvent) {
	participant := event.GetParticipant()
	if participant == nil || participant.Kind != livekit.ParticipantInfo_SIP {
		return
	}

	channelID := event.GetRoom().GetName()
	if channelID == "" {
		p.LogError("handleLiveKitSIPParticipantJoined: empty room name")
		return
	}

	sid := participant.Sid
	identity := participant.Identity

	p.LogDebug("handleLiveKitSIPParticipantJoined: SIP participant joined",
		"channelID", channelID, "sid", sid, "identity", identity)

	state, err := p.lockCallReturnState(channelID)
	if err != nil {
		p.LogError("handleLiveKitSIPParticipantJoined: failed to lock call", "channelID", channelID, "err", err.Error())
		return
	}
	defer p.unlockCall(channelID)

	if state == nil {
		p.LogDebug("handleLiveKitSIPParticipantJoined: no active call", "channelID", channelID)
		return
	}

	if state.Call.EndAt > 0 {
		p.LogDebug("handleLiveKitSIPParticipantJoined: call has ended", "channelID", channelID)
		return
	}

	if _, exists := state.sessions[sid]; exists {
		p.LogDebug("handleLiveKitSIPParticipantJoined: SIP session already exists", "channelID", channelID, "sid", sid)
		return
	}

	session := &public.CallSession{
		ID:               sid,
		CallID:           state.Call.ID,
		UserID:           identity,
		JoinAt:           time.Now().UnixMilli(),
		IsSIPParticipant: true,
	}
	state.sessions[sid] = session

	if newHostID := state.getHostID(p.getBotID()); newHostID != state.Call.GetHostID() {
		state.Call.Props.Hosts = []string{newHostID}
		p.publishWebSocketEvent(wsEventCallHostChanged, map[string]interface{}{
			"hostID":  newHostID,
			"call_id": state.Call.ID,
		}, &WebSocketBroadcast{
			ChannelID:           channelID,
			ReliableClusterSend: true,
			UserIDs:             getUserIDsFromSessions(state.sessions),
		})
	}

	if err := p.store.CreateCallSession(session); err != nil {
		p.LogError("handleLiveKitSIPParticipantJoined: failed to create call session",
			"channelID", channelID, "err", err.Error())
		delete(state.sessions, sid)
		return
	}

	if err := p.store.UpdateCall(&state.Call); err != nil {
		p.LogError("handleLiveKitSIPParticipantJoined: failed to update call",
			"channelID", channelID, "err", err.Error())
	}

	p.publishWebSocketEvent(wsEventUserJoined, map[string]interface{}{
		"user_id":    identity,
		"session_id": sid,
	}, &WebSocketBroadcast{ChannelID: channelID, ReliableClusterSend: true})
}

func (p *Plugin) handleLiveKitSIPParticipantLeft(event *livekit.WebhookEvent) {
	participant := event.GetParticipant()
	if participant == nil || participant.Kind != livekit.ParticipantInfo_SIP {
		return
	}

	channelID := event.GetRoom().GetName()
	if channelID == "" {
		p.LogError("handleLiveKitSIPParticipantLeft: empty room name")
		return
	}

	sid := participant.Sid
	identity := participant.Identity

	p.LogDebug("handleLiveKitSIPParticipantLeft: SIP participant left",
		"channelID", channelID, "sid", sid, "identity", identity)

	state, err := p.lockCallReturnState(channelID)
	if err != nil {
		p.LogError("handleLiveKitSIPParticipantLeft: failed to lock call", "channelID", channelID, "err", err.Error())
		return
	}
	defer p.unlockCall(channelID)

	if state == nil {
		p.LogDebug("handleLiveKitSIPParticipantLeft: no active call", "channelID", channelID)
		return
	}

	if _, exists := state.sessions[sid]; !exists {
		p.LogDebug("handleLiveKitSIPParticipantLeft: SIP session not found (idempotent)", "channelID", channelID, "sid", sid)
		return
	}

	if err := p.store.DeleteCallSession(sid); err != nil {
		p.LogError("handleLiveKitSIPParticipantLeft: failed to delete call session",
			"channelID", channelID, "err", err.Error())
		return
	}
	delete(state.sessions, sid)

	if state.Call.GetHostID() == identity && len(state.sessions) > 0 {
		if newHostID := state.getHostID(p.getBotID()); newHostID != identity {
			if newHostID == "" {
				state.Call.Props.Hosts = nil
			} else {
				state.Call.Props.Hosts = []string{newHostID}
			}
			p.publishWebSocketEvent(wsEventCallHostChanged, map[string]interface{}{
				"hostID":  newHostID,
				"call_id": state.Call.ID,
			}, &WebSocketBroadcast{
				ChannelID:           channelID,
				ReliableClusterSend: true,
				UserIDs:             getUserIDsFromSessions(state.sessions),
			})
		}
	}

	if err := p.store.UpdateCall(&state.Call); err != nil {
		p.LogError("handleLiveKitSIPParticipantLeft: failed to update call",
			"channelID", channelID, "err", err.Error())
	}

	p.publishWebSocketEvent(wsEventUserLeft, map[string]interface{}{
		"user_id":    identity,
		"session_id": sid,
	}, &WebSocketBroadcast{ChannelID: channelID, ReliableClusterSend: true})
}

func (p *Plugin) handleUploadLogsToBot(w http.ResponseWriter, r *http.Request) {
	userID := r.Header.Get("Mattermost-User-Id")
	if userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var req struct {
		Logs      string `json:"logs"`
		ChannelID string `json:"channel_id"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, logsUploadMaxSizeBytes)).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if !model.IsValidId(req.ChannelID) {
		http.Error(w, "Invalid channel_id", http.StatusBadRequest)
		return
	}

	// Confirm the requester is a member of the channel they want the
	// confirmation posted to, then resolve the team server-side. The client is
	// not trusted to supply a team: a regular channel carries its own TeamId,
	// and DM/GM channels (which have none) fall back to any team the user
	// belongs to, since the permalink only needs a team the user can access.
	if _, appErr := p.API.GetChannelMember(req.ChannelID, userID); appErr != nil {
		http.Error(w, "Not a member of the channel", http.StatusForbidden)
		return
	}

	channel, appErr := p.API.GetChannel(req.ChannelID)
	if appErr != nil {
		http.Error(w, fmt.Sprintf("Failed to get channel: %s", appErr.Error()), http.StatusInternalServerError)
		return
	}

	teamID := channel.TeamId
	if teamID == "" {
		teams, appErr := p.API.GetTeamsForUser(userID)
		if appErr != nil {
			http.Error(w, fmt.Sprintf("Failed to get teams: %s", appErr.Error()), http.StatusInternalServerError)
			return
		}
		if len(teams) == 0 {
			http.Error(w, "User is not a member of any team", http.StatusForbidden)
			return
		}
		teamID = teams[0].Id
	}

	if p.botSession == nil {
		http.Error(w, "Bot user not available", http.StatusInternalServerError)
		return
	}
	botID := p.botSession.UserId

	dmChannel, appErr := p.API.GetDirectChannel(userID, botID)
	if appErr != nil {
		http.Error(w, fmt.Sprintf("Failed to get DM channel: %s", appErr.Error()), http.StatusInternalServerError)
		return
	}

	filename := fmt.Sprintf("call_logs_%s.txt", time.Now().UTC().Format("2006-01-02T15-04-05Z"))

	fileInfo, appErr := p.API.UploadFile([]byte(req.Logs), dmChannel.Id, filename)
	if appErr != nil {
		http.Error(w, fmt.Sprintf("Failed to upload file: %s", appErr.Error()), http.StatusInternalServerError)
		return
	}

	post, appErr := p.API.CreatePost(&model.Post{
		UserId:    botID,
		ChannelId: dmChannel.Id,
		FileIds:   []string{fileInfo.Id},
	})
	if appErr != nil {
		http.Error(w, fmt.Sprintf("Failed to create post: %s", appErr.Error()), http.StatusInternalServerError)
		return
	}

	team, appErr := p.API.GetTeam(teamID)
	if appErr != nil {
		http.Error(w, fmt.Sprintf("Failed to get team: %s", appErr.Error()), http.StatusInternalServerError)
		return
	}

	siteURL := p.API.GetConfig().ServiceSettings.SiteURL
	if siteURL == nil || *siteURL == "" {
		http.Error(w, "Site URL not configured", http.StatusInternalServerError)
		return
	}

	permalink := fmt.Sprintf("%s/%s/pl/%s", *siteURL, team.Name, post.Id)
	p.API.SendEphemeralPost(userID, &model.Post{
		ChannelId: req.ChannelID,
		Message:   fmt.Sprintf("Call logs uploaded — [view in your @calls DM](%s)", permalink),
	})

	w.Header().Set("Content-Type", "application/json")
	if _, err := w.Write([]byte("{}")); err != nil {
		p.LogError("failed to write logs upload response", "error", err.Error())
	}
}
