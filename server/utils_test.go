package main

import (
	"errors"
	"github.com/mattermost/mattermost/server/public/model"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
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

func TestPlugin_getPushProxyVersion(t *testing.T) {
	config := &model.Config{
		EmailSettings: model.EmailSettings{
			PushNotificationServer: model.NewString(model.MHPNS),
		},
	}

	tests := []struct {
		name    string
		config  *model.Config
		want    string
		handler func(http.ResponseWriter)
	}{
		{
			name:   "config nil",
			config: nil,
			want:   "",
		},
		{
			name: "no push server",
			config: &model.Config{
				EmailSettings: model.EmailSettings{
					PushNotificationServer: model.NewString(""),
				},
			},
			want: "",
		},
		{
			name: "nil push server",
			config: &model.Config{
				EmailSettings: model.EmailSettings{
					PushNotificationServer: nil,
				},
			},
			want: "",
		},
		{
			name:   "404 (old push proxy)",
			config: config,
			want:   "",
			handler: func(w http.ResponseWriter) {
				w.WriteHeader(http.StatusNotFound)
			},
		},
		{
			name:   "got a version",
			config: config,
			want:   "5.37.0",
			handler: func(w http.ResponseWriter) {
				_, _ = w.Write([]byte(`{"version": "5.37.0", "hash": "abcde3445"}`))
			},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
				assert.Equal(t, "/version", req.URL.String())
				if tt.handler != nil {
					tt.handler(w)
				}
			}))
			defer server.Close()

			// Do we have a push server url? if so, rewrite it for the test.
			// Why are we doing it this way? We want to test the variety of different states the config
			// can be in, as well as the responses the push proxy can give us.
			if tt.config != nil &&
				tt.config.EmailSettings.PushNotificationServer != nil &&
				*tt.config.EmailSettings.PushNotificationServer != "" {
				tt.config.EmailSettings.PushNotificationServer = model.NewString(server.URL)
			}
			ret, err := getPushProxyVersion(server.Client(), tt.config)

			assert.NoError(t, err)
			assert.Equalf(t, tt.want, ret, "test name: %s", tt.name)
		})
	}
}
