// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"time"

	"github.com/mattermost/mattermost-plugin-calls/server/public"
)

// Participant attendance auditing (MM-71363).
//
// Durable first-join / last-leave timestamps are written to the calls_participants
// table synchronously on the join/leave lifecycle paths, alongside the existing
// call and session writes, so an acknowledged join/leave always has a persisted
// attendance record: the data survives a crash to the same degree as core call
// state. Writes run under the call lock like the surrounding session writes; they
// are a single indexed upsert/update, so the added cost is marginal next to the
// call and session writes already on these paths.
//
// recordLeaveBackstop closes the one gap a per-leave write can't: if a leave is
// never observed (server crash mid-call, a missed webhook, a failed write), the
// participant would keep LastLeaveAt = 0. Every path that ends a call calls it, so
// the leave is set to the call's end time — the latest moment the participant
// could still have been present. No attendee of an ended call is ever left
// without a leave time.

// nowMillis is a small indirection so lifecycle handlers read a consistent clock.
func nowMillis() int64 {
	return time.Now().UnixMilli()
}

// recordLeaveBackstop stamps a leave time on any participant of the (now ended)
// call that has no recorded leave yet. Non-fatal: a failure is logged, since the
// call is already ending and there is nothing to roll back. Callers must have set
// call.EndAt (via setCallEnded) first.
func (p *Plugin) recordLeaveBackstop(call *public.Call) {
	if call.EndAt == 0 {
		return
	}
	if err := p.store.RecordLeaveForActiveParticipants(call.ID, call.EndAt); err != nil {
		p.LogError("calls audit: failed to backstop participant leaves",
			"callID", call.ID, "err", err.Error())
	}
}

// recordScreenShareBackstop closes any screen-share segment still open on the
// (now ended) call, stamping the call's end time. Same rationale and contract as
// recordLeaveBackstop: non-fatal, and the caller must have set call.EndAt first.
// A sharer still sharing at call end, or a stop event never observed, would
// otherwise leave StopAt = 0 forever.
func (p *Plugin) recordScreenShareBackstop(call *public.Call) {
	if call.EndAt == 0 {
		return
	}
	if err := p.store.RecordStopForActiveScreenShares(call.ID, call.EndAt); err != nil {
		p.LogError("calls audit: failed to backstop screen shares",
			"callID", call.ID, "err", err.Error())
	}
}
