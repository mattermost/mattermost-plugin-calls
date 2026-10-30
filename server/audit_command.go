// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"bytes"
	"encoding/csv"
	"fmt"
	"strconv"
	"time"

	"github.com/mattermost/mattermost-plugin-calls/server/db"
	"github.com/mattermost/mattermost-plugin-calls/server/public"

	"github.com/mattermost/mattermost/server/public/model"
)

const auditDateLayout = "2006-01-02"

// csvSafe guards against CSV formula injection: spreadsheet apps (Excel, Sheets)
// execute a cell whose text begins with =, +, -, @, or a leading tab/CR as a
// formula. Prefixing such a value with a single quote neutralizes it while
// keeping the displayed text intact. Applied to user-controlled fields in the
// audit export.
func csvSafe(s string) string {
	if s == "" {
		return s
	}
	switch s[0] {
	case '=', '+', '-', '@', '\t', '\r':
		return "'" + s
	}
	return s
}

// auditOpts holds the parsed arguments for /call audit.
type auditOpts struct {
	// fromStartAt / toStartAt are ms-since-epoch bounds on the call start time
	// (0 means unbounded).
	fromStartAt int64
	toStartAt   int64
	// scope is "channel" (the current channel) or "all" (every channel the user
	// can see; all channels server-wide for admins).
	scope string
}

// parseAuditArgs parses the tokens after "/call audit". Supported forms:
//
//	/call audit [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--scope channel|all]
//
// "channel" / "all" may also be given as a bare positional in place of --scope.
func parseAuditArgs(fields []string) (auditOpts, error) {
	opts := auditOpts{scope: "channel"}

	rest := fields[2:]
	for i := 0; i < len(rest); i++ {
		switch rest[i] {
		case "--from", "--start":
			i++
			if i >= len(rest) {
				return opts, fmt.Errorf("%s requires a date (YYYY-MM-DD)", rest[i-1])
			}
			t, err := time.Parse(auditDateLayout, rest[i])
			if err != nil {
				return opts, fmt.Errorf("invalid from date %q, expected YYYY-MM-DD", rest[i])
			}
			opts.fromStartAt = t.UTC().UnixMilli()
		case "--to", "--end":
			i++
			if i >= len(rest) {
				return opts, fmt.Errorf("%s requires a date (YYYY-MM-DD)", rest[i-1])
			}
			t, err := time.Parse(auditDateLayout, rest[i])
			if err != nil {
				return opts, fmt.Errorf("invalid to date %q, expected YYYY-MM-DD", rest[i])
			}
			// Make --to inclusive of the whole day.
			opts.toStartAt = t.UTC().Add(24*time.Hour - time.Millisecond).UnixMilli()
		case "--scope":
			i++
			if i >= len(rest) {
				return opts, fmt.Errorf("--scope requires a value (channel or all)")
			}
			if rest[i] != "channel" && rest[i] != "all" {
				return opts, fmt.Errorf("invalid scope %q, expected channel or all", rest[i])
			}
			opts.scope = rest[i]
		case "channel", "all":
			opts.scope = rest[i]
		default:
			return opts, fmt.Errorf("unknown argument %q", rest[i])
		}
	}

	if opts.fromStartAt > 0 && opts.toStartAt > 0 && opts.fromStartAt > opts.toStartAt {
		return opts, fmt.Errorf("from date must not be after to date")
	}

	return opts, nil
}

func (p *Plugin) handleAuditCommand(args *model.CommandArgs, fields []string) (*model.CommandResponse, error) {
	opts, err := parseAuditArgs(fields)
	if err != nil {
		return nil, err
	}

	isAdmin := p.API.HasPermissionTo(args.UserId, model.PermissionManageSystem)

	filter := db.GetCallsFilter{
		FromStartAt: opts.fromStartAt,
		ToStartAt:   opts.toStartAt,
	}

	switch opts.scope {
	case "all":
		// Admins audit every channel (no ChannelID filter). Regular users are
		// limited to the channels they belong to.
		if !isAdmin {
			channelIDs, err := p.getUserChannelIDs(args.UserId)
			if err != nil {
				return nil, err
			}
			if len(channelIDs) == 0 {
				return nil, fmt.Errorf("you are not a member of any channels")
			}
			filter.ChannelIDs = channelIDs
		}
	default: // "channel"
		if !isAdmin && !p.API.HasPermissionToChannel(args.UserId, args.ChannelId, model.PermissionReadChannel) {
			return nil, fmt.Errorf("you don't have permission to read this channel")
		}
		filter.ChannelIDs = []string{args.ChannelId}
	}

	calls, err := p.store.GetCalls(filter, db.GetCallOpts{})
	if err != nil {
		return nil, fmt.Errorf("failed to query calls: %w", err)
	}

	if len(calls) == 0 {
		return &model.CommandResponse{
			ResponseType: model.CommandResponseTypeEphemeral,
			Text:         "No calls found for the requested range.",
		}, nil
	}

	callIDs := make([]string, len(calls))
	for i, c := range calls {
		callIDs[i] = c.ID
	}
	participantTimes, err := p.store.GetParticipantsForCalls(callIDs, db.GetCallOpts{})
	if err != nil {
		return nil, fmt.Errorf("failed to query participant times: %w", err)
	}

	csvData, err := p.buildAuditCSV(calls, participantTimes)
	if err != nil {
		return nil, fmt.Errorf("failed to build report: %w", err)
	}

	botID := p.getBotID()
	if botID == "" {
		return nil, fmt.Errorf("bot user not available")
	}

	dmChannel, appErr := p.API.GetDirectChannel(args.UserId, botID)
	if appErr != nil {
		return nil, fmt.Errorf("failed to open DM channel: %s", appErr.Error())
	}

	filename := fmt.Sprintf("call_audit_%s.csv", time.Now().UTC().Format("2006-01-02T15-04-05Z"))
	fileInfo, appErr := p.API.UploadFile(csvData, dmChannel.Id, filename)
	if appErr != nil {
		return nil, fmt.Errorf("failed to upload report: %s", appErr.Error())
	}

	if _, appErr := p.API.CreatePost(&model.Post{
		UserId:    botID,
		ChannelId: dmChannel.Id,
		Message:   fmt.Sprintf("Here is your call audit report (%d call(s)).", len(calls)),
		FileIds:   []string{fileInfo.Id},
	}); appErr != nil {
		return nil, fmt.Errorf("failed to post report: %s", appErr.Error())
	}

	return &model.CommandResponse{
		ResponseType: model.CommandResponseTypeEphemeral,
		Text:         fmt.Sprintf("Audit report for %d call(s) sent to your @calls direct message.", len(calls)),
	}, nil
}

// getUserChannelIDs returns every channel the user is a member of, across teams.
func (p *Plugin) getUserChannelIDs(userID string) ([]string, error) {
	var ids []string
	page := 0
	perPage := 200
	for {
		cms, appErr := p.API.GetChannelMembersForUser("", userID, page, perPage)
		if appErr != nil {
			return nil, fmt.Errorf("failed to get channel members: %s", appErr.Error())
		}
		for i := range cms {
			ids = append(ids, cms[i].ChannelId)
		}
		if len(cms) < perPage {
			break
		}
		page++
	}
	return ids, nil
}

// buildAuditCSV renders one row per participant per call: the attendance sheet.
// Columns are append-only so future additions (e.g. per-participant join/leave
// times) don't break consumers.
func (p *Plugin) buildAuditCSV(calls []*public.Call, participantTimes map[string]map[string]*public.CallParticipant) ([]byte, error) {
	var buf bytes.Buffer
	w := csv.NewWriter(&buf)

	header := []string{
		"call_id",
		"channel_id",
		"channel_name",
		"channel_display_name",
		"call_title",
		"call_start_utc",
		"call_end_utc",
		"call_duration_seconds",
		"participant_user_id",
		"participant_username",
		"participant_first_join_utc",
		"participant_last_leave_utc",
	}
	if err := w.Write(header); err != nil {
		return nil, err
	}

	utcOrEmpty := func(ms int64) string {
		if ms <= 0 {
			return ""
		}
		return time.UnixMilli(ms).UTC().Format(time.RFC3339)
	}

	channelCache := map[string]*model.Channel{}
	usernameCache := map[string]string{}

	for _, call := range calls {
		channelName, channelDisplay := "", ""
		if ch, ok := channelCache[call.ChannelID]; ok {
			if ch != nil {
				channelName, channelDisplay = ch.Name, ch.DisplayName
			}
		} else {
			ch, appErr := p.API.GetChannel(call.ChannelID)
			if appErr == nil {
				channelCache[call.ChannelID] = ch
				channelName, channelDisplay = ch.Name, ch.DisplayName
			} else {
				channelCache[call.ChannelID] = nil
			}
		}

		startUTC := time.UnixMilli(call.StartAt).UTC().Format(time.RFC3339)
		endUTC := ""
		durationSeconds := ""
		if call.EndAt > 0 {
			endUTC = time.UnixMilli(call.EndAt).UTC().Format(time.RFC3339)
			durationSeconds = strconv.FormatInt((call.EndAt-call.StartAt)/1000, 10)
		}

		// Call.Participants is populated when the call ends. For a still-active
		// call, fall back to the live set in Props.Participants.
		participants := []string(call.Participants)
		if len(participants) == 0 {
			for uid := range call.Props.Participants {
				participants = append(participants, uid)
			}
		}

		callParticipants := participantTimes[call.ID]

		writeRow := func(userID, username, firstJoinUTC, lastLeaveUTC string) error {
			// User-controlled fields (channel name/display, call title, username)
			// are sanitized against CSV formula injection; IDs and timestamps are
			// machine-generated and safe.
			return w.Write([]string{
				call.ID,
				call.ChannelID,
				csvSafe(channelName),
				csvSafe(channelDisplay),
				csvSafe(call.Title),
				startUTC,
				endUTC,
				durationSeconds,
				userID,
				csvSafe(username),
				firstJoinUTC,
				lastLeaveUTC,
			})
		}

		if len(participants) == 0 {
			// Keep the call in the report even if no participants were recorded.
			if err := writeRow("", "", "", ""); err != nil {
				return nil, err
			}
			continue
		}

		for _, uid := range participants {
			username, ok := usernameCache[uid]
			if !ok {
				if u, appErr := p.API.GetUser(uid); appErr == nil {
					username = u.Username
				} else {
					username = uid
				}
				usernameCache[uid] = username
			}

			firstJoinUTC, lastLeaveUTC := "", ""
			if cp := callParticipants[uid]; cp != nil {
				firstJoinUTC = utcOrEmpty(cp.FirstJoinAt)
				lastLeaveUTC = utcOrEmpty(cp.LastLeaveAt)
			}

			if err := writeRow(uid, username, firstJoinUTC, lastLeaveUTC); err != nil {
				return nil, err
			}
		}
	}

	w.Flush()
	if err := w.Error(); err != nil {
		return nil, err
	}

	return buf.Bytes(), nil
}
