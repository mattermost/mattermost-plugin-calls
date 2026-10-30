// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"bytes"
	"encoding/csv"
	"testing"
	"time"

	"github.com/mattermost/mattermost-plugin-calls/server/public"

	pluginMocks "github.com/mattermost/mattermost-plugin-calls/server/mocks/github.com/mattermost/mattermost/server/public/plugin"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/plugin"

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

func TestBuildAuditCSV(t *testing.T) {
	chanID := model.NewId()
	mockAPI := &pluginMocks.MockAPI{}
	mockAPI.On("GetChannel", chanID).Return(&model.Channel{
		Id:          chanID,
		Name:        "town-square",
		DisplayName: "=Town Square", // triggers CSV-injection sanitization
	}, nil)
	p := Plugin{MattermostPlugin: plugin.MattermostPlugin{API: mockAPI}}

	u1, u2, u3 := model.NewId(), model.NewId(), model.NewId()

	// Ended call. u3 is present in the authoritative participant-times table but
	// NOT in Call.Participants — it must still appear (union behavior).
	endedCall := &public.Call{
		ID:           model.NewId(),
		ChannelID:    chanID,
		StartAt:      1_000_000,
		EndAt:        1_060_000, // +60s
		Title:        "Standup",
		Participants: []string{u1, u2},
	}
	// Ongoing call: Participants column empty; live set lives in Props.
	ongoingCall := &public.Call{
		ID:        model.NewId(),
		ChannelID: chanID,
		StartAt:   2_000_000,
		EndAt:     0,
		Props:     public.CallProps{Participants: map[string]struct{}{u1: {}}},
	}

	participantTimes := map[string]map[string]*public.CallParticipant{
		endedCall.ID: {
			u1: {FirstJoinAt: 1_000_000, LastLeaveAt: 1_050_000},
			u3: {FirstJoinAt: 1_010_000, LastLeaveAt: 1_060_000},
		},
		ongoingCall.ID: {
			u1: {FirstJoinAt: 2_000_000, LastLeaveAt: 0},
		},
	}
	usernames := map[string]string{u1: "alice", u2: "bob"} // u3 intentionally missing

	data, err := p.buildAuditCSV([]*public.Call{endedCall, ongoingCall}, participantTimes, usernames)
	require.NoError(t, err)

	records, err := csv.NewReader(bytes.NewReader(data)).ReadAll()
	require.NoError(t, err)

	header := records[0]
	require.Equal(t, "call_id", header[0])
	require.Equal(t, "participant_first_join_utc", header[10])
	require.Equal(t, "participant_last_leave_utc", header[11])

	// Index rows by (callID, userID).
	type key struct{ call, user string }
	rows := map[key][]string{}
	for _, r := range records[1:] {
		rows[key{r[0], r[8]}] = r
	}

	// Union: u1, u2 (from Participants) and u3 (from times-only) all present.
	require.Len(t, rows, 4) // endedCall: u1,u2,u3 ; ongoingCall: u1

	u1Row := rows[key{endedCall.ID, u1}]
	require.Equal(t, "alice", u1Row[9])
	require.Equal(t, "'=Town Square", u1Row[3]) // sanitized display name
	require.Equal(t, "Standup", u1Row[4])
	require.Equal(t, "60", u1Row[7]) // duration seconds
	require.NotEmpty(t, u1Row[5])    // start
	require.NotEmpty(t, u1Row[6])    // end
	require.NotEmpty(t, u1Row[10])   // first join
	require.NotEmpty(t, u1Row[11])   // last leave

	// u2 is in Participants but has no times row -> blank join/leave.
	u2Row := rows[key{endedCall.ID, u2}]
	require.Equal(t, "bob", u2Row[9])
	require.Empty(t, u2Row[10])
	require.Empty(t, u2Row[11])

	// u3 came from the times table only; username falls back to the ID.
	u3Row := rows[key{endedCall.ID, u3}]
	require.Equal(t, u3, u3Row[9])
	require.NotEmpty(t, u3Row[10])

	// Ongoing call: no end/duration; u1 present via Props fallback.
	ongRow := rows[key{ongoingCall.ID, u1}]
	require.Empty(t, ongRow[6]) // end blank
	require.Empty(t, ongRow[7]) // duration blank
}

func TestHandleAuditCommandPermissions(t *testing.T) {
	t.Run("non-admin without ReadChannel is denied (channel scope)", func(t *testing.T) {
		userID, chanID := model.NewId(), model.NewId()
		mockAPI := &pluginMocks.MockAPI{}
		mockAPI.On("HasPermissionTo", userID, model.PermissionManageSystem).Return(false)
		mockAPI.On("HasPermissionToChannel", userID, chanID, model.PermissionReadChannel).Return(false)
		p := Plugin{MattermostPlugin: plugin.MattermostPlugin{API: mockAPI}}

		resp, err := p.handleAuditCommand(&model.CommandArgs{UserId: userID, ChannelId: chanID}, []string{"/call", "audit"})
		require.Error(t, err)
		require.Nil(t, resp)
		require.Contains(t, err.Error(), "permission")
	})

	t.Run("non-admin with no channels is rejected (all scope)", func(t *testing.T) {
		userID := model.NewId()
		mockAPI := &pluginMocks.MockAPI{}
		mockAPI.On("HasPermissionTo", userID, model.PermissionManageSystem).Return(false)
		mockAPI.On("GetChannelMembersForUser", "", userID, 0, 200).Return([]*model.ChannelMember{}, nil)
		p := Plugin{MattermostPlugin: plugin.MattermostPlugin{API: mockAPI}}

		resp, err := p.handleAuditCommand(&model.CommandArgs{UserId: userID}, []string{"/call", "audit", "--scope", "all"})
		require.Error(t, err)
		require.Nil(t, resp)
		require.Contains(t, err.Error(), "not a member")
	})
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
