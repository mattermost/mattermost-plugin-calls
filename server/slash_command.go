// Copyright (c) 2022-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	fbModel "github.com/mattermost/focalboard/server/model"
	"github.com/pkg/errors"
	"strings"

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
	data.AddCommand(model.NewAutocompleteData(leaveCommandTrigger, "", "Leave a call in the current channel."))
	data.AddCommand(model.NewAutocompleteData(linkCommandTrigger, "", "Generate a link to join a call in the current channel."))
	data.AddCommand(model.NewAutocompleteData(statsCommandTrigger, "", "Show client-generated statistics about the call."))
	data.AddCommand(model.NewAutocompleteData(endCommandTrigger, "", "End the call for everyone. All the participants will drop immediately."))

	experimentalCmdData := model.NewAutocompleteData(experimentalCommandTrigger, "", "Turn experimental features on or off.")
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

func (p *Plugin) handleEndCallCommand(userID, channelID string) (*model.CommandResponse, error) {
	return &model.CommandResponse{}, nil
}

func (p *Plugin) makeBoard(args *model.CommandArgs) error {
	channel, appErr := p.API.GetChannel(args.ChannelId)
	if appErr != nil {
		return errors.Wrap(appErr, "unable to get current Channel")
	}
	if channel == nil {
		return errors.Wrap(appErr, "unable to get current Channel")
	}

	now := model.GetMillis()

	createdByProp := map[string]interface{}{
		"id":      model.NewId(),
		"name":    "Created By",
		"type":    "person",
		"options": []interface{}{},
	}

	board := &fbModel.Board{
		ID:        model.NewId(),
		TeamID:    channel.TeamId,
		ChannelID: channel.Id,
		Type:      fbModel.BoardTypeOpen,
		Title:     "Meeting Agenda",
		CreatedBy: args.UserId,
		Properties: map[string]interface{}{
			"agenda-" + channel.Id: "",
		},
		CardProperties: []map[string]interface{}{
			createdByProp,
			{
				"id":      model.NewId(),
				"name":    "Created At",
				"type":    "createdTime",
				"options": []interface{}{},
			},
			{
				"id":   model.NewId(),
				"name": "Status",
				"type": "select",
				"options": []map[string]interface{}{
					{
						"id":    model.NewId(),
						"value": StatusUpNext,
						"color": "propColorGray",
					},
					{
						"id":    model.NewId(),
						"value": StatusRevisit,
						"color": "propColorYellow",
					},
					{
						"id":    model.NewId(),
						"value": StatusDone,
						"color": "propColorGreen",
					},
				},
			},
			{
				"id":      model.NewId(),
				"name":    "Post ID",
				"type":    "text",
				"options": []interface{}{},
			},
		},
		CreateAt: now,
		UpdateAt: now,
		DeleteAt: 0,
	}

	block := fbModel.Block{
		ID:       model.NewId(),
		Type:     fbModel.TypeView,
		BoardID:  board.ID,
		ParentID: board.ID,
		Schema:   1,
		Fields: map[string]interface{}{
			"viewType":           fbModel.TypeBoard,
			"sortOptions":        []interface{}{},
			"visiblePropertyIds": []interface{}{createdByProp["id"].(string)},
			"visibleOptionIds":   []interface{}{},
			"hiddenOptionIds":    []interface{}{},
			"collapsedOptionIds": []interface{}{},
			"filter": map[string]interface{}{
				"operation": "and",
				"filters":   []interface{}{},
			},
			"cardOrder":          []interface{}{},
			"columnWidths":       map[string]interface{}{},
			"columnCalculations": map[string]interface{}{},
			"kanbanCalculations": map[string]interface{}{},
			"defaultTemplateId":  "",
		},
		Title:    "All",
		CreateAt: now,
		UpdateAt: now,
		DeleteAt: 0,
	}

	boardsAndBlocks := &fbModel.BoardsAndBlocks{Boards: []*fbModel.Board{board}, Blocks: []fbModel.Block{block}}

	client := p.fbStore.GetClient(args.Session.Token)

	boardsAndBlocks, resp := client.CreateBoardsAndBlocks(boardsAndBlocks)
	if resp.Error != nil {
		fmt.Println(resp.StatusCode)
		return errors.Wrap(resp.Error, "unable to create board")
	}
	fmt.Println(resp.StatusCode)
	if boardsAndBlocks == nil {
		return errors.New("no boards or blocks returned")
	}
	if len(boardsAndBlocks.Boards) == 0 {
		return errors.New("no board returned")
	}

	board = boardsAndBlocks.Boards[0]

	member := &fbModel.BoardMember{
		BoardID:     board.ID,
		UserID:      args.UserId,
		SchemeAdmin: true,
	}

	_, resp = client.AddMemberToBoard(member)
	if resp.Error != nil {
		return errors.Wrap(resp.Error, "unable to add user to board")
	}

	return nil
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

	if subCmd == "makeboard" {
		err := p.makeBoard(args)
		if err != nil {
			return &model.CommandResponse{
				ResponseType: model.CommandResponseTypeEphemeral,
				Text:         "error:" + err.Error(),
			}, nil
		}
		return &model.CommandResponse{
			ResponseType: model.CommandResponseTypeEphemeral,
			Text:         "made board...?",
		}, nil
	}

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
