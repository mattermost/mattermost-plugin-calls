// Copyright (c) 2022-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"regexp"
	"time"
)

var botChRE = regexp.MustCompile(`^\/bot\/channels\/([a-z0-9]+)$`)
var botUserImageRE = regexp.MustCompile(`^\/bot\/users\/([a-z0-9]+)\/image$`)

func (p *Plugin) getBotID() string {
	if p.botSession != nil {
		return p.botSession.UserId
	}
	return ""
}

func (p *Plugin) isBot(userID string) bool {
	if userID != "" && userID == p.getBotID() {
		return true
	}
	return false
}

func (p *Plugin) isBotSession(r *http.Request) bool {
	return p.isBot(r.Header.Get("Mattermost-User-Id"))
}

func (p *Plugin) handleBotGetChannel(w http.ResponseWriter, r *http.Request, channelID string) {
	channel, appErr := p.API.GetChannel(channelID)
	if appErr != nil {
		p.LogError(appErr.Error())
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(channel); err != nil {
		p.LogError(err.Error())
	}
}

func (p *Plugin) handleGetUserImage(w http.ResponseWriter, r *http.Request, userID string) {
	data, appErr := p.API.GetProfileImage(userID)
	if appErr != nil {
		p.LogError(appErr.Error())
		http.NotFound(w, r)
	}

	http.ServeContent(w, r, userID, time.Now(), bytes.NewReader(data))
}

func (p *Plugin) handleBotAPI(w http.ResponseWriter, r *http.Request) {
	if !p.licenseChecker.RecordingsAllowed() {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}

	if !p.isBotSession(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	if r.Method == http.MethodGet {
		if matches := botChRE.FindStringSubmatch(r.URL.Path); len(matches) == 2 {
			p.handleBotGetChannel(w, r, matches[1])
			return
		}

		if matches := botUserImageRE.FindStringSubmatch(r.URL.Path); len(matches) == 2 {
			p.handleGetUserImage(w, r, matches[1])
			return
		}
	}

	http.NotFound(w, r)
}
