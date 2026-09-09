// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
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

// livekitAttributeBot is the LiveKit participant attribute key that marks the
// recording/transcribing bot. It mirrors CALL_ATTRIBUTES.BOT on the webapp and
// is server-set on the bot's token grant so clients can filter the bot out of
// the participant list independently of the plugin-WS bot filter.
const livekitAttributeBot = "bot"

// livekitTopicHostControl is the data-message topic for host commands the
// server cannot enforce through the admin API. It mirrors
// CALL_MESSAGE_TOPICS.HOST_CONTROL on the clients.
//
// One topic with an action field rather than a topic per command: any future
// host action the admin API cannot carry out has this same shape — the server
// has to ask the client. Requesting an unmute is the clearest case, since the
// server can mute someone but can never unmute them.
const livekitTopicHostControl = "host_control"

// hostControlActionStopScreenshare asks the client to stop its screen share.
const hostControlActionStopScreenshare = "stop_screenshare"

// hostControlPayload is the host_control data-message body.
type hostControlPayload struct {
	Action string `json:"action"`
}

var errLiveKitNotConfigured = errors.New("LiveKit is not configured")

func composeLivekitIdentity(userID, sessionID string) string {
	return userID + userIDSessionIDSeparator + sessionID
}

// parseLivekitIdentity splits a participant identity minted by
// composeLivekitIdentity back into its user and call-session ids. It reports
// false for identities we did not mint, such as SIP participants whose identity
// is a phone number.
func parseLivekitIdentity(identity string) (userID, sessionID string, ok bool) {
	userID, sessionID, found := strings.Cut(identity, userIDSessionIDSeparator)
	if !found || userID == "" || sessionID == "" {
		return "", "", false
	}
	return userID, sessionID, true
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

// livekitUpdateRoomMetadata pushes call-level state to the room. Every connected
// client, including standalone bundles with no Mattermost WebSocket, receives it
// through RoomEvent.RoomMetadataChanged, and newly connected clients get the
// current value on connect — so this needs no companion resync path.
func (p *Plugin) livekitUpdateRoomMetadata(room, metadata string) error {
	client, err := p.getLiveKitRoomClient()
	if err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(context.Background(), livekitAPITimeout)
	defer cancel()

	if _, err := client.UpdateRoomMetadata(ctx, &livekit.UpdateRoomMetadataRequest{
		Room:     room,
		Metadata: metadata,
	}); err != nil {
		return fmt.Errorf("livekit UpdateRoomMetadata: %w", err)
	}
	return nil
}

// livekitSendHostControl asks a single client to carry out a host action that
// the server cannot enforce itself.
//
// Almost every host control is enforced through the admin API and needs no
// message: mutes land as TrackMuted, a lowered hand as an attribute change, a
// removal as a disconnect. The exception is stopping a screen share.
// MutePublishedTrack does not stop the client publishing, so the capture stays
// live and the browser's sharing indicator stays lit while nobody receives
// anything. Only the client can tear the track down, so it has to be asked.
//
// Delivery is best-effort and fails safe: a lost message leaves the share
// running and the host clicks again.
func (p *Plugin) livekitSendHostControl(room, identity, action string) error {
	client, err := p.getLiveKitRoomClient()
	if err != nil {
		return err
	}

	data, err := json.Marshal(hostControlPayload{Action: action})
	if err != nil {
		return fmt.Errorf("failed to marshal host control payload: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), livekitAPITimeout)
	defer cancel()

	topic := livekitTopicHostControl
	if _, err := client.SendData(ctx, &livekit.SendDataRequest{
		Room:                  room,
		Data:                  data,
		Kind:                  livekit.DataPacket_RELIABLE,
		DestinationIdentities: []string{identity},
		Topic:                 &topic,
	}); err != nil {
		return fmt.Errorf("livekit SendData: %w", err)
	}
	return nil
}
