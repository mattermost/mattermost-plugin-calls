// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestCSVSafe(t *testing.T) {
	cases := map[string]string{
		"":                 "",
		"Town Square":      "Town Square",
		"general":          "general",
		"=cmd|' /c calc'!": "'=cmd|' /c calc'!",
		"+1234":            "'+1234",
		"-5":               "'-5",
		"@user":            "'@user",
		"\tTabbed":         "'\tTabbed",
		"normal=mid":       "normal=mid", // only a leading trigger char matters
	}
	for in, want := range cases {
		require.Equal(t, want, csvSafe(in), "input %q", in)
	}
}

func TestParseAuditArgs(t *testing.T) {
	// fields always starts with the root + subcommand, as ExecuteCommand passes it.
	base := []string{"/call", "audit"}

	mustMillis := func(date string) int64 {
		t.Helper()
		ts, err := time.Parse(auditDateLayout, date)
		require.NoError(t, err)
		return ts.UTC().UnixMilli()
	}

	t.Run("defaults to current channel scope", func(t *testing.T) {
		opts, err := parseAuditArgs(base)
		require.NoError(t, err)
		require.Equal(t, "channel", opts.scope)
		require.Zero(t, opts.fromStartAt)
		require.Zero(t, opts.toStartAt)
	})

	t.Run("flags for from, to, scope", func(t *testing.T) {
		opts, err := parseAuditArgs(append(base, "--from", "2026-01-01", "--to", "2026-01-31", "--scope", "all"))
		require.NoError(t, err)
		require.Equal(t, "all", opts.scope)
		require.Equal(t, mustMillis("2026-01-01"), opts.fromStartAt)
		// --to is inclusive of the whole day.
		require.Equal(t, mustMillis("2026-01-31")+int64(24*time.Hour/time.Millisecond)-1, opts.toStartAt)
	})

	t.Run("bare positional scope", func(t *testing.T) {
		opts, err := parseAuditArgs(append(base, "all"))
		require.NoError(t, err)
		require.Equal(t, "all", opts.scope)
	})

	t.Run("invalid date", func(t *testing.T) {
		_, err := parseAuditArgs(append(base, "--from", "01-01-2026"))
		require.Error(t, err)
	})

	t.Run("invalid scope", func(t *testing.T) {
		_, err := parseAuditArgs(append(base, "--scope", "everything"))
		require.Error(t, err)
	})

	t.Run("from after to is rejected", func(t *testing.T) {
		_, err := parseAuditArgs(append(base, "--from", "2026-02-01", "--to", "2026-01-01"))
		require.Error(t, err)
	})

	t.Run("missing flag value", func(t *testing.T) {
		_, err := parseAuditArgs(append(base, "--from"))
		require.Error(t, err)
	})

	t.Run("unknown argument", func(t *testing.T) {
		_, err := parseAuditArgs(append(base, "--bogus"))
		require.Error(t, err)
	})
}
