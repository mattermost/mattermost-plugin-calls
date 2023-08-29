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
	p.metrics.IncStoreOp("KVGet")
	data, appErr := p.API.KVGet(handlerKey)
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

func (p *Plugin) kvSetAtomic(key string, cb func(data []byte) ([]byte, error)) error {
	for {
		p.metrics.IncStoreOp("KVGet")
		storedData, appErr := p.API.KVGet(key)
		if appErr != nil {
			return fmt.Errorf("KVGet failed: %w", appErr)
		}

		toStoreData, err := cb(storedData)
		if err != nil {
			return fmt.Errorf("callback failed: %w", err)
		} else if toStoreData == nil {
			return nil
		}

		p.metrics.IncStoreOp("KVCompareAndSet")
		ok, appErr := p.API.KVCompareAndSet(key, storedData, toStoreData)
		if appErr != nil {
			return fmt.Errorf("KVCompareAndSet failed: %w", appErr)
		}

		if !ok {
			// pausing a little to avoid excessive lock contention
			time.Sleep(5 * time.Millisecond)
			continue
		}

		return nil
	}
}

func (p *Plugin) getNotificationNameFormat(userID string) string {
	config := p.API.GetConfig()
	if !*config.PrivacySettings.ShowFullName {
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
	clientAgent := fields[0] // safe to assume there's at least one
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
