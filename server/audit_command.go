// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"bytes"
	"encoding/csv"
	"fmt"
	"sort"
	"strconv"
	"strings"
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

	screenShares, err := p.store.GetScreenSharesForCalls(callIDs, db.GetCallOpts{})
	if err != nil {
		return nil, fmt.Errorf("failed to query screen shares: %w", err)
	}

	usernames := p.resolveUsernames(calls, participantTimes, screenShares)
	channelNames := p.resolveChannelNames(calls)

	csvData, err := p.buildAuditCSV(calls, participantTimes, usernames, channelNames)
	if err != nil {
		return nil, fmt.Errorf("failed to build report: %w", err)
	}

	screenShareCSV, err := p.buildScreenShareCSV(calls, screenShares, usernames, channelNames)
	if err != nil {
		return nil, fmt.Errorf("failed to build screen share report: %w", err)
	}

	// Guard against producing a file the server will reject, so the user gets a
	// clear message instead of a generic upload failure.
	if maxFileSize := p.API.GetConfig().FileSettings.MaxFileSize; maxFileSize != nil {
		if int64(len(csvData)) > *maxFileSize || int64(len(screenShareCSV)) > *maxFileSize {
			return nil, fmt.Errorf("the report is too large to deliver; narrow the date range or use --scope channel")
		}
	}

	botID := p.getBotID()
	if botID == "" {
		return nil, fmt.Errorf("bot user not available")
	}

	dmChannel, appErr := p.API.GetDirectChannel(args.UserId, botID)
	if appErr != nil {
		return nil, fmt.Errorf("failed to open DM channel: %s", appErr.Error())
	}

	stamp := time.Now().UTC().Format("2006-01-02T15-04-05Z")

	attendanceFile, appErr := p.API.UploadFile(csvData, dmChannel.Id, fmt.Sprintf("call_audit_%s.csv", stamp))
	if appErr != nil {
		return nil, fmt.Errorf("failed to upload report: %s", appErr.Error())
	}
	screenShareFile, appErr := p.API.UploadFile(screenShareCSV, dmChannel.Id, fmt.Sprintf("call_audit_screen_shares_%s.csv", stamp))
	if appErr != nil {
		return nil, fmt.Errorf("failed to upload screen share report: %s", appErr.Error())
	}

	message := fmt.Sprintf("Here is your call audit report (%d call(s)). The attendance file lists who was in each call with join/leave times; the screen-share file logs who shared their screen and when.", len(calls))
	if truncated {
		message += fmt.Sprintf(" Only the most recent %d calls are included — narrow the date range to see older ones.", auditMaxCalls)
	}
	if _, appErr := p.API.CreatePost(&model.Post{
		UserId:    botID,
		ChannelId: dmChannel.Id,
		Message:   message,
		FileIds:   []string{attendanceFile.Id, screenShareFile.Id},
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
func (p *Plugin) resolveUsernames(calls []*public.Call, participantTimes map[string]map[string]*public.CallParticipant, screenShares map[string][]*public.CallScreenShare) map[string]string {
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
	for _, shares := range screenShares {
		for _, ss := range shares {
			idSet[ss.UserID] = struct{}{}
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

// auditChannel holds the resolved name/display for a call's channel, used to fill
// the channel columns of both report CSVs.
type auditChannel struct {
	name    string
	display string
}

// resolveChannelNames resolves each call's channel to (name, display) once, so the
// two CSVs don't each hit the API for the same channel. DMs carry no stored
// DisplayName, so we synthesize one from the members' usernames, mirroring the
// comma-separated name GMs already have. A channel that can't be fetched maps to a
// blank entry so the row still carries its channel_id.
func (p *Plugin) resolveChannelNames(calls []*public.Call) map[string]auditChannel {
	out := map[string]auditChannel{}
	for _, call := range calls {
		if _, ok := out[call.ChannelID]; ok {
			continue
		}
		ch, appErr := p.API.GetChannel(call.ChannelID)
		if appErr != nil {
			out[call.ChannelID] = auditChannel{}
			continue
		}
		display := ch.DisplayName
		if ch.Type == model.ChannelTypeDirect {
			display = p.synthesizeDMName(call.ChannelID)
		}
		out[call.ChannelID] = auditChannel{name: ch.Name, display: display}
	}
	return out
}

// synthesizeDMName builds a readable name for a DM channel from its members'
// usernames (sorted, comma-separated), e.g. "alice, bob". DMs have no stored
// DisplayName, so without this the audit report would show only the channel ID.
func (p *Plugin) synthesizeDMName(channelID string) string {
	users, appErr := p.API.GetUsersInChannel(channelID, model.ChannelSortByUsername, 0, 100)
	if appErr != nil {
		p.LogWarn("calls audit: failed to resolve DM members", "channelID", channelID, "err", appErr.Error())
		return ""
	}
	botID := p.getBotID()
	names := make([]string, 0, len(users))
	for _, u := range users {
		if u.Id == botID { // defensive; a DM hosting a call is between two real users
			continue
		}
		names = append(names, u.Username)
	}
	sort.Strings(names)
	return strings.Join(names, ", ")
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
func (p *Plugin) buildAuditCSV(calls []*public.Call, participantTimes map[string]map[string]*public.CallParticipant, usernames map[string]string, channelNames map[string]auditChannel) ([]byte, error) {
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

	for _, call := range calls {
		cn := channelNames[call.ChannelID]
		channelName, channelDisplay := cn.name, cn.display

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

// buildScreenShareCSV renders one row per screen-share segment: who shared their
// screen in which call, and the start/stop times. Calls with no screen shares are
// omitted, so this file is purely the screen-share log. Columns are append-only.
// usernames maps userID -> display username (pre-resolved in batch, shared with
// the attendance report).
func (p *Plugin) buildScreenShareCSV(calls []*public.Call, screenShares map[string][]*public.CallScreenShare, usernames map[string]string, channelNames map[string]auditChannel) ([]byte, error) {
	var buf bytes.Buffer
	w := csv.NewWriter(&buf)

	header := []string{
		"call_id",
		"channel_id",
		"channel_name",
		"channel_display_name",
		"call_title",
		"call_start_utc",
		"screen_share_user_id",
		"screen_share_username",
		"screen_share_start_utc",
		"screen_share_stop_utc",
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

	for _, call := range calls {
		shares := screenShares[call.ID]
		if len(shares) == 0 {
			continue
		}

		cn := channelNames[call.ChannelID]
		channelName, channelDisplay := cn.name, cn.display

		startUTC := time.UnixMilli(call.StartAt).UTC().Format(time.RFC3339)

		for _, ss := range shares {
			username := usernames[ss.UserID]
			if username == "" {
				username = ss.UserID
			}

			// User-controlled fields (channel name/display, call title, username)
			// are sanitized against CSV formula injection; IDs and timestamps are
			// machine-generated and safe.
			if err := w.Write([]string{
				call.ID,
				call.ChannelID,
				csvSafe(channelName),
				csvSafe(channelDisplay),
				csvSafe(call.Title),
				startUTC,
				ss.UserID,
				csvSafe(username),
				utcOrEmpty(ss.StartAt),
				utcOrEmpty(ss.StopAt),
			}); err != nil {
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
