// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"testing"
	"time"

	"github.com/mattermost/mattermost-plugin-calls/server/cluster"
	"github.com/mattermost/mattermost-plugin-calls/server/db"
	"github.com/mattermost/mattermost-plugin-calls/server/enterprise"

	serverMocks "github.com/mattermost/mattermost-plugin-calls/server/mocks/github.com/mattermost/mattermost-plugin-calls/server/interfaces"
	pluginMocks "github.com/mattermost/mattermost-plugin-calls/server/mocks/github.com/mattermost/mattermost/server/public/plugin"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/plugin"

	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
)

// A caller who cancels a phone call before LiveKit confirms their session must
// still be able to end it, or a redial is rejected as call_in_progress.
func TestHostEndPendingPhoneCall(t *testing.T) {
	mockAPI := &pluginMocks.MockAPI{}
	mockMetrics := &serverMocks.MockMetrics{}

	store, tearDown := NewTestStore(t)
	t.Cleanup(tearDown)

	cfg := &configuration{}
	cfg.SetDefaults()
	cfg.DefaultEnabled = model.NewPointer(true)

	p := &Plugin{
		MattermostPlugin:  plugin.MattermostPlugin{API: mockAPI},
		metrics:           mockMetrics,
		callsClusterLocks: map[string]*cluster.Mutex{},
		store:             store,
		nodeID:            "test-node",
		botID:             model.NewId(),
		configuration:     cfg, // no LiveKit URL: livekitDeleteRoom is a no-op
		dirtyCalls:        map[string]struct{}{},
		dirtyCallsCh:      make(chan struct{}, 1),
		dmNoAnswerTimers:  map[string]*time.Timer{},
		sipNoAnswerTimers: map[string]*time.Timer{},
	}
	p.licenseChecker = enterprise.NewLicenseChecker(p.API)

	mockMetrics.On("ObserveAppHandlersTime", mock.Anything, mock.AnythingOfType("float64")).Maybe()
	mockMetrics.On("ObserveClusterMutexGrabTime", mock.Anything, mock.AnythingOfType("float64")).Maybe()
	mockMetrics.On("ObserveClusterMutexLockedTime", mock.Anything, mock.AnythingOfType("float64")).Maybe()
	mockMetrics.On("IncWebSocketEvent", mock.Anything, mock.Anything).Maybe()
	mockAPI.On("GetConfig").Return(&model.Config{}, nil).Maybe()
	mockAPI.On("GetLicense").Return(&model.License{SkuShortName: "enterprise"}, nil).Maybe()
	mockAPI.On("KVSetWithOptions", mock.Anything, mock.Anything, mock.Anything).Return(true, nil).Maybe()
	mockAPI.On("KVDelete", mock.Anything).Return(nil).Maybe()
	mockAPI.On("PublishWebSocketEvent", mock.AnythingOfType("string"), mock.Anything,
		mock.AnythingOfType("*model.WebsocketBroadcast")).Maybe()
	// Not an admin, so hostEnd can only pass on the host check.
	mockAPI.On("HasPermissionTo", mock.AnythingOfType("string"), model.PermissionManageSystem).Return(false).Maybe()
	for _, method := range []string{"LogDebug", "LogInfo", "LogWarn", "LogError"} {
		for n := 1; n <= 20; n++ {
			args := make([]any, n)
			for i := range args {
				args[i] = mock.Anything
			}
			mockAPI.On(method, args...).Maybe()
		}
	}

	channelID := model.NewId()
	userID := model.NewId()
	sessionID := model.NewId()

	// As handlePhoneCall does: add the caller's session, unconfirmed, then start
	// the SIP no-answer timer.
	state, err := p.lockCallReturnState(channelID)
	require.NoError(t, err)
	state, err = p.addUserSession(state, nil, userID, sessionID, channelID, "", "", model.ChannelTypeDirect)
	p.unlockCall(channelID)
	require.NoError(t, err)
	require.Zero(t, state.sessions[sessionID].ConfirmedAt)
	callID := state.Call.ID
	p.startSIPNoAnswerTimer(channelID, callID)

	require.NoError(t, p.hostEnd(userID, channelID))

	_, err = store.GetActiveCallByChannelID(channelID, db.GetCallOpts{FromWriter: true})
	require.ErrorIs(t, err, db.ErrNotFound)

	sessions, err := store.GetCallSessions(callID, db.GetCallSessionOpts{FromWriter: true})
	require.NoError(t, err)
	require.Empty(t, sessions)

	// A redial right away starts its own timer, which a leftover one would block.
	require.False(t, p.cancelSIPNoAnswerTimer(channelID), "hostEnd should cancel the SIP no-answer timer")
}
