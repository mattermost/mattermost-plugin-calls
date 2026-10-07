// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"context"
	"time"

	"github.com/mattermost/mattermost-plugin-calls/server/cluster"
	"github.com/mattermost/mattermost-plugin-calls/server/db"
	"github.com/mattermost/mattermost-plugin-calls/server/public"

	"github.com/livekit/protocol/livekit"
)

const (
	reconcilerInterval       = 60 * time.Second
	reconcilerLockKey        = "calls_reconcile"
	reconcilerSuspicionLimit = 2

	// reconcilerPendingGrace is how long a session minted by the token endpoint
	// may stay unconfirmed before its absence from LiveKit counts against it.
	// Clients connect within seconds of minting, so a row still pending after
	// this is a join that never reached LiveKit, or one whose participant_joined
	// was never delivered and whose client has since left.
	reconcilerPendingGrace = time.Minute
)

// reconciler is a long-running goroutine that periodically cross-checks DB call
// session state against the LiveKit room participant list and reaps sessions that
// are present in the DB but absent from LiveKit. It is the safety net for
// participant_left webhooks that were lost or delivered out of order after a
// reconnect (MM-69510).
//
// Only one node in a cluster runs the sweep per tick. Election is via a
// dedicated cluster.Mutex so the runner is not limited to single-handler mode —
// a two-node HA deployment needs reconciliation too.
func (p *Plugin) reconciler() {
	ticker := time.NewTicker(reconcilerInterval)
	defer ticker.Stop()

	mutex, err := cluster.NewMutex(p.API, p.metrics, reconcilerLockKey, cluster.MutexConfig{})
	if err != nil {
		p.LogError("reconciler: failed to create cluster mutex", "err", err.Error())
		return
	}

	for {
		select {
		case <-p.stopCh:
			return
		case <-ticker.C:
			p.reconcileActiveCalls(mutex)
		}
	}
}

// reconcileActiveCalls runs one sweep: for each active call it fetches LiveKit
// participants, compares against DB sessions, increments suspicion
// counters for absentees, and reaps those that have been absent for two
// consecutive ticks.
func (p *Plugin) reconcileActiveCalls(mutex *cluster.Mutex) {
	// Skip the tick if another node already holds the election lock.
	lockCtx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	if err := mutex.Lock(lockCtx); err != nil {
		p.LogDebug("reconciler: skipping tick, another node holds the lock")
		return
	}
	defer mutex.Unlock()

	calls, err := p.store.GetAllActiveCalls(db.GetCallOpts{})
	if err != nil {
		p.LogError("reconciler: failed to get active calls", "err", err.Error())
		return
	}

	p.LogDebug("reconciler: tick", "activeCalls", len(calls))

	// seenSessionIDs is the universe of reconciled sessions this tick. Suspicion
	// entries for sessions that are no longer active (call ended between ticks)
	// are pruned at the end to keep the map bounded.
	seenSessionIDs := map[string]struct{}{}

	for _, call := range calls {
		channelID := call.ChannelID

		participants, err := p.livekitListParticipants(channelID)
		if err != nil {
			// Room may not exist yet for a very new call; log at debug.
			p.LogDebug("reconciler: failed to list participants",
				"channelID", channelID, "err", err.Error())
			continue
		}

		sessions, err := p.store.GetCallSessions(call.ID, db.GetCallSessionOpts{})
		if err != nil {
			p.LogError("reconciler: failed to get sessions",
				"callID", call.ID, "channelID", channelID, "err", err.Error())
			continue
		}

		p.reconcileCallSessions(channelID, sessions, buildLKSessionIDSet(participants), seenSessionIDs)
	}

	// Prune suspicion entries for sessions whose calls have ended since last tick.
	p.reconcilerSuspicionsMut.Lock()
	for sessionID := range p.reconcilerSuspicions {
		if _, seen := seenSessionIDs[sessionID]; !seen {
			delete(p.reconcilerSuspicions, sessionID)
		}
	}
	p.reconcilerSuspicionsMut.Unlock()
}

// reconcileCallSessions applies one tick of the suspicion/reap logic for a
// single call. sessions is the DB snapshot for the call; lkSessionIDs is the
// set of session IDs currently present in the LiveKit room (keyed by sessionID,
// not SID). seenSessionIDs is populated with every session reconciled so
// the caller can prune stale suspicion entries after iterating all calls.
func (p *Plugin) reconcileCallSessions(channelID string, sessions map[string]*public.CallSession, lkSessionIDs map[string]struct{}, seenSessionIDs map[string]struct{}) {
	for _, session := range sessions {
		// SIP participant lifecycle is managed by the SIP gateway, not here.
		if session.IsSIPParticipant {
			continue
		}
		// A pending session's absence from LK is expected while its client is
		// still connecting. Once past the grace period nothing else would ever
		// remove it, and it would hold the call open indefinitely.
		if session.ConfirmedAt == 0 {
			if time.Since(time.UnixMilli(session.JoinAt)) < reconcilerPendingGrace {
				continue
			}
		} else if session.SID == "" {
			continue
		}

		seenSessionIDs[session.ID] = struct{}{}

		if _, present := lkSessionIDs[session.ID]; present {
			// Session is alive in LK — reset any suspicion accumulated so far.
			p.reconcilerSuspicionsMut.Lock()
			delete(p.reconcilerSuspicions, session.ID)
			p.reconcilerSuspicionsMut.Unlock()
			continue
		}

		// Session absent from LK: increment suspicion counter.
		p.reconcilerSuspicionsMut.Lock()
		p.reconcilerSuspicions[session.ID]++
		count := p.reconcilerSuspicions[session.ID]
		p.reconcilerSuspicionsMut.Unlock()

		p.LogDebug("reconciler: session absent from LiveKit",
			"channelID", channelID,
			"callID", session.CallID,
			"sessionID", session.ID,
			"userID", session.UserID,
			"sid", session.SID,
			"suspicion", count)

		if count < reconcilerSuspicionLimit {
			continue
		}

		// Two consecutive misses: the webhook was lost, or the join never
		// happened. Reap via the same path as participant_left so all downstream
		// effects (host election, call-end, screen-share clear) are consistent.
		p.LogInfo("reconciler: reaping orphaned session",
			"channelID", channelID,
			"callID", session.CallID,
			"sessionID", session.ID,
			"userID", session.UserID,
			"sid", session.SID,
			"confirmed", session.ConfirmedAt > 0)

		// Clear suspicion before removing so a concurrent re-entry doesn't
		// double-reap if the DB write is slow.
		p.reconcilerSuspicionsMut.Lock()
		delete(p.reconcilerSuspicions, session.ID)
		p.reconcilerSuspicionsMut.Unlock()

		// session.SID is the SID from the DB snapshot above. removeParticipantSession
		// re-checks it under the call lock and bails if the client reconnected
		// (new SID) in the window between our LK query and the reap.
		p.removeParticipantSession(channelID, session.UserID, session.ID, session.SID)
	}
}

// buildLKSessionIDSet parses the identity field of each non-SIP LiveKit
// participant into a session ID and returns the set of IDs present.
func buildLKSessionIDSet(participants []*livekit.ParticipantInfo) map[string]struct{} {
	ids := make(map[string]struct{}, len(participants))
	for _, pt := range participants {
		if pt.Kind == livekit.ParticipantInfo_SIP {
			continue
		}
		_, sessionID, ok := parseLivekitIdentity(pt.Identity)
		if !ok {
			continue
		}
		ids[sessionID] = struct{}{}
	}
	return ids
}
