// Copyright (c) 2022-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"bytes"
	"compress/zlib"
	"fmt"
	"github.com/mattermost/mattermost/server/public/model"
	"io"
	"math"
	"net/http"
	"net/url"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/Masterminds/semver"
)

const (
	handlerKey              = "handler"
	handlerKeyCheckInterval = 5 * time.Second
	channelNameMaxLength    = 24
)

var (
	filenameSanitizationRE = regexp.MustCompile(`[\\:*?\"<>|\n\s/]`)
)

func (p *Plugin) getHandlerID() (string, error) {
	data, appErr := p.KVGet(handlerKey, false)
	if appErr != nil {
		return "", fmt.Errorf("failed to get handler id: %w", appErr)
	}
	return string(data), nil
}

func (p *Plugin) setHandlerID(nodeID string) error {
	p.metrics.IncStoreOp("KVSetWithExpiry")
	if appErr := p.API.KVSetWithExpiry(handlerKey, []byte(nodeID), int64(handlerKeyCheckInterval.Seconds()*2)); appErr != nil {
		return fmt.Errorf("failed to set handler id: %w", appErr)
	}
	return nil
}

func (p *Plugin) getNotificationNameFormat(userID string) string {
	config := p.API.GetConfig()
	if config == nil {
		p.LogError("failed to get config")
		return model.ShowUsername
	}

	if config.PrivacySettings.ShowFullName == nil || !*config.PrivacySettings.ShowFullName {
		return model.ShowUsername
	}

	if preferences, appErr := p.API.GetPreferencesForUser(userID); appErr == nil {
		for _, pref := range preferences {
			if pref.Category == model.PreferenceCategoryDisplaySettings && pref.Name == model.PreferenceNameNameFormat {
				return pref.Value
			}
		}
	}

	return *config.TeamSettings.TeammateNameDisplay
}

func getChannelNameForNotification(channel *model.Channel, sender *model.User, users []*model.User, nameFormat, excludeID string) string {
	switch channel.Type {
	case model.ChannelTypeDirect:
		return sender.GetDisplayNameWithPrefix(nameFormat, "@")
	case model.ChannelTypeGroup:
		var names []string
		for _, user := range users {
			if user.Id != excludeID {
				names = append(names, user.GetDisplayName(nameFormat))
			}
		}

		sort.Strings(names)

		return strings.Join(names, ", ")
	default:
		return channel.DisplayName
	}
}

func unpackSDPData(data []byte) ([]byte, error) {
	buf := bytes.NewBuffer(data)
	rd, err := zlib.NewReader(buf)
	if err != nil {
		return nil, fmt.Errorf("failed to create reader: %w", err)
	}
	unpacked, err := io.ReadAll(rd)
	if err != nil {
		return nil, fmt.Errorf("failed to read data: %w", err)
	}
	return unpacked, nil
}

func parseURL(u string) (string, string, string, error) {
	parsed, err := url.Parse(u)
	if err != nil {
		return "", "", "", fmt.Errorf("failed to parse URL: %w", err)
	}

	clientID := parsed.User.Username()
	authKey, _ := parsed.User.Password()
	parsed.User = nil

	return parsed.String(), clientID, authKey, nil
}

func secondsSinceTimestamp(ts int64) int64 {
	return int64(math.Round(time.Since(time.Unix(ts, 0)).Seconds()))
}

func isMobilePostGA(r *http.Request) (mobile, postGA bool) {
	queryParam := r.URL.Query().Get("mobilev2")
	if queryParam == "true" {
		return true, true
	}

	// Below here is to test two things: is this mobile pre-GA? Is mobile version 441
	// (a one-week period when we didn't have the above queryParam)
	// TODO: simplify this once we can stop supporting 441.
	//   https://mattermost.atlassian.net/browse/MM-48929
	userAgent := r.Header.Get("User-Agent")
	fields := strings.Fields(userAgent)
	if len(fields) == 0 {
		return false, false
	}

	clientAgent := fields[0]
	isMobile := strings.HasPrefix(clientAgent, "rnbeta") || strings.HasPrefix(clientAgent, "Mattermost")
	if !isMobile {
		return false, false
	}
	agent := strings.Split(clientAgent, "/")
	if len(agent) != 2 {
		return true, false
	}

	// We can't use a semver package, because we're not using semver correctly. So manually parse...
	version := strings.Split(agent[1], ".")
	if len(version) != 4 {
		return true, false
	}
	minor, err := strconv.Atoi(version[3])
	if err != nil {
		return true, false
	}
	return true, minor >= 441
}

func checkMinVersion(minVersion, currVersion string) error {
	minV, err := semver.NewVersion(minVersion)
	if err != nil {
		return fmt.Errorf("failed to parse minVersion: %w", err)
	}

	currV, err := semver.NewVersion(currVersion)
	if err != nil {
		return fmt.Errorf("failed to parse currVersion: %w", err)
	}

	if cmp := currV.Compare(minV); cmp < 0 {
		return fmt.Errorf("current version (%s) is lower than minimum supported version (%s)", currVersion, minVersion)
	}

	return nil
}

func mapKeys[K comparable, V any](m map[K]V) []K {
	keys := make([]K, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	return keys
}

func sanitizeFilename(name string) string {
	return filenameSanitizationRE.ReplaceAllString(name, "_")
}

func (p *Plugin) genFilenameForCall(channelID string) (filename string) {
	name := channelID
	filename = fmt.Sprintf("Call_%s_%s", name, time.Now().UTC().Format("2006-01-02_15-04-05"))

	channel, appErr := p.API.GetChannel(channelID)
	if appErr != nil {
		p.LogError("failed to get channel", "err", appErr.Error())
		return
	}

	if channel.Type == model.ChannelTypeOpen || channel.Type == model.ChannelTypePrivate {
		name = channel.DisplayName
	} else if channel.Type == model.ChannelTypeDirect || channel.Type == model.ChannelTypeGroup {
		users, appErr := p.API.GetUsersInChannel(channel.Id, model.ChannelSortByUsername, 0, 8)
		if appErr != nil {
			p.LogError("failed to get channel users", "err", appErr.Error())
			return
		}

		cfg := p.API.GetConfig()
		if cfg == nil {
			p.LogError("failed to get configuration")
			return
		}

		nameFormat := model.ShowUsername
		if cfg.PrivacySettings.ShowFullName != nil && *cfg.PrivacySettings.ShowFullName {
			nameFormat = model.ShowFullName
		}

		// We simply concatenate all the members display names separated by a dash.
		name = ""
		for i, u := range users {
			name += u.GetDisplayName(nameFormat)
			if i != len(users)-1 {
				name += "-"
			}
		}
	}

	// Truncating if too long (e.g. group channels)
	if len(name) > channelNameMaxLength {
		name = name[:channelNameMaxLength] + "…"
	}

	filename = sanitizeFilename(fmt.Sprintf("Call_%s_%s", strings.ReplaceAll(name, " ", "-"), time.Now().UTC().Format("2006-01-02_15-04-05")))

	return
}
