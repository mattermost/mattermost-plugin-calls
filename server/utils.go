// Copyright (c) 2022-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"bytes"
	"compress/zlib"
	"errors"
	"fmt"
	"github.com/mattermost/mattermost/server/public/model"
	"io"
	"math"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/Masterminds/semver"
)

const (
	handlerKey              = "handler"
	handlerKeyCheckInterval = 5 * time.Second
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

func (p *Plugin) canSendPushNotifications(config *model.Config, license *model.License) error {
	if config == nil ||
		config.EmailSettings.SendPushNotifications == nil ||
		!*config.EmailSettings.SendPushNotifications {
		return nil
	}

	if config.EmailSettings.PushNotificationServer == nil {
		return nil
	}
	pushServer := *config.EmailSettings.PushNotificationServer
	if pushServer == model.MHPNS && (license == nil || !*license.Features.MHPNS) {
		return errors.New("push notifications have been disabled. Update your license or go to System Console > Environment > Push Notification Server to use a different server")
	}

	return nil
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

// NewClient creates a SimpleClient intended for one-off requests, like getPushProxyVersion.
// If we end up needing something more long term, we should consider storing it.
func NewClient() *http.Client {
	return &http.Client{
		Timeout: 10 * time.Second,
	}
}
