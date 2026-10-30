// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package public

// CallParticipant is the per-call, per-user attendance record used for audit
// reporting. Unlike CallSession (live state, deleted on leave), this row is
// durable and collapses reconnects into a single first-join / last-leave pair,
// as agreed for the audit feature. FirstJoinAt/LastLeaveAt are ms since epoch;
// LastLeaveAt is 0 while the user is still (or was last) in the call.
type CallParticipant struct {
	CallID      string `json:"call_id"`
	UserID      string `json:"user_id"`
	FirstJoinAt int64  `json:"first_join_at"`
	LastLeaveAt int64  `json:"last_leave_at"`
}
