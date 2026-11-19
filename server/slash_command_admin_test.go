// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"errors"
	"testing"
	"time"

	"github.com/mattermost/mattermost-plugin-calls/server/db"
	"github.com/mattermost/mattermost-plugin-calls/server/enterprise"
	"github.com/mattermost/mattermost-plugin-calls/server/public"

	serverMocks "github.com/mattermost/mattermost-plugin-calls/server/mocks/github.com/mattermost/mattermost-plugin-calls/server/interfaces"
	pluginMocks "github.com/mattermost/mattermost-plugin-calls/server/mocks/github.com/mattermost/mattermost/server/public/plugin"

	"github.com/mattermost/mattermost/server/public/model"
	rtcd "github.com/mattermost/rtcd/service"

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

	t.Run("end-all with no calls", func(t *testing.T) {
		resp, err := p.handleEndAllCommand(&model.CommandArgs{UserId: adminID})
		require.NoError(t, err)
		assert.Equal(t, "Ended 0 call(s).", resp.Text)
	})

	t.Run("end-all returns early when clients leave during the grace period", func(t *testing.T) {
		defer ResetTestStore(t, p.store)
		call := newCall(t)

		prev := endAllGracePeriod
		endAllGracePeriod = 10 * time.Second
		defer func() { endAllGracePeriod = prev }()

		// Simulate the clients leaving on their own once they get call_end: wait for the
		// event to be published rather than sleeping, so the order is deterministic.
		published := make(chan struct{}, 1)
		mockAPI.ExpectedCalls = filterCalls(mockAPI.ExpectedCalls, "PublishWebSocketEvent")
		mockAPI.On("PublishWebSocketEvent", mock.Anything, mock.Anything, mock.Anything).Run(func(mock.Arguments) {
			select {
			case published <- struct{}{}:
			default:
			}
		}).Maybe()

		go func() {
			select {
			case <-published:
			case <-time.After(5 * time.Second):
				return
			}
			state, err := p.lockCallReturnState(call.ChannelID)
			if err == nil && state != nil {
				_ = p.cleanCallState(&state.Call)
			}
			p.unlockCall(call.ChannelID)
		}()

		start := time.Now()
		resp, err := p.handleEndAllCommand(&model.CommandArgs{UserId: adminID})
		require.NoError(t, err)
		assert.Less(t, time.Since(start), 5*time.Second)
		assert.Contains(t, resp.Text, "Ended 1 call(s)")
		assert.Contains(t, resp.Text, call.ChannelID)
	})

	t.Run("end-all fails a call if its RTC session close fails on a reachable RTCD host", func(t *testing.T) {
		defer ResetTestStore(t, p.store)
		call := newCall(t)
		setRTCDHost(t, p, call, "127.0.0.1")

		client := &serverMocks.MockRTCDClient{}
		client.On("Send", mock.Anything).Return(errors.New("send failed"))
		client.On("GetVersionInfo").Return(rtcd.VersionInfo{}, nil)
		p.rtcdManager = &rtcdClientManager{ctx: p, hosts: map[string]*rtcdHost{"127.0.0.1": {client: client}}}
		defer func() { p.rtcdManager = nil }()

		resp, err := p.handleEndAllCommand(&model.CommandArgs{UserId: adminID})
		require.NoError(t, err)
		assert.Contains(t, resp.Text, "Ended 0 call(s)")
		assert.Contains(t, resp.Text, "Failed to end 1 call(s)")
		assert.Contains(t, resp.Text, call.ChannelID)

		// The call must still be active so that end-all can be retried.
		active, err := p.store.GetAllActiveCalls(db.GetCallOpts{FromWriter: true})
		require.NoError(t, err)
		require.Len(t, active, 1)
		sessions, err := p.store.GetCallSessions(call.ID, db.GetCallSessionOpts{FromWriter: true})
		require.NoError(t, err)
		assert.Len(t, sessions, 1)
	})

	t.Run("end-all cleans up a call whose RTCD host is unreachable", func(t *testing.T) {
		defer ResetTestStore(t, p.store)
		call := newCall(t)
		setRTCDHost(t, p, call, "127.0.0.1")

		client := &serverMocks.MockRTCDClient{}
		client.On("Send", mock.Anything).Return(errors.New("send failed"))
		client.On("GetVersionInfo").Return(rtcd.VersionInfo{}, errors.New("unreachable"))
		p.rtcdManager = &rtcdClientManager{ctx: p, hosts: map[string]*rtcdHost{"127.0.0.1": {client: client}}}
		defer func() { p.rtcdManager = nil }()

		resp, err := p.handleEndAllCommand(&model.CommandArgs{UserId: adminID})
		require.NoError(t, err)
		assert.Contains(t, resp.Text, "Ended 1 call(s)")
		assert.Contains(t, resp.Text, "RTCD host unreachable for 1 call(s)")
		assert.NotContains(t, resp.Text, "Failed")

		active, err := p.store.GetAllActiveCalls(db.GetCallOpts{FromWriter: true})
		require.NoError(t, err)
		assert.Empty(t, active)
	})

	t.Run("isRTCDHostGone", func(t *testing.T) {
		assert.False(t, p.isRTCDHostGone("127.0.0.1"), "no RTCD manager")

		p.rtcdManager = &rtcdClientManager{ctx: p, hosts: map[string]*rtcdHost{}}
		defer func() { p.rtcdManager = nil }()
		assert.False(t, p.isRTCDHostGone(""), "embedded RTC (no host)")
		assert.True(t, p.isRTCDHostGone("10.0.0.1"), "no client for host")
	})

	t.Run("describeCall uses channel and team names", func(t *testing.T) {
		defer ResetTestStore(t, p.store)
		call := newCall(t)
		teamID := model.NewId()
		mockAPI.ExpectedCalls = filterCalls(mockAPI.ExpectedCalls, "GetChannel")
		mockAPI.On("GetChannel", call.ChannelID).Return(&model.Channel{Id: call.ChannelID, DisplayName: "Town Square", TeamId: teamID}, nil)
		mockAPI.On("GetTeam", teamID).Return(&model.Team{Id: teamID, Name: "ad-1"}, nil)

		desc := p.describeCall(call)
		assert.Contains(t, desc, "Town Square")
		assert.Contains(t, desc, "ad-1")
		assert.Contains(t, desc, "| 1 |")
	})

	t.Run("commands are dispatched by ExecuteCommand", func(t *testing.T) {
		for _, cmd := range []string{"list-all", "end-all"} {
			resp, appErr := p.ExecuteCommand(nil, &model.CommandArgs{Command: "/call " + cmd, UserId: userID})
			require.Nil(t, appErr)
			assert.Equal(t, "Error: "+errAdminOnlyCommand.Error(), resp.Text)
		}

		resp, appErr := p.ExecuteCommand(nil, &model.CommandArgs{Command: "/call list-all", UserId: adminID})
		require.Nil(t, appErr)
		assert.Equal(t, "No active calls.", resp.Text)

		resp, appErr = p.ExecuteCommand(nil, &model.CommandArgs{Command: "/call end-all", UserId: adminID})
		require.Nil(t, appErr)
		assert.Equal(t, "Ended 0 call(s).", resp.Text)
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

// setRTCDHost marks an existing call as hosted on the given RTCD host.
func setRTCDHost(t *testing.T, p *Plugin, call *public.Call, host string) {
	t.Helper()
	call.Props.RTCDHost = host
	require.NoError(t, p.store.UpdateCall(call))
}

func filterCalls(calls []*mock.Call, method string) []*mock.Call {
	var out []*mock.Call
	for _, c := range calls {
		if c.Method != method {
			out = append(out, c)
		}
	}
	return out
}

func TestAdminCommandsAutocomplete(t *testing.T) {
	mockAPI := &pluginMocks.MockAPI{}
	mockAPI.On("GetLicense").Return(&model.License{SkuShortName: "starter"})
	mockAPI.On("GetConfig").Return(&model.Config{})
	p := &Plugin{licenseChecker: enterprise.NewLicenseChecker(mockAPI)}

	data := p.getAutocompleteData()
	var triggers []string
	for _, c := range data.SubCommands {
		triggers = append(triggers, c.Trigger)
	}
	assert.Contains(t, triggers, listAllCommandTrigger)
	assert.Contains(t, triggers, endAllCommandTrigger)
}

func TestAdminCallCommandsStoreErrors(t *testing.T) {
	p, mockAPI, mockMetrics := newDMTimerTestPlugin(t)
	mockMetrics.On("IncWebSocketEvent", mock.Anything, mock.Anything).Maybe()

	adminID := model.NewId()
	mockAPI.On("HasPermissionTo", adminID, model.PermissionManageSystem).Return(true)
	mockAPI.On("GetChannel", mock.Anything).Return(nil, &model.AppError{Message: "nope"}).Maybe()
	mockAPI.On("KVDelete", mock.Anything).Return(nil).Maybe()

	call := &public.Call{ID: model.NewId(), ChannelID: model.NewId()}
	c := &callToEnd{callID: call.ID, channelID: call.ChannelID}

	// Closing the DB makes every store call fail.
	require.NoError(t, p.store.Close())

	t.Run("list-all", func(t *testing.T) {
		_, err := p.handleListAllCommand(&model.CommandArgs{UserId: adminID})
		require.Error(t, err)
		assert.Contains(t, err.Error(), "failed to get active calls")
	})

	t.Run("end-all", func(t *testing.T) {
		_, err := p.handleEndAllCommand(&model.CommandArgs{UserId: adminID})
		require.Error(t, err)
		assert.Contains(t, err.Error(), "failed to get active calls")
	})

	t.Run("participant count", func(t *testing.T) {
		_, err := p.activeParticipantCount(call)
		require.Error(t, err)
		assert.Contains(t, p.describeCall(call), "| ? |")
	})

	t.Run("isCallActive", func(t *testing.T) {
		active, err := p.isCallActive(c)
		require.Error(t, err)
		assert.False(t, active)
	})

	t.Run("forceEndCall", func(t *testing.T) {
		require.Error(t, p.forceEndCall(c))
	})

	t.Run("notifyCallEnd", func(t *testing.T) {
		_, err := p.notifyCallEnd(call.ChannelID)
		require.Error(t, err)
	})
}
