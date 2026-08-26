// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"net/http"
	"strings"
	"time"

	"github.com/mattermost/mattermost-plugin-calls/server/db"
)

const rtcdSessionReconcilerInterval = 30 * time.Second

func (p *Plugin) runRTCDSessionReconciler() {
	ticker := time.NewTicker(rtcdSessionReconcilerInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			p.reconcileRTCDSessions()
		case <-p.stopCh:
			return
		}
	}
}

// reconcileRTCDSessions compares calls_sessions DB rows against what RTCD
// reports for each active call and cleans up any rows RTCD no longer knows
// about. These orphaned rows occur when the app node that owned a session's
// WebSocket connection dies before RTCD can deliver the close event.
//
// If all sessions for a call are orphaned (RTCD has no sessions), the call
// state is also cleaned up — otherwise the call would remain active
// indefinitely, blocking new calls in the channel.
func (p *Plugin) reconcileRTCDSessions() {
	calls, err := p.store.GetAllActiveCalls(db.GetCallOpts{FromWriter: true})
	if err != nil {
		p.LogError("rtcd reconciler: failed to get active calls", "err", err.Error())
		return
	}

	for _, call := range calls {
		if call.Props.RTCDHost == "" {
			continue
		}

		host := p.rtcdManager.getHost(call.Props.RTCDHost)
		if host == nil {
			// RTCD node is gone entirely; cleanUpState handles this path.
			continue
		}

		// GetSessions requires RTCD v1.0.0+.
		info, err := host.client.GetVersionInfo()
		if err != nil {
			p.LogDebug("rtcd reconciler: failed to get version info", "err", err.Error(), "callID", call.ID, "rtcdHost", call.Props.RTCDHost)
			continue
		}
		if info.BuildVersion != "" && info.BuildVersion != "master" && !strings.HasPrefix(info.BuildVersion, "dev") {
			if err := checkMinVersion("v1.0.0", info.BuildVersion); err != nil {
				p.LogDebug("rtcd reconciler: RTCD version does not support GetSessions", "err", err.Error(), "callID", call.ID)
				continue
			}
		}

		cfgs, code, err := host.client.GetSessions(call.ID)
		if err != nil || (code != http.StatusOK && code != http.StatusNotFound) {
			p.LogDebug("rtcd reconciler: failed to get sessions from RTCD", "err", err, "code", code, "callID", call.ID)
			continue
		}

		rtcdSessionIDs := make(map[string]struct{}, len(cfgs))
		for _, cfg := range cfgs {
			rtcdSessionIDs[cfg.SessionID] = struct{}{}
		}

		dbSessions, err := p.store.GetCallSessions(call.ID, db.GetCallSessionOpts{})
		if err != nil {
			p.LogError("rtcd reconciler: failed to get DB sessions", "err", err.Error(), "callID", call.ID)
			continue
		}

		var deleteFailed int
		for sessionID := range dbSessions {
			if _, ok := rtcdSessionIDs[sessionID]; !ok {
				p.LogInfo("rtcd reconciler: deleting orphaned session", "sessionID", sessionID, "callID", call.ID)
				if err := p.store.DeleteCallSession(sessionID); err != nil {
					p.LogError("rtcd reconciler: failed to delete orphaned session", "err", err.Error(), "sessionID", sessionID)
					deleteFailed++
				}
			}
		}

		// If RTCD has no sessions for this call, the call has ended but the
		// plugin never received the close events. Clean up call state now so
		// the channel doesn't remain blocked indefinitely.
		//
		// We check deleteFailed == 0 rather than orphaned > 0 so that a
		// cleanCallState failure on a prior pass (after the DB rows were
		// already removed) is retried: the next pass sees an empty dbSessions
		// and no delete failures, and tries again.
		if len(cfgs) == 0 && deleteFailed == 0 {
			p.LogInfo("rtcd reconciler: all sessions were orphaned, cleaning up call state", "callID", call.ID, "channelID", call.ChannelID)

			state, err := p.lockCallReturnState(call.ChannelID)
			if err != nil {
				p.LogError("rtcd reconciler: failed to lock call", "err", err.Error(), "callID", call.ID)
				continue
			}

			// Re-check under lock: another node or path may have raced us.
			if state == nil || len(state.sessions) > 0 {
				p.unlockCall(call.ChannelID)
				continue
			}

			if err := p.cleanCallState(&state.Call); err != nil {
				p.LogError("rtcd reconciler: failed to clean call state", "err", err.Error(), "callID", call.ID)
			}
			p.unlockCall(call.ChannelID)
		}
	}
}
