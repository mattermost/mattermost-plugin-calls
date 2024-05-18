// Copyright (c) 2022-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"fmt"
	"time"

	"github.com/mattermost/mattermost/server/public/model"
)

const aiUsername = "ai"

func (p *Plugin) getAIBot() (*model.Bot, error) {
	botUser, appErr := p.API.GetUserByUsername(aiUsername)
	if appErr != nil {
		return nil, fmt.Errorf("failed to get AI bot user: %w", appErr)
	}
	bot, appErr := p.API.GetBot(botUser.Id, false)
	if appErr != nil {
		return nil, fmt.Errorf("failed to get AI bot: %w", appErr)
	}

	return bot, nil
}

func (p *Plugin) getAIBotID() string {
	bot, err := p.getAIBot()
	if err != nil {
		p.LogError("failed to get AI bot", "err", err.Error())
		return ""
	}
	return bot.UserId
}

func (p *Plugin) createAIBotSession() (*model.Session, error) {
	bot, err := p.getAIBot()
	if err != nil {
		return nil, err
	}

	session, appErr := p.API.CreateSession(&model.Session{
		UserId:    bot.UserId,
		ExpiresAt: time.Now().Add(3 * time.Hour).UnixMilli(),
	})
	if appErr != nil {
		return nil, fmt.Errorf("failed to create session for bot: %w", appErr)
	}

	return session, nil
}

func (p *Plugin) summonAI(userID, channelID string) error {
	if !p.API.HasPermissionToChannel(userID, channelID, model.PermissionReadChannel) {
		return fmt.Errorf("forbidden")
	}

	state, err := p.lockCallReturnState(channelID)
	if err != nil {
		return fmt.Errorf("failed to lock call: %w", err)
	}
	defer p.unlockCall(channelID)

	if state == nil {
		return fmt.Errorf("no call ongoing")
	}

	if state.Call.GetHostID() != userID && !p.API.HasPermissionTo(userID, model.PermissionManageSystem) {
		return fmt.Errorf("no permissions to summon AI")
	}

	if state.Transcription == nil || state.Transcription.StartAt == 0 || state.Transcription.EndAt > 0 {
		return fmt.Errorf("transcription job is not running")
	}

	session, err := p.createAIBotSession()
	if err != nil {
		return fmt.Errorf("failed to create AI bot session")
	}

	p.publishWebSocketEvent(wsEventSummonAI, map[string]interface{}{
		"channel_id": channelID,
		"auth_token": session.Token,
	}, &model.WebsocketBroadcast{ConnectionId: state.Transcription.Props.BotConnID, ReliableClusterSend: true})

	return nil
}
