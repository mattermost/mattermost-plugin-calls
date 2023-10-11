// Copyright (c) 2022-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/plugin"
)

const (
	rootCommandTrigger         = "call"
	startCommandTrigger        = "start"
	joinCommandTrigger         = "join"
	leaveCommandTrigger        = "leave"
	linkCommandTrigger         = "link"
	experimentalCommandTrigger = "experimental"
	statsCommandTrigger        = "stats"
	endCommandTrigger          = "end"
	recordingCommandTrigger    = "recording"
	hostCommandTrigger         = "host"
)

var subCommands = []string{
	startCommandTrigger,
	joinCommandTrigger,
	leaveCommandTrigger,
	linkCommandTrigger,
	experimentalCommandTrigger,
	endCommandTrigger,
	statsCommandTrigger,
	recordingCommandTrigger,
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
	data.AddCommand(model.NewAutocompleteData(statsCommandTrigger, "", "Show client-generated statistics about the call."))
	data.AddCommand(model.NewAutocompleteData(endCommandTrigger, "", "End the call for everyone. All the participants will drop immediately."))

	experimentalCmdData := model.NewAutocompleteData(experimentalCommandTrigger, "", "Turn experimental features on or off.")
	experimentalCmdData.AddTextArgument("Available options: on, off", "", "on|off")
	data.AddCommand(experimentalCmdData)

	recordingCmdData := model.NewAutocompleteData(recordingCommandTrigger, "", "Manage calls recordings")
	recordingCmdData.AddTextArgument("Available options: start, stop", "", "start|stop")
	data.AddCommand(recordingCmdData)

	if p.licenseChecker.HostControlsAllowed() {
		subCommands = append(subCommands, hostCommandTrigger)
		hostCmdData := model.NewAutocompleteData(hostCommandTrigger, "", "Change the host (system admins only).")
		hostCmdData.AddTextArgument("@username", "", "@*")
		data.AddCommand(hostCmdData)
	}

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

func handleExperimentalCommand(fields []string) (*model.CommandResponse, error) {
	var msg string
	if len(fields) != 3 {
		return nil, fmt.Errorf("Invalid number of arguments provided")
	}
	if fields[2] == "on" {
		msg = "Experimental features were turned on"
	} else if fields[2] == "off" {
		msg = "Experimental features were turned off"
	}
	if msg == "" {
		return nil, fmt.Errorf("Invalid arguments provided")
	}
	return &model.CommandResponse{
		ResponseType: model.CommandResponseTypeEphemeral,
		Text:         msg,
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

func (p *Plugin) handleEndCallCommand() (*model.CommandResponse, error) {
	return &model.CommandResponse{}, nil
}

func (p *Plugin) handleRecordingCommand(fields []string) (*model.CommandResponse, error) {
	if len(fields) != 3 {
		return nil, fmt.Errorf("Invalid number of arguments provided")
	}

	if subCmd := fields[2]; subCmd != "start" && subCmd != "stop" {
		return nil, fmt.Errorf("Invalid subcommand %q", subCmd)
	}

	return &model.CommandResponse{}, nil
}

func (p *Plugin) handleHostCommand(args *model.CommandArgs, fields []string) (*model.CommandResponse, error) {
	if len(fields) != 3 {
		return nil, fmt.Errorf("Invalid number of arguments provided")
	}

	newHostUsername := strings.TrimPrefix(fields[2], "@")

	newHost, appErr := p.API.GetUserByUsername(newHostUsername)
	if appErr != nil {
		return nil, fmt.Errorf("Could not find user `%s`", newHostUsername)
	}

	if err := p.changeHost(args.UserId, args.ChannelId, newHost.Id); err != nil {
		return nil, err
	}

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

	if subCmd == linkCommandTrigger {
		resp, err := p.handleLinkCommand(args)
		if err != nil {
			return &model.CommandResponse{
				ResponseType: model.CommandResponseTypeEphemeral,
				Text:         fmt.Sprintf("Error: %s", err.Error()),
			}, nil
		}
		return resp, nil
	}

	if subCmd == experimentalCommandTrigger {
		resp, err := handleExperimentalCommand(fields)
		if err != nil {
			return &model.CommandResponse{
				ResponseType: model.CommandResponseTypeEphemeral,
				Text:         fmt.Sprintf("Error: %s", err.Error()),
			}, nil
		}
		return resp, nil
	}

	if subCmd == statsCommandTrigger {
		resp, err := handleStatsCommand(fields)
		if err != nil {
			return &model.CommandResponse{
				ResponseType: model.CommandResponseTypeEphemeral,
				Text:         fmt.Sprintf("Error: %s", err.Error()),
			}, nil
		}
		return resp, nil
	}

	if subCmd == endCommandTrigger {
		resp, err := p.handleEndCallCommand()
		if err != nil {
			return &model.CommandResponse{
				ResponseType: model.CommandResponseTypeEphemeral,
				Text:         fmt.Sprintf("Error: %s", err.Error()),
			}, nil
		}
		return resp, nil
	}

	if subCmd == recordingCommandTrigger {
		resp, err := p.handleRecordingCommand(fields)
		if err != nil {
			return &model.CommandResponse{
				ResponseType: model.CommandResponseTypeEphemeral,
				Text:         fmt.Sprintf("Error: %s", err.Error()),
			}, nil
		}
		return resp, nil
	}

	if subCmd == hostCommandTrigger && p.licenseChecker.HostControlsAllowed() {
		resp, err := p.handleHostCommand(args, fields)
		if err != nil {
			return &model.CommandResponse{
				ResponseType: model.CommandResponseTypeEphemeral,
				Text:         fmt.Sprintf("Error: %s", err.Error()),
			}, nil
		}
		return resp, nil
	}

	for _, cmd := range subCommands {
		if cmd == subCmd {
			return &model.CommandResponse{}, nil
		}
	}

	return &model.CommandResponse{
		ResponseType: model.CommandResponseTypeEphemeral,
		Text:         fmt.Sprintf("Invalid subcommand: " + subCmd),
	}, nil
}
