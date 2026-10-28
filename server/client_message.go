// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

type clientMessage struct {
	Type string `json:"type"`
}

const (
	clientMessageTypeJoin    = "join"
	clientMessageTypeLeave   = "leave"
	clientMessageTypeCaption = "caption"
	clientMessageTypeMetric  = "metric"
)

var validClientMessageTypes = map[string]bool{
	clientMessageTypeJoin:    true,
	clientMessageTypeLeave:   true,
	clientMessageTypeCaption: true,
	clientMessageTypeMetric:  true,
	"ping":                   true,
}

func isValidClientMessageType(msgType string) bool {
	return validClientMessageTypes[msgType]
}
