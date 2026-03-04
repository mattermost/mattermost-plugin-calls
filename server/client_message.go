// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
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
	clientMessageTypeJoin      = "join"
	clientMessageTypeLeave     = "leave"
	clientMessageTypeMute      = "mute"
	clientMessageTypeUnmute    = "unmute"
	clientMessageTypeCallState = "call_state"
)

func (m *clientMessage) ToJSON() ([]byte, error) {
	return json.Marshal(m)
}

func (m *clientMessage) FromJSON(data []byte) error {
	return json.Unmarshal(data, &m)
}

var validClientMessageTypes = map[string]bool{
	clientMessageTypeJoin:      true,
	clientMessageTypeLeave:     true,
	clientMessageTypeMute:      true,
	clientMessageTypeUnmute:    true,
	clientMessageTypeCallState: true,
	"ping":                     true,
}

func isValidClientMessageType(msgType string) bool {
	return validClientMessageTypes[msgType]
}
