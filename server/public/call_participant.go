// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package public

// Identity types for a CallParticipant. IdentityTypeUser holds a Mattermost
// user ID; IdentityTypePhone holds an E.164 phone number (the SIP callee of an
// outbound phone call). The type is free text validated in code rather than a DB
// enum, so new identity kinds don't require a migration.
const (
	IdentityTypeUser  = "user"
	IdentityTypePhone = "phone"
)

// CallParticipant is the per-call, per-identity attendance record used for audit
// reporting. Unlike CallSession (live state, deleted on leave), this row is
// durable and collapses reconnects into a single first-join / last-leave pair,
// as agreed for the audit feature. Identity is a Mattermost user ID when
// IdentityType is "user", or an E.164 number when "phone". FirstJoinAt/
// LastLeaveAt are ms since epoch; LastLeaveAt is 0 while the participant is still
// (or was last) in the call.
type CallParticipant struct {
	CallID       string `json:"call_id"`
	IdentityType string `json:"identity_type"`
	Identity     string `json:"identity"`
	FirstJoinAt  int64  `json:"first_join_at"`
	LastLeaveAt  int64  `json:"last_leave_at"`
}
