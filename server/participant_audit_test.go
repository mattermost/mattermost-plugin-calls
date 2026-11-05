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

	require.NoError(t, store.RecordParticipantJoin(callID, public.IdentityTypeUser, left, 1000))
	require.NoError(t, store.RecordParticipantJoin(callID, public.IdentityTypeUser, present, 1500))
	require.NoError(t, store.RecordParticipantLeave(callID, public.IdentityTypeUser, left, 4000))

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
	require.NoError(t, store.RecordParticipantJoin(callID, public.IdentityTypeUser, u1, 1000))

	p.recordLeaveBackstop(&public.Call{ID: callID, EndAt: 0})

	got, err := store.GetParticipantsForCalls([]string{callID}, db.GetCallOpts{FromWriter: true})
	require.NoError(t, err)
	require.Equal(t, int64(0), got[callID][u1].LastLeaveAt, "a live call must not have leaves backstopped")
}

// TestRecordScreenShareBackstop is the durability guarantee for screen-share stop
// times: when a call ends, every share segment has a non-zero stop time even if
// the stop was never recorded (crash mid-share, a missed webhook, or a sharer
// still sharing at call end). A precisely-recorded stop is left untouched.
func TestRecordScreenShareBackstop(t *testing.T) {
	store, tearDown := NewTestStore(t)
	defer tearDown()

	p := &Plugin{
		MattermostPlugin: plugin.MattermostPlugin{API: &pluginMocks.MockAPI{}},
		store:            store,
	}

	callID := model.NewId()
	stopped := model.NewId() // stopped sharing normally, precise stop recorded
	open := model.NewId()    // still sharing when the call ended

	stoppedSession := model.NewId()
	openSession := model.NewId()
	require.NoError(t, store.RecordScreenShareStart(callID, stopped, stoppedSession, 1000))
	require.NoError(t, store.RecordScreenShareStart(callID, open, openSession, 1500))
	require.NoError(t, store.RecordScreenShareStop(callID, stoppedSession, 4000))

	const endAt = 9000
	p.recordScreenShareBackstop(&public.Call{ID: callID, EndAt: endAt})

	got, err := store.GetScreenSharesForCalls([]string{callID}, db.GetCallOpts{FromWriter: true})
	require.NoError(t, err)

	byUser := map[string]*public.CallScreenShare{}
	for _, ss := range got[callID] {
		byUser[ss.UserID] = ss
	}
	require.Equal(t, int64(4000), byUser[stopped].StopAt, "precise stop preserved")
	require.Equal(t, int64(endAt), byUser[open].StopAt, "open share gets the call end time")
}

// TestRecordScreenShareBackstopNoEnd guards against closing segments on a call
// that has not actually ended (EndAt == 0).
func TestRecordScreenShareBackstopNoEnd(t *testing.T) {
	store, tearDown := NewTestStore(t)
	defer tearDown()

	p := &Plugin{
		MattermostPlugin: plugin.MattermostPlugin{API: &pluginMocks.MockAPI{}},
		store:            store,
	}

	callID := model.NewId()
	require.NoError(t, store.RecordScreenShareStart(callID, model.NewId(), model.NewId(), 1000))

	p.recordScreenShareBackstop(&public.Call{ID: callID, EndAt: 0})

	got, err := store.GetScreenSharesForCalls([]string{callID}, db.GetCallOpts{FromWriter: true})
	require.NoError(t, err)
	require.Equal(t, int64(0), got[callID][0].StopAt, "a live call must not have shares backstopped")
}
