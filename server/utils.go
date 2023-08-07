// Copyright (c) 2022-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"bytes"
	"compress/zlib"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
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

func mapKeys[K comparable, V any](m map[K]V) []K {
	keys := make([]K, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	return keys
}
