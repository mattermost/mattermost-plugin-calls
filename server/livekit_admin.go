// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/livekit/protocol/livekit"
	lksdk "github.com/livekit/server-sdk-go/v2"
)

const livekitAPITimeout = 5 * time.Second

var errLiveKitNotConfigured = errors.New("LiveKit is not configured")

func (p *Plugin) getLiveKitRoomClient() (*lksdk.RoomServiceClient, error) {
	cfg := p.getConfiguration()
	lkURL := cfg.getLiveKitURL()
	if lkURL == "" || cfg.LiveKitAPIKey == "" || cfg.LiveKitAPISecret == "" {
		return nil, errLiveKitNotConfigured
	}
	return lksdk.NewRoomServiceClient(lkURL, cfg.LiveKitAPIKey, cfg.LiveKitAPISecret), nil
}

// livekitMuteParticipant force-mutes the participant's microphone track(s) on
// the server. The user can still unmute themselves locally afterwards, matching
// v1 host-mute semantics.
func (p *Plugin) livekitMuteParticipant(room, identity string) error {
	client, err := p.getLiveKitRoomClient()
	if err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(context.Background(), livekitAPITimeout)
	defer cancel()

	info, err := client.GetParticipant(ctx, &livekit.RoomParticipantIdentity{
		Room:     room,
		Identity: identity,
	})
	if err != nil {
		return fmt.Errorf("livekit GetParticipant: %w", err)
	}

	for _, t := range info.GetTracks() {
		if t.GetSource() != livekit.TrackSource_MICROPHONE || t.GetMuted() {
			continue
		}
		if _, err := client.MutePublishedTrack(ctx, &livekit.MuteRoomTrackRequest{
			Room:     room,
			Identity: identity,
			TrackSid: t.GetSid(),
			Muted:    true,
		}); err != nil {
			return fmt.Errorf("livekit MutePublishedTrack: %w", err)
		}
	}
	return nil
}

func (p *Plugin) livekitRemoveParticipant(room, identity string) error {
	client, err := p.getLiveKitRoomClient()
	if err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(context.Background(), livekitAPITimeout)
	defer cancel()

	_, err = client.RemoveParticipant(ctx, &livekit.RoomParticipantIdentity{
		Room:     room,
		Identity: identity,
	})
	if err != nil {
		return fmt.Errorf("livekit RemoveParticipant: %w", err)
	}
	return nil
}
