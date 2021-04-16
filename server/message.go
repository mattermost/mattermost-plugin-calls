package main

import (
	"encoding/json"
)

type message struct {
	Type string          `json:"type"`
	Data json.RawMessage `json:"data"`
}

const (
	messageTypeSignal   = "signal"
	messageTypeICE      = "ice"
	messageTypeMute     = "mute"
	messageTypeUnmute   = "unmute"
	messageTypeVoiceOn  = "voice_on"
	messageTypeVoiceOff = "voice_off"
)

func (m *message) ToJSON() ([]byte, error) {
	return json.Marshal(m)
}

func (m *message) FromJSON(data []byte) error {
	return json.Unmarshal(data, &m)
}
