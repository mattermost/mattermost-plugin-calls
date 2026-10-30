// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestDMNoAnswerTimer(t *testing.T) {
	// The timer helpers only touch the map, its mutex and time.AfterFunc, so a bare Plugin is
	// enough. Timers are left at the default dmNoAnswerTimeout and never allowed to fire: doing so
	// would run handleDMNoAnswer against a nil API and store, panicking in a background goroutine
	// and taking the whole test binary down. Hence the cleanup below.
	newPlugin := func(t *testing.T) *Plugin {
		t.Helper()

		p := &Plugin{
			dmNoAnswerTimers: map[string]*time.Timer{},
		}

		t.Cleanup(func() {
			p.dmNoAnswerTimersMut.Lock()
			defer p.dmNoAnswerTimersMut.Unlock()
			for _, timer := range p.dmNoAnswerTimers {
				timer.Stop()
			}
		})

		return p
	}

	t.Run("start arms a timer for the channel", func(t *testing.T) {
		p := newPlugin(t)

		p.startDMNoAnswerTimer("channel-id", "call-id")

		require.Contains(t, p.dmNoAnswerTimers, "channel-id")
	})

	t.Run("cancel stops the timer and drops the entry", func(t *testing.T) {
		p := newPlugin(t)
		p.startDMNoAnswerTimer("channel-id", "call-id")

		require.True(t, p.cancelDMNoAnswerTimer("channel-id"))
		require.NotContains(t, p.dmNoAnswerTimers, "channel-id")
	})

	t.Run("cancel reports false when no timer is armed", func(t *testing.T) {
		p := newPlugin(t)

		require.False(t, p.cancelDMNoAnswerTimer("channel-id"))
	})

	t.Run("cancel is idempotent", func(t *testing.T) {
		p := newPlugin(t)
		p.startDMNoAnswerTimer("channel-id", "call-id")

		require.True(t, p.cancelDMNoAnswerTimer("channel-id"))
		require.False(t, p.cancelDMNoAnswerTimer("channel-id"))
	})

	t.Run("a timer left armed suppresses the next call's deadline in the same channel", func(t *testing.T) {
		// This is why every call-end path has to cancel. A timer left behind by a previous call
		// makes start a silent no-op, so the next call in that channel rings with no deadline at
		// all, while the stale timer itself does nothing once it fires (handleDMNoAnswer bails on
		// the callID mismatch).
		p := newPlugin(t)
		p.startDMNoAnswerTimer("channel-id", "call-id")
		stale := p.dmNoAnswerTimers["channel-id"]

		p.startDMNoAnswerTimer("channel-id", "other-call-id")
		require.Same(t, stale, p.dmNoAnswerTimers["channel-id"])

		// Cancelling on the way out of the first call leaves the channel free to arm its own.
		require.True(t, p.cancelDMNoAnswerTimer("channel-id"))
		p.startDMNoAnswerTimer("channel-id", "other-call-id")
		require.NotSame(t, stale, p.dmNoAnswerTimers["channel-id"])
	})

	t.Run("timers are tracked per channel", func(t *testing.T) {
		p := newPlugin(t)
		p.startDMNoAnswerTimer("channel-id", "call-id")
		p.startDMNoAnswerTimer("other-channel-id", "other-call-id")

		require.True(t, p.cancelDMNoAnswerTimer("channel-id"))

		require.NotContains(t, p.dmNoAnswerTimers, "channel-id")
		require.Contains(t, p.dmNoAnswerTimers, "other-channel-id")
	})
}

func TestSIPNoAnswerTimer(t *testing.T) {
	// As in TestDMNoAnswerTimer, timers stay at their defaults and are stopped
	// before they can fire against a nil API and store.
	newPlugin := func(t *testing.T) *Plugin {
		t.Helper()

		p := &Plugin{
			sipNoAnswerTimers: map[string]*sipNoAnswerTimer{},
		}

		t.Cleanup(func() {
			p.sipNoAnswerTimersMut.Lock()
			defer p.sipNoAnswerTimersMut.Unlock()
			for _, entry := range p.sipNoAnswerTimers {
				entry.timer.Stop()
			}
		})

		return p
	}

	t.Run("start is a no-op for a call that already has a timer", func(t *testing.T) {
		p := newPlugin(t)
		p.startSIPNoAnswerTimer("channel-id", "call-id")
		first := p.sipNoAnswerTimers["channel-id"]

		p.startSIPNoAnswerTimer("channel-id", "call-id")

		require.Same(t, first, p.sipNoAnswerTimers["channel-id"])
	})

	t.Run("start replaces a timer left over from an earlier call", func(t *testing.T) {
		p := newPlugin(t)
		p.startSIPNoAnswerTimer("channel-id", "call-id")
		stale := p.sipNoAnswerTimers["channel-id"]

		p.startSIPNoAnswerTimer("channel-id", "other-call-id")

		require.NotSame(t, stale, p.sipNoAnswerTimers["channel-id"])
		require.Equal(t, "other-call-id", p.sipNoAnswerTimers["channel-id"].callID)
		require.False(t, stale.timer.Stop(), "the stale timer should already be stopped")
	})

	t.Run("a replaced timer can neither clear nor re-arm the current one", func(t *testing.T) {
		p := newPlugin(t)
		p.startSIPNoAnswerTimer("channel-id", "call-id")
		stale := p.sipNoAnswerTimers["channel-id"]
		p.startSIPNoAnswerTimer("channel-id", "other-call-id")
		current := p.sipNoAnswerTimers["channel-id"]
		staleTimer := stale.timer

		p.clearSIPNoAnswerTimer("channel-id", stale)
		p.retrySIPNoAnswerTimer("channel-id", stale)

		require.Same(t, current, p.sipNoAnswerTimers["channel-id"])
		require.Same(t, staleTimer, stale.timer)
	})

	t.Run("retry re-arms the current timer", func(t *testing.T) {
		p := newPlugin(t)
		p.startSIPNoAnswerTimer("channel-id", "call-id")
		entry := p.sipNoAnswerTimers["channel-id"]
		fired := entry.timer
		fired.Stop()

		p.retrySIPNoAnswerTimer("channel-id", entry)

		require.Same(t, entry, p.sipNoAnswerTimers["channel-id"])
		require.NotSame(t, fired, entry.timer)
	})

	t.Run("a cancelled timer is not re-armed", func(t *testing.T) {
		p := newPlugin(t)
		p.startSIPNoAnswerTimer("channel-id", "call-id")
		entry := p.sipNoAnswerTimers["channel-id"]
		require.True(t, p.cancelSIPNoAnswerTimer("channel-id"))

		p.retrySIPNoAnswerTimer("channel-id", entry)

		require.NotContains(t, p.sipNoAnswerTimers, "channel-id")
	})
}
