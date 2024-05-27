package main

import (
	"errors"
	"testing"

	"github.com/mattermost/mattermost-plugin-calls/server/public"

	"github.com/mattermost/mattermost/server/public/model"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

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

func TestTruncateString(t *testing.T) {
	tcs := []struct {
		name     string
		s        string
		len      int
		expected string
	}{
		{
			name: "empty string",
		},
		{
			name:     "short",
			s:        "short name",
			len:      16,
			expected: "short name",
		},
		{
			name:     "equal",
			s:        "short name",
			len:      10,
			expected: "short name",
		},
		{
			name:     "long",
			s:        "long name",
			len:      8,
			expected: "long nam…",
		},
		{
			name:     "unicode",
			s:        "ポケットモンスター",
			len:      4,
			expected: "ポケット…",
		},
	}

	for _, tc := range tcs {
		t.Run(tc.name, func(t *testing.T) {
			require.Equal(t, tc.expected, truncateString(tc.s, tc.len))
		})
	}
}

func TestPlugin_canSendPushNotifications(t *testing.T) {
	config := &model.Config{
		EmailSettings: model.EmailSettings{
			SendPushNotifications:  model.NewBool(true),
			PushNotificationServer: model.NewString(model.MHPNS),
		},
	}
	license := &model.License{
		Features: &model.Features{
			MHPNS: model.NewBool(true),
		},
	}
	tests := []struct {
		name    string
		config  *model.Config
		license *model.License
		want    error
	}{
		{
			name:    "no config",
			config:  nil,
			license: nil,
			want:    nil,
		},
		{
			name: "no push notification server",
			config: &model.Config{
				EmailSettings: model.EmailSettings{
					SendPushNotifications:  model.NewBool(true),
					PushNotificationServer: nil,
				}},
			license: nil,
			want:    nil,
		},
		{
			name: "push notification server blank",
			config: &model.Config{
				EmailSettings: model.EmailSettings{
					SendPushNotifications:  model.NewBool(true),
					PushNotificationServer: model.NewString(""),
				}},
			license: nil,
			want:    nil,
		},
		{
			name: "push notifications set to false",
			config: &model.Config{
				EmailSettings: model.EmailSettings{
					SendPushNotifications:  model.NewBool(false),
					PushNotificationServer: model.NewString(model.MHPNS),
				}},
			license: nil,
			want:    nil,
		},
		{
			name:    "no license",
			config:  config,
			license: nil,
			want:    errors.New("push notifications have been disabled. Update your license or go to System Console > Environment > Push Notification Server to use a different server"),
		},
		{
			name:   "no MHPNS in license",
			config: config,
			license: &model.License{
				Features: &model.Features{
					MHPNS: model.NewBool(false),
				},
			},
			want: errors.New("push notifications have been disabled. Update your license or go to System Console > Environment > Push Notification Server to use a different server"),
		},
		{
			name:    "allowed",
			config:  config,
			license: license,
			want:    nil,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			p := &Plugin{}
			assert.Equalf(t, tt.want, p.canSendPushNotifications(tt.config, tt.license), "test: %s", tt.name)
		})
	}
}

func TestGetUserIDsFromSessions(t *testing.T) {
	t.Run("empty", func(t *testing.T) {
		userIDs := getUserIDsFromSessions(nil)
		require.Empty(t, userIDs)

		userIDs = getUserIDsFromSessions(map[string]*public.CallSession{})
		require.Empty(t, userIDs)
	})

	t.Run("no duplicates", func(t *testing.T) {
		userIDs := getUserIDsFromSessions(map[string]*public.CallSession{
			"connUserA": {
				UserID: "userA",
			},
			"connUserB": {
				UserID: "userB",
			},
			"connUserC": {
				UserID: "userC",
			},
		})
		require.ElementsMatch(t, []string{
			"userA",
			"userB",
			"userC",
		}, userIDs)
	})

	t.Run("duplicates", func(t *testing.T) {
		userIDs := getUserIDsFromSessions(map[string]*public.CallSession{
			"connUserA": {
				UserID: "userA",
			},
			"connUserB": {
				UserID: "userB",
			},
			"conn2UserA": {
				UserID: "userA",
			},
			"connUserC": {
				UserID: "userC",
			},
			"conn2UserC": {
				UserID: "userC",
			},
			"conn3UserC": {
				UserID: "userC",
			},
		})
		require.ElementsMatch(t, []string{
			"userA",
			"userB",
			"userC",
		}, userIDs)
	})
}
