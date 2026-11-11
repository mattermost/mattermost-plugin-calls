// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"crypto/fips140"
	"crypto/hmac"
	"crypto/sha256"
	"os"
	"testing"

	"github.com/stretchr/testify/require"
)

func hmacSum(key []byte) []byte {
	mac := hmac.New(sha256.New, key)
	mac.Write([]byte("canary"))
	return mac.Sum(nil)
}

func TestFIPSEnforced(t *testing.T) {
	if os.Getenv("EXPECT_FIPS") != "true" {
		t.Skip("set EXPECT_FIPS=true to check FIPS enforcement")
	}

	require.True(t, fips140.Enabled())
	// FIPS requires HMAC keys of at least 112 bits (14 bytes).
	require.NotPanics(t, func() { hmacSum([]byte("fourteen-bytes")) })
	require.Panics(t, func() { hmacSum([]byte("short-key")) })
}
