package main

import (
	"github.com/stretchr/testify/assert"
	"net/http"
	"net/http/httptest"
	"testing"
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
