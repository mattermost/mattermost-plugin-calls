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
