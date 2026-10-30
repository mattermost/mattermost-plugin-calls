// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"testing"
	"time"

	"github.com/mattermost/mattermost-plugin-calls/server/db"

	pluginMocks "github.com/mattermost/mattermost-plugin-calls/server/mocks/github.com/mattermost/mattermost/server/public/plugin"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/plugin"

	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
)

// TestParticipantAuditWorker exercises the async path end to end against a real
// store: enqueue join/leave, flush on shutdown, assert the durable rows.
func TestParticipantAuditWorker(t *testing.T) {
	store, tearDown := NewTestStore(t)
	defer tearDown()

	botID := model.NewId()
	mockAPI := &pluginMocks.MockAPI{}
	p := &Plugin{
		MattermostPlugin: plugin.MattermostPlugin{API: mockAPI},
		store:            store,
		botID:            botID,
		stopCh:           make(chan struct{}),
		auditCh:          make(chan participantAuditEvent, 16),
	}

	p.auditWg.Add(1)
	go p.participantAuditWorker()

	callID := model.NewId()
	u1 := model.NewId()

	p.enqueueParticipantAuditEvent(auditEventJoin, callID, u1, 1000)
	p.enqueueParticipantAuditEvent(auditEventLeave, callID, u1, 2000)
	p.enqueueParticipantAuditEvent(auditEventJoin, callID, botID, 1500) // bot must be skipped

	// Shut the worker down; it drains the queue before returning.
	close(p.stopCh)
	p.auditWg.Wait()

	got, err := store.GetParticipantsForCalls([]string{callID}, db.GetCallOpts{FromWriter: true})
	require.NoError(t, err)

	require.NotNil(t, got[callID][u1])
	require.Equal(t, int64(1000), got[callID][u1].FirstJoinAt)
	require.Equal(t, int64(2000), got[callID][u1].LastLeaveAt)
	require.Nil(t, got[callID][botID], "bot must not be recorded as an attendee")
}

// TestEnqueueParticipantAuditEvent covers the two properties that protect the
// call hot path: the bot is never enqueued, and a full queue drops the event
// instead of blocking the caller (which would hold the call lock).
func TestEnqueueParticipantAuditEvent(t *testing.T) {
	botID := model.NewId()
	mockAPI := &pluginMocks.MockAPI{}
	// Allow (but don't require) the drop warning. The LogWarn wrapper prepends
	// "origin", <origin> to the key/value pairs, so the API receives 9 args.
	mockAPI.On("LogWarn",
		mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything,
		mock.Anything, mock.Anything, mock.Anything, mock.Anything).Maybe()

	p := &Plugin{
		MattermostPlugin: plugin.MattermostPlugin{API: mockAPI},
		botID:            botID,
		auditCh:          make(chan participantAuditEvent, 1),
	}

	t.Run("bot is skipped", func(t *testing.T) {
		p.enqueueParticipantAuditEvent(auditEventJoin, model.NewId(), botID, 1)
		require.Len(t, p.auditCh, 0)
	})

	t.Run("event is enqueued", func(t *testing.T) {
		p.enqueueParticipantAuditEvent(auditEventJoin, model.NewId(), model.NewId(), 1)
		require.Len(t, p.auditCh, 1)
	})

	t.Run("full queue drops without blocking", func(t *testing.T) {
		// Queue (cap 1) is already full from the previous subtest.
		done := make(chan struct{})
		go func() {
			p.enqueueParticipantAuditEvent(auditEventJoin, model.NewId(), model.NewId(), 1)
			close(done)
		}()
		select {
		case <-done:
			// returned immediately — did not block
		case <-time.After(2 * time.Second):
			t.Fatal("enqueue blocked on a full queue")
		}
		require.Len(t, p.auditCh, 1) // unchanged; event was dropped
	})
}
