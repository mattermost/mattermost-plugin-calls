package main

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func Test_isMobilePostGA(t *testing.T) {
	tests := []struct {
		name       string
		userAgent  string
		params     string
		wantMobile bool
		wantPostGA bool
	}{
		{
			name:       "pre-GA Android",
			userAgent:  "rnbeta/2.0.0.440 someother-agent/3.2.4",
			wantMobile: true,
			wantPostGA: false,
		},
		{
			name:       "pre-GA iOS",
			userAgent:  "Mattermost/2.0.0.440 someother-agent/3.2.4",
			wantMobile: true,
			wantPostGA: false,
		},
		{
			name:       "442 iOS",
			userAgent:  "Mattermost/2.0.0.441 someother-agent/3.2.4",
			wantMobile: true,
			wantPostGA: true,
		},
		{
			name:       "442 Android",
			userAgent:  "rnbeta/2.0.0.441 someother-agent/3.2.4",
			wantMobile: true,
			wantPostGA: true,
		},
		{
			name:       "443+",
			userAgent:  "someother-agent/3.2.4",
			params:     "?mobilev2=true",
			wantMobile: true,
			wantPostGA: true,
		},
		{
			name:       "no user agent",
			userAgent:  "",
			params:     "",
			wantMobile: false,
			wantPostGA: false,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			r := httptest.NewRequest(http.MethodGet, "/channels"+tt.params, nil)
			r.Header.Set("User-Agent", tt.userAgent)
			gotMobile, gotPostGA := isMobilePostGA(r)
			assert.Equal(t, tt.wantMobile, gotMobile)
			assert.Equal(t, tt.wantPostGA, gotPostGA)
		})
	}
}

func TestCheckMinVersion(t *testing.T) {
	tcs := []struct {
		name        string
		minVersion  string
		currVersion string
		err         string
	}{
		{
			name:        "empty minVersion",
			minVersion:  "",
			currVersion: "",
			err:         "failed to parse minVersion: Invalid Semantic Version",
		},
		{
			name:        "empty currVersion",
			minVersion:  "0.1.0",
			currVersion: "",
			err:         "failed to parse currVersion: Invalid Semantic Version",
		},
		{
			name:        "invalid minVersion",
			minVersion:  "not.a.version",
			currVersion: "not.a.version",
			err:         "failed to parse minVersion: Invalid Semantic Version",
		},
		{
			name:        "invalid currVersion",
			minVersion:  "0.1.0",
			currVersion: "not.a.version",
			err:         "failed to parse currVersion: Invalid Semantic Version",
		},
		{
			name:        "not supported, minor",
			minVersion:  "0.2.0",
			currVersion: "0.1.0",
			err:         "current version (0.1.0) is lower than minimum supported version (0.2.0)",
		},
		{
			name:        "not supported, patch",
			minVersion:  "0.2.1",
			currVersion: "0.2.0",
			err:         "current version (0.2.0) is lower than minimum supported version (0.2.1)",
		},
		{
			name:        "supported, equal",
			minVersion:  "0.2.1",
			currVersion: "0.2.1",
			err:         "",
		},
		{
			name:        "supported, greater",
			minVersion:  "0.2.1",
			currVersion: "0.2.2",
			err:         "",
		},
		{
			name:        "supported, minVersion prefix",
			minVersion:  "v0.2.1",
			currVersion: "0.2.2",
			err:         "",
		},
		{
			name:        "supported, currVersion prefix",
			minVersion:  "0.2.1",
			currVersion: "v0.2.2",
			err:         "",
		},
	}
	for _, tc := range tcs {
		t.Run(tc.name, func(t *testing.T) {
			err := checkMinVersion(tc.minVersion, tc.currVersion)
			if tc.err != "" {
				assert.EqualError(t, err, tc.err)
			} else {
				assert.NoError(t, err)
			}
		})
	}
}

func TestSanitizeFilename(t *testing.T) {
	tcs := []struct {
		name     string
		input    string
		expected string
	}{
		{
			name: "empty string",
		},
		{
			name:     "spaces",
			input:    "some file name with spaces.mp4",
			expected: "some_file_name_with_spaces.mp4",
		},
		{
			name:     "special chars",
			input:    "somefile*with??special/\\chars.mp4",
			expected: "somefile_with__special__chars.mp4",
		},
	}

	for _, tc := range tcs {
		t.Run(tc.name, func(t *testing.T) {
			require.Equal(t, tc.expected, sanitizeFilename(tc.input))
		})
	}
}
