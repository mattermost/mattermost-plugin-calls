// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"testing"
	"time"

	"github.com/mattermost/mattermost-plugin-calls/server/db"
	"github.com/mattermost/mattermost-plugin-calls/server/public"

	"github.com/mattermost/mattermost/server/public/model"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
)

func TestAdminCallCommands(t *testing.T) {
	p, mockAPI, mockMetrics := newDMTimerTestPlugin(t)
	mockMetrics.On("IncWebSocketEvent", mock.Anything, mock.Anything).Maybe()

	prev := endAllGracePeriod
	endAllGracePeriod = 500 * time.Millisecond
	t.Cleanup(func() { endAllGracePeriod = prev })

	adminID := model.NewId()
	userID := model.NewId()
	mockAPI.On("HasPermissionTo", adminID, model.PermissionManageSystem).Return(true)
	mockAPI.On("HasPermissionTo", userID, model.PermissionManageSystem).Return(false)
	mockAPI.On("GetChannel", mock.Anything).Return(nil, &model.AppError{Message: "nope"}).Maybe()
	mockAPI.On("GetPost", mock.Anything).Return(nil, &model.AppError{Message: "nope"}).Maybe()
	mockAPI.On("KVDelete", mock.Anything).Return(nil).Maybe()
	mockAPI.On("PublishWebSocketEvent", mock.Anything, mock.Anything, mock.Anything).Maybe()

	newCall := func(t *testing.T) *public.Call {
		t.Helper()
		call := &public.Call{
			ID:        model.NewId(),
			CreateAt:  time.Now().UnixMilli(),
			ChannelID: model.NewId(),
			StartAt:   time.Now().UnixMilli(),
			PostID:    model.NewId(),
			ThreadID:  model.NewId(),
			OwnerID:   userID,
			Props:     public.CallProps{Participants: map[string]struct{}{userID: {}}},
		}
		require.NoError(t, p.store.CreateCall(call))
		require.NoError(t, p.store.CreateCallSession(&public.CallSession{
			ID: model.NewId(), CallID: call.ID, UserID: userID, JoinAt: time.Now().UnixMilli(),
		}))
		return call
	}

	t.Run("non-admins are rejected", func(t *testing.T) {
		call := newCall(t)
		defer ResetTestStore(t, p.store)

		_, err := p.handleListAllCommand(&model.CommandArgs{UserId: userID})
		require.ErrorIs(t, err, errAdminOnlyCommand)
		_, err = p.handleEndAllCommand(&model.CommandArgs{UserId: userID})
		require.ErrorIs(t, err, errAdminOnlyCommand)

		active, err := p.store.GetAllActiveCalls(db.GetCallOpts{FromWriter: true})
		require.NoError(t, err)
		require.Len(t, active, 1)
		assert.Equal(t, call.ID, active[0].ID)
	})

	t.Run("list-all spans channels", func(t *testing.T) {
		defer ResetTestStore(t, p.store)
		c1, c2 := newCall(t), newCall(t)

		resp, err := p.handleListAllCommand(&model.CommandArgs{UserId: adminID})
		require.NoError(t, err)
		assert.Contains(t, resp.Text, "2 active call(s)")
		assert.Contains(t, resp.Text, c1.ChannelID)
		assert.Contains(t, resp.Text, c2.ChannelID)
	})

	t.Run("list-all counts only current participants", func(t *testing.T) {
		defer ResetTestStore(t, p.store)
		call := newCall(t)
		// userID is in Props.Participants (and has a session); add a user who left.
		call.Props.Participants[model.NewId()] = struct{}{}
		require.NoError(t, p.store.UpdateCall(call))

		resp, err := p.handleListAllCommand(&model.CommandArgs{UserId: adminID})
		require.NoError(t, err)
		assert.Contains(t, resp.Text, "| 1 |")
	})

	t.Run("cleanup waits for sessions that joined after the first close", func(t *testing.T) {
		defer ResetTestStore(t, p.store)
		call := newCall(t)
		c := &callToEnd{callID: call.ID, channelID: call.ChannelID}

		sessions, err := p.store.GetCallSessions(call.ID, db.GetCallSessionOpts{FromWriter: true})
		require.NoError(t, err)
		closed := map[string]struct{}{}
		for id := range sessions {
			closed[id] = struct{}{}
		}

		// A session joins after the snapshot: the call must not be cleaned up yet.
		late := model.NewId()
		require.NoError(t, p.store.CreateCallSession(&public.CallSession{
			ID: late, CallID: call.ID, UserID: model.NewId(), JoinAt: time.Now().UnixMilli(),
		}))
		done, err := p.cleanIfAllClosed(c, closed)
		require.NoError(t, err)
		assert.False(t, done)
		active, err := p.store.GetAllActiveCalls(db.GetCallOpts{FromWriter: true})
		require.NoError(t, err)
		assert.Len(t, active, 1)

		// Once it has been closed too, cleanup goes ahead.
		closed[late] = struct{}{}
		done, err = p.cleanIfAllClosed(c, closed)
		require.NoError(t, err)
		assert.True(t, done)
		active, err = p.store.GetAllActiveCalls(db.GetCallOpts{FromWriter: true})
		require.NoError(t, err)
		assert.Empty(t, active)
	})

	t.Run("list-all with no calls", func(t *testing.T) {
		resp, err := p.handleListAllCommand(&model.CommandArgs{UserId: adminID})
		require.NoError(t, err)
		assert.Equal(t, "No active calls.", resp.Text)
	})

	t.Run("end-all ends every call", func(t *testing.T) {
		defer ResetTestStore(t, p.store)
		c1, c2 := newCall(t), newCall(t)

		resp, err := p.handleEndAllCommand(&model.CommandArgs{UserId: adminID})
		require.NoError(t, err)
		assert.Contains(t, resp.Text, "Ended 2 call(s)")
		assert.Contains(t, resp.Text, c1.ChannelID)
		assert.Contains(t, resp.Text, c2.ChannelID)

		active, err := p.store.GetAllActiveCalls(db.GetCallOpts{FromWriter: true})
		require.NoError(t, err)
		assert.Empty(t, active)

		for _, c := range []*public.Call{c1, c2} {
			sessions, err := p.store.GetCallSessions(c.ID, db.GetCallSessionOpts{FromWriter: true})
			require.NoError(t, err)
			assert.Empty(t, sessions)
		}
	})
}
