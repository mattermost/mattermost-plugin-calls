// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"bytes"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"math/big"
	"strings"
	"time"

	"github.com/mattermost/mattermost-plugin-calls/server/db"
	"github.com/mattermost/mattermost-plugin-calls/server/public"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/plugin"
)

const (
	rootCommandTrigger      = "call"
	startCommandTrigger     = "start"
	joinCommandTrigger      = "join"
	leaveCommandTrigger     = "leave"
	linkCommandTrigger      = "link"
	guestLinkCommandTrigger = "guest-link"
	statsCommandTrigger     = "stats"
	endCommandTrigger       = "end"
	logsCommandTrigger      = "logs"
)

var subCommands = []string{
	startCommandTrigger,
	joinCommandTrigger,
	leaveCommandTrigger,
	linkCommandTrigger,
	guestLinkCommandTrigger,
	endCommandTrigger,
	statsCommandTrigger,
	logsCommandTrigger,
}

func (p *Plugin) getAutocompleteData() *model.AutocompleteData {
	data := model.NewAutocompleteData(rootCommandTrigger, "[command]",
		"Available commands: "+strings.Join(subCommands, ","))
	startCmdData := model.NewAutocompleteData(startCommandTrigger, "", "Starts a call in the current channel")
	startCmdData.AddTextArgument("[message]", "Root message for the call", "")
	data.AddCommand(startCmdData)
	data.AddCommand(model.NewAutocompleteData(joinCommandTrigger, "", "Joins a call in the current channel"))
	data.AddCommand(model.NewAutocompleteData(leaveCommandTrigger, "", "Leave a call in the current channel."))
	data.AddCommand(model.NewAutocompleteData(linkCommandTrigger, "", "Generate a link to join a call in the current channel."))
	guestLinkCmdData := model.NewAutocompleteData(guestLinkCommandTrigger, "[flags]", "Create or manage guest invite links for the current channel.")
	guestLinkCmdData.AddTextArgument("[--once] [--expires duration] [--no-start] [--sip] [--list] [--revoke id]", "Flags", "")
	data.AddCommand(guestLinkCmdData)
	data.AddCommand(model.NewAutocompleteData(statsCommandTrigger, "", "Show client-generated statistics about the call."))
	data.AddCommand(model.NewAutocompleteData(endCommandTrigger, "", "End the call for everyone. All the participants will drop immediately."))
	data.AddCommand(model.NewAutocompleteData(logsCommandTrigger, "", "Show client logs."))

	return data
}

func (p *Plugin) registerCommands() error {
	if err := p.API.RegisterCommand(&model.Command{
		Trigger:          rootCommandTrigger,
		DisplayName:      "Call",
		Description:      "Start, join or leave a call",
		AutoComplete:     true,
		AutoCompleteDesc: "Available commands: " + strings.Join(subCommands, ", "),
		AutoCompleteHint: "[command]",
		AutocompleteData: p.getAutocompleteData(),
	}); err != nil {
		return fmt.Errorf("failed to register %s command: %w", rootCommandTrigger, err)
	}
	return nil
}

func (p *Plugin) unregisterCommands() error {
	if err := p.API.UnregisterCommand("", rootCommandTrigger); err != nil {
		return fmt.Errorf("failed to unregister %s command: %w", rootCommandTrigger, err)
	}
	return nil
}

func (p *Plugin) handleLinkCommand(args *model.CommandArgs) (*model.CommandResponse, error) {
	channel, appErr := p.API.GetChannel(args.ChannelId)
	if appErr != nil {
		return nil, appErr
	}

	team, appErr := p.API.GetTeam(args.TeamId)
	if appErr != nil {
		return nil, appErr
	}

	link := fmt.Sprintf("%s/%s/channels/%s?join_call=true", args.SiteURL, team.Name, channel.Id)

	return &model.CommandResponse{
		ResponseType: model.CommandResponseTypeEphemeral,
		Text:         fmt.Sprintf("Call link: %s", link),
	}, nil
}

func handleStatsCommand(fields []string) (*model.CommandResponse, error) {
	if len(fields) != 3 {
		return nil, fmt.Errorf("Invalid number of arguments provided")
	}

	js, err := base64.StdEncoding.DecodeString(fields[2])
	if err != nil {
		return nil, fmt.Errorf("Failed to decode payload: %w", err)
	}

	if len(js) < 2 {
		return nil, fmt.Errorf("Invalid stats object")
	}

	if string(js) == "{}" {
		return nil, fmt.Errorf("Empty stats object")
	}

	var buf bytes.Buffer
	if err := json.Indent(&buf, js, "", " "); err != nil {
		return nil, fmt.Errorf("Failed to indent JSON: %w", err)
	}

	return &model.CommandResponse{
		ResponseType: model.CommandResponseTypeEphemeral,
		Text:         fmt.Sprintf("```json\n%s\n```", buf.String()),
	}, nil
}

func handleLogsCommand(fields []string) (*model.CommandResponse, error) {
	if len(fields) < 3 {
		return nil, fmt.Errorf("Empty logs")
	}

	logs, err := base64.StdEncoding.DecodeString(fields[2])
	if err != nil {
		return nil, fmt.Errorf("Failed to decode payload: %w", err)
	}

	return &model.CommandResponse{
		ResponseType: model.CommandResponseTypeEphemeral,
		Text:         fmt.Sprintf("```\n%s\n```", logs),
	}, nil
}

func (p *Plugin) handleEndCallCommand() (*model.CommandResponse, error) {
	return &model.CommandResponse{}, nil
}

func (p *Plugin) ExecuteCommand(_ *plugin.Context, args *model.CommandArgs) (*model.CommandResponse, *model.AppError) {
	fields := strings.Fields(args.Command)

	rootCmd := strings.TrimPrefix(fields[0], "/")
	if rootCmd != rootCommandTrigger {
		return &model.CommandResponse{
			ResponseType: model.CommandResponseTypeEphemeral,
			Text:         fmt.Sprintf("Unknown command: %s", rootCmd),
		}, nil
	}

	if len(fields) < 2 {
		return &model.CommandResponse{
			ResponseType: model.CommandResponseTypeEphemeral,
			Text:         "Invalid number of arguments provided",
		}, nil
	}

	subCmd := fields[1]

	buildCommandResponse := func(resp *model.CommandResponse, err error) (*model.CommandResponse, *model.AppError) {
		if err != nil {
			return &model.CommandResponse{
				ResponseType: model.CommandResponseTypeEphemeral,
				Text:         fmt.Sprintf("Error: %s", err.Error()),
			}, nil
		}
		return resp, nil
	}

	if subCmd == linkCommandTrigger {
		return buildCommandResponse(p.handleLinkCommand(args))
	}

	if subCmd == guestLinkCommandTrigger {
		return buildCommandResponse(p.handleGuestLinkCommand(args, fields[2:]))
	}

	if subCmd == statsCommandTrigger {
		return buildCommandResponse(handleStatsCommand(fields))
	}

	if subCmd == logsCommandTrigger {
		return buildCommandResponse(handleLogsCommand(fields))
	}

	if subCmd == endCommandTrigger {
		return buildCommandResponse(p.handleEndCallCommand())
	}

	for _, cmd := range subCommands {
		if cmd == subCmd {
			return &model.CommandResponse{}, nil
		}
	}

	return &model.CommandResponse{
		ResponseType: model.CommandResponseTypeEphemeral,
		Text:         "Invalid subcommand: " + subCmd,
	}, nil
}

func (p *Plugin) handleGuestLinkCommand(args *model.CommandArgs, flags []string) (*model.CommandResponse, error) {
	cfg := p.getConfiguration()
	if cfg.GuestAccessEnabled == nil || !*cfg.GuestAccessEnabled {
		return nil, fmt.Errorf("guest access is not enabled")
	}

	if !p.API.HasPermissionToChannel(args.UserId, args.ChannelId, model.PermissionCreatePost) {
		return nil, fmt.Errorf("you don't have permission to this channel")
	}

	// Parse flags.
	var (
		flagOnce    bool
		flagSIP     bool
		flagNoStart bool
		flagList    bool
		flagRevoke  string
		flagExpires string
	)
	for i := 0; i < len(flags); i++ {
		switch flags[i] {
		case "--once":
			flagOnce = true
		case "--sip":
			flagSIP = true
		case "--no-start":
			flagNoStart = true
		case "--list":
			flagList = true
		case "--revoke":
			if i+1 >= len(flags) {
				return nil, fmt.Errorf("--revoke requires a link ID")
			}
			i++
			flagRevoke = flags[i]
		case "--expires":
			if i+1 >= len(flags) {
				return nil, fmt.Errorf("--expires requires a duration (e.g., 24h, 1h30m)")
			}
			i++
			flagExpires = flags[i]
		default:
			return nil, fmt.Errorf("unknown flag: %s", flags[i])
		}
	}

	if flagList {
		return p.handleGuestLinkList(args)
	}

	if flagRevoke != "" {
		return p.handleGuestLinkRevoke(args, flagRevoke)
	}

	if flagSIP {
		return p.handleGuestLinkCreateSIP(args, flagOnce, flagNoStart, flagExpires)
	}

	return p.handleGuestLinkCreate(args, flagOnce, flagNoStart, flagExpires)
}

func (p *Plugin) handleGuestLinkCreate(args *model.CommandArgs, once, noStart bool, expiresStr string) (*model.CommandResponse, error) {
	cfg := p.getConfiguration()

	secret, err := generateSecret()
	if err != nil {
		return nil, err
	}

	now := time.Now().UnixMilli()

	var expiresAt int64
	if expiresStr != "" {
		dur, err := time.ParseDuration(expiresStr)
		if err != nil {
			return nil, fmt.Errorf("invalid duration %q: %w", expiresStr, err)
		}
		if dur <= 0 {
			return nil, fmt.Errorf("expiry duration must be positive")
		}
		expiresAt = now + dur.Milliseconds()
	} else if cfg.GuestLinkDefaultExpiryHours != nil && *cfg.GuestLinkDefaultExpiryHours > 0 {
		expiresAt = now + int64(*cfg.GuestLinkDefaultExpiryHours)*int64(time.Hour/time.Millisecond)
	}

	var maxUses int
	if once {
		maxUses = 1
	}

	allowStart := !noStart

	link := &public.GuestLink{
		ID:        model.NewId(),
		ChannelID: args.ChannelId,
		Type:      public.GuestLinkTypeURL,
		CreatedBy: args.UserId,
		CreateAt:  now,
		ExpiresAt: expiresAt,
		MaxUses:   maxUses,
		Secret:    secret,
		Props:     public.GuestLinkProps{"allow_start": allowStart},
	}

	if err := p.store.CreateGuestLink(link); err != nil {
		return nil, fmt.Errorf("failed to create guest link: %w", err)
	}

	siteURL := args.SiteURL
	guestURL := fmt.Sprintf("%s/plugins/%s/public/standalone/guest.html?token=%s", siteURL, manifest.Id, link.Secret)

	channel, appErr := p.API.GetChannel(args.ChannelId)
	channelName := args.ChannelId
	if appErr == nil {
		channelName = channel.DisplayName
	}

	text := fmt.Sprintf("Guest invite for #%s\n  Link: %s", channelName, guestURL)
	if once {
		text += "\n  (single use)"
	}
	if expiresAt > 0 {
		expiryTime := time.UnixMilli(expiresAt)
		text += fmt.Sprintf("\n  Expires: %s", expiryTime.Format(time.RFC822))
	}

	return &model.CommandResponse{
		ResponseType: model.CommandResponseTypeEphemeral,
		Text:         text,
	}, nil
}

func (p *Plugin) handleGuestLinkList(args *model.CommandArgs) (*model.CommandResponse, error) {
	links, err := p.store.GetActiveGuestLinksByChannel(args.ChannelId, db.GetGuestLinkOpts{})
	if err != nil {
		return nil, fmt.Errorf("failed to get guest links: %w", err)
	}

	if len(links) == 0 {
		return &model.CommandResponse{
			ResponseType: model.CommandResponseTypeEphemeral,
			Text:         "No active guest links for this channel.",
		}, nil
	}

	cfg := p.getConfiguration()
	siteURL := args.SiteURL
	var buf strings.Builder
	buf.WriteString(fmt.Sprintf("Active guest links (%d):\n", len(links)))

	for _, link := range links {
		buf.WriteString(fmt.Sprintf("\n**%s** (ID: `%s`)\n", link.Type, link.ID))
		if link.Type == public.GuestLinkTypeURL {
			buf.WriteString(fmt.Sprintf("  Link: %s/plugins/%s/public/standalone/guest.html?token=%s\n", siteURL, manifest.Id, link.Secret))
		}
		if link.Type == public.GuestLinkTypeSIP {
			buf.WriteString(fmt.Sprintf("  PIN: %s\n", formatPIN(link.Secret)))
			if cfg.LiveKitSIPPhoneNumber != "" {
				buf.WriteString(fmt.Sprintf("  Phone: %s\n", cfg.LiveKitSIPPhoneNumber))
			}
		}
		if link.MaxUses > 0 {
			buf.WriteString(fmt.Sprintf("  Uses: %d/%d\n", link.UseCount, link.MaxUses))
		} else {
			buf.WriteString(fmt.Sprintf("  Uses: %d (unlimited)\n", link.UseCount))
		}
		if link.ExpiresAt > 0 {
			expiryTime := time.UnixMilli(link.ExpiresAt)
			buf.WriteString(fmt.Sprintf("  Expires: %s\n", expiryTime.Format(time.RFC822)))
		}
	}

	return &model.CommandResponse{
		ResponseType: model.CommandResponseTypeEphemeral,
		Text:         buf.String(),
	}, nil
}

func (p *Plugin) handleGuestLinkRevoke(args *model.CommandArgs, linkID string) (*model.CommandResponse, error) {
	link, err := p.store.GetGuestLink(linkID, db.GetGuestLinkOpts{})
	if err != nil {
		if errors.Is(err, db.ErrNotFound) {
			return nil, fmt.Errorf("guest link not found: %s", linkID)
		}
		return nil, fmt.Errorf("failed to get guest link: %w", err)
	}

	if link.ChannelID != args.ChannelId {
		return nil, fmt.Errorf("guest link does not belong to this channel")
	}

	// Allow creator or system admin.
	if link.CreatedBy != args.UserId {
		if !p.API.HasPermissionTo(args.UserId, model.PermissionManageSystem) {
			return nil, fmt.Errorf("no permission to revoke this link")
		}
	}

	if err := p.store.DeleteGuestLink(linkID); err != nil {
		return nil, fmt.Errorf("failed to revoke guest link: %w", err)
	}

	// If this is a SIP link with a dispatch rule, delete it from LiveKit.
	if link.Type == public.GuestLinkTypeSIP && link.DispatchRuleID != nil && *link.DispatchRuleID != "" {
		go p.deleteSIPDispatchRuleByID(*link.DispatchRuleID)
	}

	return &model.CommandResponse{
		ResponseType: model.CommandResponseTypeEphemeral,
		Text:         fmt.Sprintf("Guest link `%s` has been revoked.", linkID),
	}, nil
}

// generatePIN generates a numeric PIN of the specified length.
func generatePIN(length int) (string, error) {
	if length <= 0 {
		length = 9
	}
	digits := make([]byte, length)
	for i := range digits {
		n, err := rand.Int(rand.Reader, big.NewInt(10))
		if err != nil {
			return "", fmt.Errorf("failed to generate PIN: %w", err)
		}
		digits[i] = '0' + byte(n.Int64())
	}
	return string(digits), nil
}

func (p *Plugin) handleGuestLinkCreateSIP(args *model.CommandArgs, once, noStart bool, expiresStr string) (*model.CommandResponse, error) {
	cfg := p.getConfiguration()

	if cfg.LiveKitSIPTrunkID == "" {
		return nil, fmt.Errorf("no SIP trunk configured. Set the SIP Trunk ID in admin console.")
	}

	// For permanent (non-single-use) SIP invites, enforce singleton per channel.
	if !once {
		existing, err := p.store.GetActiveSIPGuestLinkByChannel(args.ChannelId, db.GetGuestLinkOpts{FromWriter: true})
		if err == nil && existing != nil {
			// Return the existing invite (idempotent).
			pin := existing.Secret
			formattedPIN := formatPIN(pin)

			text := fmt.Sprintf("SIP dial-in already configured for this channel\n"+
				"  PIN: %s\n  Link ID: `%s`", formattedPIN, existing.ID)
			if cfg.LiveKitSIPPhoneNumber != "" {
				text = fmt.Sprintf("SIP dial-in already configured for this channel\n"+
					"  Phone: %s\n  PIN: %s\n  Link ID: `%s`",
					cfg.LiveKitSIPPhoneNumber, formattedPIN, existing.ID)
			}
			return &model.CommandResponse{
				ResponseType: model.CommandResponseTypeEphemeral,
				Text:         text,
			}, nil
		}
	}

	pinLength := 9
	if cfg.SIPPINLength != nil && *cfg.SIPPINLength >= 4 && *cfg.SIPPINLength <= 16 {
		pinLength = *cfg.SIPPINLength
	}

	pin, err := generatePIN(pinLength)
	if err != nil {
		return nil, err
	}

	now := time.Now().UnixMilli()

	var expiresAt int64
	if expiresStr != "" {
		dur, err := time.ParseDuration(expiresStr)
		if err != nil {
			return nil, fmt.Errorf("invalid duration %q: %w", expiresStr, err)
		}
		if dur <= 0 {
			return nil, fmt.Errorf("expiry duration must be positive")
		}
		expiresAt = now + dur.Milliseconds()
	}

	var maxUses int
	if once {
		maxUses = 1
	}

	allowStart := !noStart
	trunkID := cfg.LiveKitSIPTrunkID

	link := &public.GuestLink{
		ID:        model.NewId(),
		ChannelID: args.ChannelId,
		Type:      public.GuestLinkTypeSIP,
		CreatedBy: args.UserId,
		CreateAt:  now,
		ExpiresAt: expiresAt,
		MaxUses:   maxUses,
		Secret:    pin,
		TrunkID:   &trunkID,
		Props:     public.GuestLinkProps{"allow_start": allowStart},
	}

	if err := p.store.CreateGuestLink(link); err != nil {
		return nil, fmt.Errorf("failed to create SIP guest link: %w", err)
	}

	// Create a persistent LiveKit dispatch rule for this PIN.
	ruleID, err := p.createPersistentSIPDispatchRule(args.ChannelId, pin, trunkID)
	if err != nil {
		// Clean up the link if dispatch rule creation fails.
		_ = p.store.DeleteGuestLink(link.ID)
		return nil, fmt.Errorf("failed to create SIP dispatch rule: %w", err)
	}

	// Store the dispatch rule ID on the link.
	link.DispatchRuleID = &ruleID
	// Update via direct SQL since we don't have an UpdateGuestLink method for this field.
	// For now, we'll store it and log it.
	p.LogDebug("created SIP guest link with dispatch rule",
		"linkID", link.ID, "ruleID", ruleID, "channelID", args.ChannelId, "pin", pin)

	formattedPIN := formatPIN(pin)

	channel, appErr := p.API.GetChannel(args.ChannelId)
	channelName := args.ChannelId
	if appErr == nil {
		channelName = channel.DisplayName
	}

	text := fmt.Sprintf("SIP dial-in enabled for #%s\n  PIN: %s\n  Link ID: `%s`",
		channelName, formattedPIN, link.ID)
	if cfg.LiveKitSIPPhoneNumber != "" {
		text = fmt.Sprintf("SIP dial-in enabled for #%s\n  Phone: %s\n  PIN: %s\n  Link ID: `%s`",
			channelName, cfg.LiveKitSIPPhoneNumber, formattedPIN, link.ID)
	}
	if once {
		text += "\n  (single use)"
	}
	if expiresAt > 0 {
		expiryTime := time.UnixMilli(expiresAt)
		text += fmt.Sprintf("\n  Expires: %s", expiryTime.Format(time.RFC822))
	}

	return &model.CommandResponse{
		ResponseType: model.CommandResponseTypeEphemeral,
		Text:         text,
	}, nil
}

// formatPIN formats a PIN with dashes for readability.
// Groups of 3 digits from the front, with the final group being 3, 4, or 5 digits.
// Examples: "1234" -> "1234", "123456" -> "123-456", "1234567" -> "123-4567",
// "12345678" -> "123-45678", "123456789" -> "123-456-789".
func formatPIN(pin string) string {
	n := len(pin)
	if n <= 5 {
		return pin
	}

	// The final group absorbs the remainder so it's 3, 4, or 5 digits.
	var lastGroupSize int
	switch n % 3 {
	case 0:
		lastGroupSize = 3
	case 1:
		lastGroupSize = 4
	case 2:
		lastGroupSize = 5
	}

	leadingLen := n - lastGroupSize
	var parts []string
	for i := 0; i < leadingLen; i += 3 {
		parts = append(parts, pin[i:i+3])
	}
	parts = append(parts, pin[leadingLen:])
	return strings.Join(parts, "-")
}
