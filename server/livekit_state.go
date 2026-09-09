// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"encoding/json"
	"fmt"
	"time"

	"github.com/mattermost/mattermost-plugin-calls/server/public"
)

// callRoomMetadata is the LiveKit room metadata payload. It carries the
// call-level state that clients cannot derive from LiveKit itself: who the host
// is and whether a job is running. Everything else (participants, mute, hand,
// screen sharing) comes from LiveKit's own events.
//
// Metadata is delivered on connect and again on every change, so clients need
// no separate resync path. Only mutable state belongs here: immutable fields
// such as OwnerID and StartAt already arrive in the join response, and metadata
// has a size limit worth respecting.
type callRoomMetadata struct {
	HostID        string          `json:"host_id"`
	Recording     *JobStateClient `json:"recording,omitempty"`
	Transcription *JobStateClient `json:"transcription,omitempty"`
	LiveCaptions  *JobStateClient `json:"live_captions,omitempty"`
}

// newCallRoomMetadata derives the room metadata from a call state snapshot. Job
// state reuses JobStateClient so clients see the same shape they already
// consume from the call_job_state WebSocket event.
func newCallRoomMetadata(state *callState) *callRoomMetadata {
	if state == nil {
		return nil
	}

	return &callRoomMetadata{
		HostID:        state.Call.GetHostID(),
		Recording:     getClientStateFromCallJob(state.Recording),
		Transcription: getClientStateFromCallJob(state.Transcription),
		LiveCaptions:  getClientStateFromCallJob(state.LiveCaptions),
	}
}

// setCallHost assigns the call host in the given state and schedules a room
// metadata publish. It does not persist: callers commit the call as part of
// their own critical section, and the publisher reads under the channel lock so
// it cannot observe a half-finished one.
//
// The caller must hold the channel lock.
func (p *Plugin) setCallHost(state *callState, channelID, newHostID string) {
	if newHostID == "" {
		state.Call.Props.Hosts = nil
	} else {
		state.Call.Props.Hosts = []string{newHostID}
	}

	p.markCallDirty(channelID)
}

// createCallJob persists a new job and schedules a room metadata publish. It
// wraps the store method so that job state cannot start without the room being
// told, rather than relying on callers to remember a separate call.
func (p *Plugin) createCallJob(channelID string, job *public.CallJob) error {
	if err := p.store.CreateCallJob(job); err != nil {
		return err
	}

	p.markCallDirty(channelID)

	return nil
}

// updateCallJob persists a job change and schedules a room metadata publish.
// See createCallJob for why this wraps the store method.
func (p *Plugin) updateCallJob(channelID string, job *public.CallJob) error {
	if err := p.store.UpdateCallJob(job); err != nil {
		return err
	}

	p.markCallDirty(channelID)

	return nil
}

// markCallDirty records that the given channel's room metadata needs
// republishing and wakes the publisher. It never blocks on anything but a
// nanosecond-scale in-process mutex, so it is safe to call while holding the
// channel lock.
//
// The map deduplicates: several changes to the same call coalesce into one
// publish, which matters because stopping a recording also stops transcription
// and vice versa.
func (p *Plugin) markCallDirty(channelID string) {
	p.dirtyCallsMut.Lock()
	if p.dirtyCalls == nil {
		p.dirtyCalls = map[string]struct{}{}
	}
	p.dirtyCalls[channelID] = struct{}{}
	p.dirtyCallsMut.Unlock()

	// A pending wakeup covers any number of marks, so a full channel is success.
	select {
	case p.dirtyCallsCh <- struct{}{}:
	default:
	}
}

// roomMetadataPublisher publishes room metadata for calls marked dirty. It is
// signal-driven rather than polled: a ticker would make its interval the
// user-visible latency floor for host and recording changes.
//
// Publishing is best-effort. A failed publish is logged and dropped rather than
// retried, which would spin while LiveKit is down; MM-69510's reconciliation
// sweep is the retry, comparing metadata against the database and republishing
// on divergence.
func (p *Plugin) roomMetadataPublisher() {
	defer p.publisherWg.Done()

	for {
		select {
		case <-p.dirtyCallsCh:
			p.publishDirtyCalls()
		case <-p.stopCh:
			return
		}
	}
}

// publishDirtyCalls takes the current dirty set and publishes each call's room
// metadata. Marks arriving during a publish land in the fresh set with a wakeup
// pending, so nothing is lost; at worst the same state is published twice.
func (p *Plugin) publishDirtyCalls() {
	p.dirtyCallsMut.Lock()
	dirty := p.dirtyCalls
	p.dirtyCalls = map[string]struct{}{}
	p.dirtyCallsMut.Unlock()

	for channelID := range dirty {
		select {
		case <-p.stopCh:
			return
		default:
		}

		if err := p.publishCallRoomMetadata(channelID); err != nil {
			p.LogError("failed to publish call room metadata",
				"channelID", channelID, "err", err.Error())
		}
	}
}

// publishCallRoomMetadata reads the call state and pushes it to the LiveKit
// room.
//
// The read happens under the channel lock so that a mark made mid-critical
// section cannot be serviced before that section commits — which is what lets
// markCallDirty be called anywhere, including before the caller's own
// UpdateCall. The LiveKit round trip happens after the lock is released: it is a
// network call, and holding the lock across it would block every other
// operation on that call.
func (p *Plugin) publishCallRoomMetadata(channelID string) error {
	data, err := func() ([]byte, error) {
		state, err := p.lockCallReturnState(channelID)
		if err != nil {
			return nil, fmt.Errorf("failed to lock call: %w", err)
		}
		defer p.unlockCall(channelID)

		if state == nil {
			// The call ended while the publish was queued. The room is gone with
			// it, so there is nothing to update.
			return nil, nil
		}

		if !anyConfirmedSession(state.sessions) {
			// The call exists but nobody has connected, so neither has the room:
			// the token endpoint settles the host before the first client dials
			// in. The room_started webhook marks the call dirty again once
			// LiveKit has a room to update.
			return nil, nil
		}

		return json.Marshal(newCallRoomMetadata(state))
	}()
	if err != nil {
		return err
	}
	if data == nil {
		return nil
	}

	return p.livekitUpdateRoomMetadata(channelID, string(data))
}

// waitForPublisher gives the metadata publisher a bounded window to exit on
// deactivation, so it is not left reading from a store that is about to close.
// It can be mid-lock-acquisition, hence the timeout rather than an open-ended
// wait.
func (p *Plugin) waitForPublisher(timeout time.Duration) {
	done := make(chan struct{})
	go func() {
		p.publisherWg.Wait()
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(timeout):
		p.LogWarn("timed out waiting for room metadata publisher to exit")
	}
}
