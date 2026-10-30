// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import "time"

// Participant attendance auditing (MM-71363).
//
// Durable first-join / last-leave timestamps are written to the calls_participants
// table, but the writes must never happen on the join/leave hot path while the
// call lock is held: a slow or unavailable DB would otherwise stall every other
// join/leave for that call for up to the SQL QueryTimeout. Instead, the lifecycle
// handlers enqueue an event (a cheap, in-memory channel send) and a single
// background worker performs the DB write off the lock, in order.

const (
	auditEventJoin  = "join"
	auditEventLeave = "leave"

	// auditQueueSize bounds the in-memory backlog. A single DB writer drains it;
	// it only fills under a sustained DB outage, in which case events are dropped
	// (logged) rather than blocking calls.
	auditQueueSize = 4096
)

type participantAuditEvent struct {
	kind   string // auditEventJoin | auditEventLeave
	callID string
	userID string
	ts     int64 // ms since epoch
}

// enqueueParticipantAuditEvent hands an event to the background writer without
// blocking. It is safe to call under the call lock. If the queue is full (DB
// outage) or not yet initialized, the event is dropped and logged — call
// stability is favored over audit completeness in that degraded state.
func (p *Plugin) enqueueParticipantAuditEvent(kind, callID, userID string, ts int64) {
	if p.isBot(userID) {
		return
	}
	// A nil channel means the audit worker isn't running (before activation, or in
	// tests). Skip silently rather than busy-logging on every lifecycle event.
	if p.auditCh == nil {
		return
	}
	select {
	case p.auditCh <- participantAuditEvent{kind: kind, callID: callID, userID: userID, ts: ts}:
	default:
		p.LogWarn("participant audit queue full, dropping event",
			"kind", kind, "callID", callID, "userID", userID)
	}
}

// participantAuditWorker drains the audit queue, writing attendance to the store.
// A single worker preserves per-call join-before-leave ordering (events are
// enqueued under the call lock, and the channel is FIFO). It exits after draining
// once stopCh is closed, so pending events are flushed on graceful shutdown.
func (p *Plugin) participantAuditWorker() {
	defer p.auditWg.Done()
	for {
		select {
		case ev := <-p.auditCh:
			p.writeParticipantAuditEvent(ev)
		case <-p.stopCh:
			for {
				select {
				case ev := <-p.auditCh:
					p.writeParticipantAuditEvent(ev)
				default:
					return
				}
			}
		}
	}
}

func (p *Plugin) writeParticipantAuditEvent(ev participantAuditEvent) {
	switch ev.kind {
	case auditEventJoin:
		if err := p.store.RecordParticipantJoin(ev.callID, ev.userID, ev.ts); err != nil {
			p.LogError("failed to record participant join",
				"callID", ev.callID, "userID", ev.userID, "err", err.Error())
		}
	case auditEventLeave:
		if err := p.store.RecordParticipantLeave(ev.callID, ev.userID, ev.ts); err != nil {
			p.LogError("failed to record participant leave",
				"callID", ev.callID, "userID", ev.userID, "err", err.Error())
		}
	}
}

// nowMillis is a small indirection so lifecycle handlers read a consistent clock.
func nowMillis() int64 {
	return time.Now().UnixMilli()
}
