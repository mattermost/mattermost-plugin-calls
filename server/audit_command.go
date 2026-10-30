// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"bytes"
	"encoding/csv"
	"fmt"
	"sort"
	"strconv"
	"time"

	"github.com/mattermost/mattermost-plugin-calls/server/db"
	"github.com/mattermost/mattermost-plugin-calls/server/public"

	"github.com/mattermost/mattermost/server/public/model"
)

const (
	auditDateLayout = "2006-01-02"

	// auditMaxCalls bounds a single report so an unqualified --scope all cannot
	// scan and buffer the entire calls table. Results are ordered newest-first, so
	// hitting this returns the most recent calls and asks the user to narrow the
	// range. Also the primary guard on the generated file size.
	auditMaxCalls = 10000

	// auditUserBatchSize bounds each GetUsersByIds lookup when resolving usernames.
	auditUserBatchSize = 100
)

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
		Limit:       auditMaxCalls,
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

	// Results are ordered newest-first; hitting the cap means older calls were
	// omitted, so tell the user to narrow the range.
	truncated := len(calls) >= auditMaxCalls
	if truncated {
		p.LogWarn("calls audit: report truncated at row cap",
			"requestedBy", args.UserId, "cap", auditMaxCalls)
	}

	callIDs := make([]string, len(calls))
	for i, c := range calls {
		callIDs[i] = c.ID
	}
	participantTimes, err := p.store.GetParticipantsForCalls(callIDs, db.GetCallOpts{})
	if err != nil {
		return nil, fmt.Errorf("failed to query participant times: %w", err)
	}

	usernames := p.resolveUsernames(calls, participantTimes)

	csvData, err := p.buildAuditCSV(calls, participantTimes, usernames)
	if err != nil {
		return nil, fmt.Errorf("failed to build report: %w", err)
	}

	// Guard against producing a file the server will reject, so the user gets a
	// clear message instead of a generic upload failure.
	if maxFileSize := p.API.GetConfig().FileSettings.MaxFileSize; maxFileSize != nil && int64(len(csvData)) > *maxFileSize {
		return nil, fmt.Errorf("the report is too large to deliver (%d bytes); narrow the date range or use --scope channel", len(csvData))
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

	message := fmt.Sprintf("Here is your call audit report (%d call(s)).", len(calls))
	if truncated {
		message += fmt.Sprintf(" Only the most recent %d calls are included — narrow the date range to see older ones.", auditMaxCalls)
	}
	if _, appErr := p.API.CreatePost(&model.Post{
		UserId:    botID,
		ChannelId: dmChannel.Id,
		Message:   message,
		FileIds:   []string{fileInfo.Id},
	}); appErr != nil {
		return nil, fmt.Errorf("failed to post report: %s", appErr.Error())
	}

	// Audit who generated the report (reading audit data is itself auditable).
	p.LogInfo("calls audit: report generated",
		"event", "report_generated",
		"requestedBy", args.UserId,
		"scope", opts.scope,
		"fromStartAt", opts.fromStartAt,
		"toStartAt", opts.toStartAt,
		"callCount", len(calls),
		"truncated", truncated)

	return &model.CommandResponse{
		ResponseType: model.CommandResponseTypeEphemeral,
		Text:         fmt.Sprintf("Audit report for %d call(s) sent to your @calls direct message.", len(calls)),
	}, nil
}

// resolveUsernames batch-resolves every participant userID that appears in the
// report to a username, avoiding a per-user API call while building the CSV.
// A userID that can't be resolved (e.g. a permanently deleted user) maps to
// itself so the row still carries the ID.
func (p *Plugin) resolveUsernames(calls []*public.Call, participantTimes map[string]map[string]*public.CallParticipant) map[string]string {
	idSet := map[string]struct{}{}
	for _, call := range calls {
		for _, uid := range call.Participants {
			idSet[uid] = struct{}{}
		}
		for uid := range call.Props.Participants {
			idSet[uid] = struct{}{}
		}
	}
	for _, perCall := range participantTimes {
		for uid := range perCall {
			idSet[uid] = struct{}{}
		}
	}

	ids := make([]string, 0, len(idSet))
	for id := range idSet {
		ids = append(ids, id)
	}

	usernames := make(map[string]string, len(ids))
	for start := 0; start < len(ids); start += auditUserBatchSize {
		end := start + auditUserBatchSize
		if end > len(ids) {
			end = len(ids)
		}
		users, appErr := p.API.GetUsersByIds(ids[start:end])
		if appErr != nil {
			p.LogWarn("calls audit: failed to batch-resolve usernames", "err", appErr.Error())
			continue
		}
		for _, u := range users {
			usernames[u.Id] = u.Username
		}
	}
	// Fall back to the raw ID for anything unresolved.
	for _, id := range ids {
		if _, ok := usernames[id]; !ok {
			usernames[id] = id
		}
	}
	return usernames
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
// Columns are append-only so future additions don't break consumers. usernames
// maps participant userID -> display username (pre-resolved in batch).
func (p *Plugin) buildAuditCSV(calls []*public.Call, participantTimes map[string]map[string]*public.CallParticipant, usernames map[string]string) ([]byte, error) {
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

		callParticipants := participantTimes[call.ID]

		// The participant set is the union of two sources so no attendee is ever
		// dropped from the audit:
		//  - calls_participants (authoritative; the dedicated attendance table), and
		//  - the call's participant list — Call.Participants once the call has ended,
		//    or the live Props.Participants set while it is still active.
		participantSet := map[string]struct{}{}
		for uid := range callParticipants {
			participantSet[uid] = struct{}{}
		}
		for _, uid := range call.Participants {
			participantSet[uid] = struct{}{}
		}
		if call.EndAt == 0 {
			for uid := range call.Props.Participants {
				participantSet[uid] = struct{}{}
			}
		}
		participants := make([]string, 0, len(participantSet))
		for uid := range participantSet {
			participants = append(participants, uid)
		}
		sort.Strings(participants)

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
			username := usernames[uid]
			if username == "" {
				username = uid
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
