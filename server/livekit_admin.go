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

const userIDSessionIDSeparator = "___"
const livekitAPITimeout = 5 * time.Second

// livekitAttributeRaisedHand is the LiveKit participant attribute key that
// carries raised-hand state. It mirrors CALL_ATTRIBUTES.RAISED_HAND on the
// webapp; hand state is derived purely from this attribute, so server-side
// host controls must mutate it directly rather than relying on a client
// round-trip.
const livekitAttributeRaisedHand = "raised_hand"

var errLiveKitNotConfigured = errors.New("LiveKit is not configured")

func composeLivekitIdentity(userID, sessionID string) string {
	return userID + userIDSessionIDSeparator + sessionID
}

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
// v1 host-mute semantics. Returns nil if the participant has not yet published
// a mic track (mid-join window) — the mute is a silent no-op in that case.
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

// livekitLowerParticipantHand clears the participant's raised-hand attribute on
// the server. Setting the attribute to an empty string deletes it, which fires
// RoomEvent.ParticipantAttributesChanged on every connected client, driving the
// hand-lowered UI for all participants — the same propagation path as the user
// lowering their own hand, but server-authoritative and not dependent on a WS
// round-trip to the target client.
func (p *Plugin) livekitLowerParticipantHand(room, identity string) error {
	client, err := p.getLiveKitRoomClient()
	if err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(context.Background(), livekitAPITimeout)
	defer cancel()

	if _, err := client.UpdateParticipant(ctx, &livekit.UpdateParticipantRequest{
		Room:       room,
		Identity:   identity,
		Attributes: map[string]string{livekitAttributeRaisedHand: ""},
	}); err != nil {
		return fmt.Errorf("livekit UpdateParticipant: %w", err)
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

// livekitDeleteRoom destroys the LiveKit room and forcibly disconnects every
// participant. The plugin server is the authority on call lifecycle; this is
// the atomic media-layer teardown that backs the host-end-call action and any
// other server-driven call termination. Each connected client's LiveKit SDK
// fires RoomEvent.Disconnected (reason=ROOM_DELETED), which drives in-call UI
// teardown without relying on plugin-WebSocket delivery.
func (p *Plugin) livekitDeleteRoom(room string) error {
	client, err := p.getLiveKitRoomClient()
	if err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(context.Background(), livekitAPITimeout)
	defer cancel()

	if _, err := client.DeleteRoom(ctx, &livekit.DeleteRoomRequest{
		Room: room,
	}); err != nil {
		return fmt.Errorf("livekit DeleteRoom: %w", err)
	}
	return nil
}
