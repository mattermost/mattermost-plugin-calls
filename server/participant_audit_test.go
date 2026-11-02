// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"testing"

	"github.com/mattermost/mattermost-plugin-calls/server/db"
	"github.com/mattermost/mattermost-plugin-calls/server/public"

	pluginMocks "github.com/mattermost/mattermost-plugin-calls/server/mocks/github.com/mattermost/mattermost/server/public/plugin"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/plugin"

	"github.com/stretchr/testify/require"
)

// TestRecordLeaveBackstop is the durability guarantee for leave times: when a call
// ends, every attendee has a non-zero leave time even if their individual leave was
// never recorded (server crash mid-call, a missed webhook, a failed write). The
// backstop stamps the call's end time for anyone still at zero, while leaving a
// precisely-recorded leave untouched.
func TestRecordLeaveBackstop(t *testing.T) {
	store, tearDown := NewTestStore(t)
	defer tearDown()

	p := &Plugin{
		MattermostPlugin: plugin.MattermostPlugin{API: &pluginMocks.MockAPI{}},
		store:            store,
	}

	callID := model.NewId()
	left := model.NewId()    // left normally, precise leave recorded
	present := model.NewId() // still in the call when it ended (no leave recorded)

	require.NoError(t, store.RecordParticipantJoin(callID, left, 1000))
	require.NoError(t, store.RecordParticipantJoin(callID, present, 1500))
	require.NoError(t, store.RecordParticipantLeave(callID, left, 4000))

	const endAt = 9000
	p.recordLeaveBackstop(&public.Call{ID: callID, EndAt: endAt})

	got, err := store.GetParticipantsForCalls([]string{callID}, db.GetCallOpts{FromWriter: true})
	require.NoError(t, err)

	// Precise leave is preserved; it must not be overwritten by the backstop.
	require.Equal(t, int64(4000), got[callID][left].LastLeaveAt)
	// The still-present attendee gets the call's end time, not a zero/blank leave.
	require.Equal(t, int64(endAt), got[callID][present].LastLeaveAt)
	// First joins are untouched.
	require.Equal(t, int64(1000), got[callID][left].FirstJoinAt)
	require.Equal(t, int64(1500), got[callID][present].FirstJoinAt)
}

// TestRecordLeaveBackstopNoEnd guards against stamping leaves on a call that has
// not actually ended (EndAt == 0), which would corrupt live attendance.
func TestRecordLeaveBackstopNoEnd(t *testing.T) {
	store, tearDown := NewTestStore(t)
	defer tearDown()

	p := &Plugin{
		MattermostPlugin: plugin.MattermostPlugin{API: &pluginMocks.MockAPI{}},
		store:            store,
	}

	callID := model.NewId()
	u1 := model.NewId()
	require.NoError(t, store.RecordParticipantJoin(callID, u1, 1000))

	p.recordLeaveBackstop(&public.Call{ID: callID, EndAt: 0})

	got, err := store.GetParticipantsForCalls([]string{callID}, db.GetCallOpts{FromWriter: true})
	require.NoError(t, err)
	require.Equal(t, int64(0), got[callID][u1].LastLeaveAt, "a live call must not have leaves backstopped")
}
