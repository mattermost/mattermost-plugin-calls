package main

import (
	"fmt"
	"strings"

	"github.com/mattermost/mattermost-server/v6/model"
	"github.com/mattermost/mattermost-server/v6/plugin"
)

const (
	rootCommandTrigger     = "call"
	joinCommandTrigger     = "join"
	leaveCommandTrigger    = "leave"
	linkCommandTrigger     = "link"
	announceCommandTrigger = "announce"
)

var subCommands = []string{joinCommandTrigger, leaveCommandTrigger, linkCommandTrigger, announceCommandTrigger}

func getAutocompleteData() *model.AutocompleteData {
	data := model.NewAutocompleteData(rootCommandTrigger, "[command]",
		"Available commands: "+strings.Join(subCommands, ","))
	data.AddCommand(model.NewAutocompleteData(joinCommandTrigger, "", "Joins or starts a call in the current channel"))
	data.AddCommand(model.NewAutocompleteData(leaveCommandTrigger, "", "Leaves a call in the current channel"))
	data.AddCommand(model.NewAutocompleteData(linkCommandTrigger, "", "Generates a link to join a call in the current channel"))

	announce := model.NewAutocompleteData(announceCommandTrigger, "[text]",
		"Make an announcement to all channels with currently active calls")
	announce.AddTextArgument("The announcement text.", "[text]", "")
	data.AddCommand(announce)

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
		AutocompleteData: getAutocompleteData(),
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

func (p *Plugin) handleAnnounceCommand(parameters []string) (*model.CommandResponse, error) {
	text := strings.Join(parameters, " ")
	return &model.CommandResponse{Text: fmt.Sprintf("Broadcast: %v", text)}, nil
}

func (p *Plugin) ExecuteCommand(c *plugin.Context, args *model.CommandArgs) (*model.CommandResponse, *model.AppError) {
	fields := strings.Fields(args.Command)

	rootCmd := strings.TrimPrefix(fields[0], "/")
	if rootCmd != rootCommandTrigger {
		return &model.CommandResponse{
			ResponseType: model.CommandResponseTypeEphemeral,
			Text:         fmt.Sprintf("Unknown command: %s", rootCmd),
		}, nil
	}

	var parameters []string
	subCmd := ""
	if len(fields) > 1 {
		subCmd = fields[1]
	}
	if len(fields) > 2 {
		parameters = fields[2:]
	}

	var err error
	var resp *model.CommandResponse
	switch subCmd {
	case joinCommandTrigger, leaveCommandTrigger:
		// these are handled by the frontend code
		resp = &model.CommandResponse{}
	case linkCommandTrigger:
		resp, err = p.handleLinkCommand(args)
	case announceCommandTrigger:
		resp, err = p.handleAnnounceCommand(parameters)
	default:
		resp = &model.CommandResponse{
			ResponseType: model.CommandResponseTypeEphemeral,
			Text:         "Invalid command",
		}
	}

	if err != nil {
		return &model.CommandResponse{
			ResponseType: model.CommandResponseTypeEphemeral,
			Text:         fmt.Sprintf("Error: %s", err.Error()),
		}, nil
	}
	return resp, nil
}
