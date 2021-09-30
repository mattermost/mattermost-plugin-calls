package main

import (
	"encoding/json"
)

type clientMessage struct {
	Type string          `json:"type"`
	Data json.RawMessage `json:"data"`
}

const (
	clientMessageTypeSignal    = "signal"
	clientMessageTypeICE       = "ice"
	clientMessageTypeMute      = "mute"
	clientMessageTypeUnmute    = "unmute"
	clientMessageTypeVoiceOn   = "voice_on"
	clientMessageTypeVoiceOff  = "voice_off"
	clientMessageTypeScreenOn  = "screen_on"
	clientMessageTypeScreenOff = "screen_off"
)

func (m *clientMessage) ToJSON() ([]byte, error) {
	return json.Marshal(m)
}

func (m *clientMessage) FromJSON(data []byte) error {
	return json.Unmarshal(data, &m)
}
