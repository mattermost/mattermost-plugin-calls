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
	p := Plugin{}
	channelNames := map[string]auditChannel{
		chanID: {name: "town-square", display: "=Town Square"}, // display triggers CSV-injection sanitization
	}

	u1, u2, u3 := model.NewId(), model.NewId(), model.NewId()
	phone := "+15551234567" // SIP callee: appears only in the times table, as a phone identity

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
			u1:    {IdentityType: public.IdentityTypeUser, Identity: u1, FirstJoinAt: 1_000_000, LastLeaveAt: 1_050_000},
			u3:    {IdentityType: public.IdentityTypeUser, Identity: u3, FirstJoinAt: 1_010_000, LastLeaveAt: 1_060_000},
			phone: {IdentityType: public.IdentityTypePhone, Identity: phone, FirstJoinAt: 1_005_000, LastLeaveAt: 1_060_000},
		},
		ongoingCall.ID: {
			u1: {IdentityType: public.IdentityTypeUser, Identity: u1, FirstJoinAt: 2_000_000, LastLeaveAt: 0},
		},
	}
	usernames := map[string]string{u1: "alice", u2: "bob"} // u3 intentionally missing

	data, err := p.buildAuditCSV([]*public.Call{endedCall, ongoingCall}, participantTimes, usernames, channelNames)
	require.NoError(t, err)

	records, err := csv.NewReader(bytes.NewReader(data)).ReadAll()
	require.NoError(t, err)

	header := records[0]
	require.Equal(t, "call_id", header[0])
	require.Equal(t, "participant_user_id", header[8])
	require.Equal(t, "participant_type", header[9])
	require.Equal(t, "participant_identity", header[10])
	require.Equal(t, "participant_username", header[11])
	require.Equal(t, "participant_first_join_utc", header[12])
	require.Equal(t, "participant_last_leave_utc", header[13])

	// Index rows by (callID, identity) — identity is unique per call across both
	// user IDs and phone numbers.
	type key struct{ call, identity string }
	rows := map[key][]string{}
	for _, r := range records[1:] {
		rows[key{r[0], r[10]}] = r
	}

	// Union: u1, u2 (from Participants), u3 and the phone callee (from times-only).
	require.Len(t, rows, 5) // endedCall: u1,u2,u3,phone ; ongoingCall: u1

	u1Row := rows[key{endedCall.ID, u1}]
	require.Equal(t, u1, u1Row[8]) // participant_user_id
	require.Equal(t, public.IdentityTypeUser, u1Row[9])
	require.Equal(t, u1, u1Row[10])             // identity
	require.Equal(t, "alice", u1Row[11])        // username
	require.Equal(t, "'=Town Square", u1Row[3]) // sanitized display name
	require.Equal(t, "Standup", u1Row[4])
	require.Equal(t, "60", u1Row[7]) // duration seconds
	require.NotEmpty(t, u1Row[5])    // start
	require.NotEmpty(t, u1Row[6])    // end
	require.NotEmpty(t, u1Row[12])   // first join
	require.NotEmpty(t, u1Row[13])   // last leave

	// u2 is in Participants but has no times row -> blank join/leave.
	u2Row := rows[key{endedCall.ID, u2}]
	require.Equal(t, "bob", u2Row[11])
	require.Empty(t, u2Row[12])
	require.Empty(t, u2Row[13])

	// u3 came from the times table only; username falls back to the ID.
	u3Row := rows[key{endedCall.ID, u3}]
	require.Equal(t, u3, u3Row[11])
	require.NotEmpty(t, u3Row[12])

	// Phone callee: blank user_id, type "phone", the number as both identity and
	// username. The leading "+" makes csvSafe prefix a "'" (formula-injection
	// guard), so the number appears in its sanitized form.
	safePhone := csvSafe(phone)
	phoneRow := rows[key{endedCall.ID, safePhone}]
	require.Empty(t, phoneRow[8], "phone rows have no Mattermost user id")
	require.Equal(t, public.IdentityTypePhone, phoneRow[9])
	require.Equal(t, safePhone, phoneRow[10])
	require.Equal(t, safePhone, phoneRow[11])
	require.NotEmpty(t, phoneRow[12]) // first join
	require.NotEmpty(t, phoneRow[13]) // last leave

	// Ongoing call: no end/duration; u1 present via Props fallback.
	ongRow := rows[key{ongoingCall.ID, u1}]
	require.Empty(t, ongRow[6]) // end blank
	require.Empty(t, ongRow[7]) // duration blank
}

func TestBuildScreenShareCSV(t *testing.T) {
	chanID := model.NewId()
	p := Plugin{}
	channelNames := map[string]auditChannel{
		chanID: {name: "town-square", display: "=Town Square"}, // display triggers CSV-injection sanitization
	}

	u1, u2 := model.NewId(), model.NewId()

	sharedCall := &public.Call{
		ID:        model.NewId(),
		ChannelID: chanID,
		StartAt:   1_000_000,
		EndAt:     1_060_000,
		Title:     "Standup",
	}
	// A call with no screen shares must be omitted from this file entirely.
	quietCall := &public.Call{ID: model.NewId(), ChannelID: chanID, StartAt: 2_000_000}

	screenShares := map[string][]*public.CallScreenShare{
		sharedCall.ID: {
			{UserID: u1, SessionID: model.NewId(), StartAt: 1_010_000, StopAt: 1_020_000},
			{UserID: u2, SessionID: model.NewId(), StartAt: 1_030_000, StopAt: 0}, // still open -> blank stop
		},
	}
	usernames := map[string]string{u1: "alice"} // u2 missing -> falls back to ID

	data, err := p.buildScreenShareCSV([]*public.Call{sharedCall, quietCall}, screenShares, usernames, channelNames)
	require.NoError(t, err)

	records, err := csv.NewReader(bytes.NewReader(data)).ReadAll()
	require.NoError(t, err)

	header := records[0]
	require.Equal(t, "screen_share_user_id", header[6])
	require.Equal(t, "screen_share_start_utc", header[8])
	require.Equal(t, "screen_share_stop_utc", header[9])

	// Only the two segments of sharedCall; quietCall is omitted.
	require.Len(t, records, 3)

	rows := map[string][]string{}
	for _, r := range records[1:] {
		rows[r[6]] = r // key by user id
	}

	u1Row := rows[u1]
	require.Equal(t, "alice", u1Row[7])
	require.Equal(t, "'=Town Square", u1Row[3]) // sanitized display name
	require.Equal(t, "Standup", u1Row[4])
	require.NotEmpty(t, u1Row[8]) // start
	require.NotEmpty(t, u1Row[9]) // stop

	u2Row := rows[u2]
	require.Equal(t, u2, u2Row[7]) // username falls back to ID
	require.NotEmpty(t, u2Row[8])  // start
	require.Empty(t, u2Row[9])     // still open -> blank stop
}

func TestResolveChannelNames(t *testing.T) {
	dmID, gmID, regID, failID := model.NewId(), model.NewId(), model.NewId(), model.NewId()
	botID, alice, bob := model.NewId(), model.NewId(), model.NewId()

	mockAPI := &pluginMocks.MockAPI{}
	mockAPI.On("GetChannel", dmID).Return(&model.Channel{Id: dmID, Name: "a__b", Type: model.ChannelTypeDirect}, nil)
	mockAPI.On("GetChannel", gmID).Return(&model.Channel{Id: gmID, Name: "gmhandle", DisplayName: "carol, dave", Type: model.ChannelTypeGroup}, nil)
	mockAPI.On("GetChannel", regID).Return(&model.Channel{Id: regID, Name: "town-square", DisplayName: "Town Square", Type: model.ChannelTypeOpen}, nil)
	mockAPI.On("GetChannel", failID).Return(nil, &model.AppError{Message: "boom"})

	// DM members returned unsorted and including the bot, which must be dropped.
	mockAPI.On("GetUsersInChannel", dmID, model.ChannelSortByUsername, 0, 100).Return([]*model.User{
		{Id: bob, Username: "bob"},
		{Id: botID, Username: "calls"},
		{Id: alice, Username: "alice"},
	}, nil)

	p := Plugin{MattermostPlugin: plugin.MattermostPlugin{API: mockAPI}}
	p.botID = botID

	calls := []*public.Call{
		{ID: model.NewId(), ChannelID: dmID},
		{ID: model.NewId(), ChannelID: gmID},
		{ID: model.NewId(), ChannelID: regID},
		{ID: model.NewId(), ChannelID: failID},
		{ID: model.NewId(), ChannelID: dmID}, // duplicate channel -> fetched once
	}

	got := p.resolveChannelNames(calls)

	require.Equal(t, "alice, bob", got[dmID].display, "DM gets a synthesized, sorted, bot-excluded member list")
	require.Equal(t, "a__b", got[dmID].name)
	require.Equal(t, "carol, dave", got[gmID].display, "GM display passes through untouched")
	require.Equal(t, "Town Square", got[regID].display, "regular channel display passes through")
	require.Equal(t, auditChannel{}, got[failID], "unresolvable channel maps to a blank entry")

	// Deduped: GetChannel called once per unique channel, GetUsersInChannel once for the DM.
	mockAPI.AssertNumberOfCalls(t, "GetChannel", 4)
	mockAPI.AssertNumberOfCalls(t, "GetUsersInChannel", 1)
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
