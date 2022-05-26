package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/mattermost/mattermost-server/v6/model"
	"github.com/mattermost/mattermost-server/v6/plugin"
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
)

var subCommands = []string{startCommandTrigger, joinCommandTrigger, leaveCommandTrigger, linkCommandTrigger, experimentalCommandTrigger, endCommandTrigger, statsCommandTrigger}

func getAutocompleteData() *model.AutocompleteData {
	data := model.NewAutocompleteData(rootCommandTrigger, "[command]",
		"Available commands: "+strings.Join(subCommands, ","))
	startCmdData := model.NewAutocompleteData(startCommandTrigger, "", "Starts a call in the current channel")
	startCmdData.AddTextArgument("[message]", "Root message for the call", "")
	data.AddCommand(startCmdData)
	data.AddCommand(model.NewAutocompleteData(joinCommandTrigger, "", "Joins a call in the current channel"))
	data.AddCommand(model.NewAutocompleteData(leaveCommandTrigger, "", "Leaves a call in the current channel"))
	data.AddCommand(model.NewAutocompleteData(linkCommandTrigger, "", "Generates a link to join a call in the current channel"))
	data.AddCommand(model.NewAutocompleteData(statsCommandTrigger, "", "Shows some client-generated statistics about the call"))
	data.AddCommand(model.NewAutocompleteData(endCommandTrigger, "", "End the call for everyone. All the participants will drop immediately"))

	experimentalCmdData := model.NewAutocompleteData(experimentalCommandTrigger, "", "Turns on/off experimental features")
	experimentalCmdData.AddTextArgument("Available options: on, off", "", "on|off")
	data.AddCommand(experimentalCmdData)
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

	if len(fields[2]) < 2 {
		return nil, fmt.Errorf("Invalid stats object")
	}

	js := fields[2][1 : len(fields[2])-1]

	if js == "{}" {
		return nil, fmt.Errorf("Empty stats object")
	}

	var buf bytes.Buffer
	if err := json.Indent(&buf, []byte(js), "", " "); err != nil {
		return nil, fmt.Errorf("Failed to indent JSON: %w", err)
	}

	return &model.CommandResponse{
		ResponseType: model.CommandResponseTypeEphemeral,
		Text:         fmt.Sprintf("```json\n%s\n```", buf.String()),
	}, nil
}

func (p *Plugin) handleEndCallCommand(userID, channelID string) (*model.CommandResponse, error) {
	isAdmin := p.API.HasPermissionTo(userID, model.PermissionManageSystem)

	state, err := p.kvGetChannelState(channelID)
	if err != nil {
		return nil, err
	}

	if state == nil || state.Call == nil {
		return nil, fmt.Errorf("no call ongoing")
	}

	if !isAdmin && state.Call.CreatorID != userID {
		return nil, fmt.Errorf("no permissions to end the call")
	}

	callID := state.Call.ID

	if err := p.kvSetAtomicChannelState(channelID, func(state *channelState) (*channelState, error) {
		if state == nil || state.Call == nil {
			return nil, nil
		}

		if state.Call.ID != callID {
			return nil, fmt.Errorf("previous call has ended and new one has started")
		}

		if state.Call.EndAt == 0 {
			state.Call.EndAt = time.Now().UnixMilli()
		}

		return state, nil
	}); err != nil {
		return nil, fmt.Errorf("failed to set state: %w", err)
	}

	p.API.PublishWebSocketEvent(wsEventCallEnd, map[string]interface{}{}, &model.WebsocketBroadcast{ChannelId: channelID, ReliableClusterSend: true})

	go func() {
		// We wait a few seconds for the call to end cleanly. If this doesn't
		// happen we force end it.
		time.Sleep(5 * time.Second)

		state, err := p.kvGetChannelState(channelID)
		if err != nil {
			p.LogError(err.Error())
			return
		}
		if state == nil || state.Call == nil || state.Call.ID != callID {
			return
		}

		p.LogInfo("call state is still in store, force ending it")

		for connID := range state.Call.Sessions {
			if err := p.closeRTCSession(userID, connID, channelID, state.NodeID); err != nil {
				p.LogError(err.Error())
			}
		}

		if err := p.cleanCallState(channelID); err != nil {
			p.LogError(err.Error())
		}
	}()

	return &model.CommandResponse{}, nil
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
		resp, err := p.handleEndCallCommand(args.UserId, args.ChannelId)
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
