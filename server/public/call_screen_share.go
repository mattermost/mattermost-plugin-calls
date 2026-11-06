// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package public

// CallScreenShare is one screen-share segment within a call: a single user
// sharing from a single session, from StartAt until StopAt. Used for audit
// reporting (MM-71363), where investigators need a log of who shared their
// screen and when. A call can have many segments (different users, or the same
// user sharing more than once). StartAt/StopAt are ms since epoch; StopAt is 0
// while the share is still live (or was live when the call ended, until the
// call-end backstop stamps it).
type CallScreenShare struct {
	CallID    string `json:"call_id"`
	UserID    string `json:"user_id"`
	SessionID string `json:"session_id"`
	StartAt   int64  `json:"start_at"`
	StopAt    int64  `json:"stop_at"`
}
