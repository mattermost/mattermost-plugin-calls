// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"crypto/fips140"
	"crypto/hmac"
	"crypto/sha256"
	"os"
	"regexp"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

var fipsProviderPath = regexp.MustCompile(`ossl-modules[^/]*/fips\.so$`)

func TestFIPSEnforced(t *testing.T) {
	if os.Getenv("EXPECT_FIPS") != "true" {
		t.Skip("set EXPECT_FIPS=true to check FIPS enforcement")
	}

	require.True(t, fips140.Enabled(), "Go FIPS 140 mode is not enabled")

	// fips140.Enabled is also true when the toolchain falls back to Go's own
	// FIPS module, so also check that OpenSSL loaded its FIPS provider.
	mac := hmac.New(sha256.New, []byte("load-the-crypto-backend"))
	_, err := mac.Write([]byte("canary"))
	require.NoError(t, err)
	mac.Sum(nil)

	maps, err := os.ReadFile("/proc/self/maps")
	require.NoError(t, err)
	for line := range strings.Lines(string(maps)) {
		fields := strings.Fields(line)
		if len(fields) >= 6 && fipsProviderPath.MatchString(fields[5]) {
			return
		}
	}
	require.Fail(t, "OpenSSL FIPS provider (ossl-modules/fips.so) is not loaded")
}
