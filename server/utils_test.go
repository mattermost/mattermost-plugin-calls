package main

import (
	"testing"

	"github.com/stretchr/testify/assert"
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
