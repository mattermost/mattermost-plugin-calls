// Copyright (c) 2022-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"encoding/json"
)

type clientMessage struct {
	Type string          `json:"type"`
	Data json.RawMessage `json:"data,omitempty"`
}

const (
	clientMessageTypeJoin        = "join"
	clientMessageTypeLeave       = "leave"
	clientMessageTypeReconnect   = "reconnect"
	clientMessageTypeSDP         = "sdp"
	clientMessageTypeICE         = "ice"
	clientMessageTypeMute        = "mute"
	clientMessageTypeUnmute      = "unmute"
	clientMessageTypeVoiceOn     = "voice_on"
	clientMessageTypeVoiceOff    = "voice_off"
	clientMessageTypeScreenOn    = "screen_on"
	clientMessageTypeScreenOff   = "screen_off"
	clientMessageTypeRaiseHand   = "raise_hand"
	clientMessageTypeUnraiseHand = "unraise_hand"
	clientMessageTypeReact       = "react"
	clientMessageTypeCaption     = "caption"
	clientMessageTypeMetric      = "metric"
	clientMessageTypeCallState   = "call_state"
)

func (m *clientMessage) ToJSON() ([]byte, error) {
	return json.Marshal(m)
}

func (m *clientMessage) FromJSON(data []byte) error {
	return json.Unmarshal(data, &m)
}
