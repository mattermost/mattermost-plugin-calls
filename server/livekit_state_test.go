// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/mattermost/mattermost-plugin-calls/server/cluster"
	"github.com/mattermost/mattermost-plugin-calls/server/public"

	serverMocks "github.com/mattermost/mattermost-plugin-calls/server/mocks/github.com/mattermost/mattermost-plugin-calls/server/interfaces"
	pluginMocks "github.com/mattermost/mattermost-plugin-calls/server/mocks/github.com/mattermost/mattermost/server/public/plugin"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/plugin"

	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
)

// setupStatePlugin builds a plugin wired to a real store, enough to exercise the
// dirty set and the metadata publisher. LiveKit is deliberately left
// unconfigured so a publish that reaches the network fails with a recognisable
// error rather than silently doing nothing.
func setupStatePlugin(t *testing.T) (*Plugin, *pluginMocks.MockAPI) {
	t.Helper()

	mockAPI := &pluginMocks.MockAPI{}
	mockMetrics := &serverMocks.MockMetrics{}

	store, tearDown := NewTestStore(t)
	t.Cleanup(tearDown)

	p := &Plugin{
		MattermostPlugin:  plugin.MattermostPlugin{API: mockAPI},
		metrics:           mockMetrics,
		callsClusterLocks: map[string]*cluster.Mutex{},
		store:             store,
		nodeID:            "test-node",
		dirtyCalls:        map[string]struct{}{},
		dirtyCallsCh:      make(chan struct{}, 1),
		stopCh:            make(chan struct{}),
	}

	cfg := &configuration{}
	cfg.SetDefaults()
	p.configuration = cfg

	mockMetrics.On("IncStoreOp", mock.Anything).Maybe()
	mockMetrics.On("ObserveStoreMethodsTime", mock.Anything, mock.AnythingOfType("float64")).Maybe()
	mockMetrics.On("IncWebSocketEvent", mock.Anything, mock.Anything).Maybe()
	mockMetrics.On("ObserveAppHandlersTime", mock.Anything, mock.AnythingOfType("float64")).Maybe()
	mockMetrics.On("ObserveClusterMutexGrabTime", mock.Anything, mock.AnythingOfType("float64")).Maybe()
	mockMetrics.On("ObserveClusterMutexLockedTime", mock.Anything, mock.AnythingOfType("float64")).Maybe()
	mockAPI.On("KVSetWithOptions", mock.Anything, mock.Anything, mock.Anything).Return(true, nil).Maybe()
	mockAPI.On("KVDelete", mock.Anything).Return(nil).Maybe()
	mockAPI.On("PublishWebSocketEvent", mock.Anything, mock.Anything, mock.Anything).Maybe()
	for _, method := range []string{"LogDebug", "LogInfo", "LogWarn", "LogError"} {
		for n := 1; n <= 20; n++ {
			args := make([]any, n)
			for i := range args {
				args[i] = mock.Anything
			}
			mockAPI.On(method, args...).Maybe()
		}
	}

	return p, mockAPI
}

// dirtySet returns a copy of the current dirty set.
func dirtySet(p *Plugin) map[string]struct{} {
	p.dirtyCallsMut.Lock()
	defer p.dirtyCallsMut.Unlock()
	out := make(map[string]struct{}, len(p.dirtyCalls))
	for k := range p.dirtyCalls {
		out[k] = struct{}{}
	}
	return out
}

func TestNewCallRoomMetadata(t *testing.T) {
	t.Run("nil state", func(t *testing.T) {
		require.Nil(t, newCallRoomMetadata(nil))
	})

	t.Run("host only, jobs omitted", func(t *testing.T) {
		state := &callState{}
		state.Call.Props.Hosts = []string{"userA"}

		md := newCallRoomMetadata(state)
		require.Equal(t, "userA", md.HostID)
		require.Nil(t, md.Recording)
		require.Nil(t, md.Transcription)
		require.Nil(t, md.LiveCaptions)

		data, err := json.Marshal(md)
		require.NoError(t, err)
		require.JSONEq(t, `{"host_id":"userA"}`, string(data))
	})

	t.Run("no host serializes as empty, not omitted", func(t *testing.T) {
		// Clients need to be able to tell "nobody is host" from "the field was
		// not sent", since the latter would leave a stale host badge up.
		data, err := json.Marshal(newCallRoomMetadata(&callState{}))
		require.NoError(t, err)
		require.JSONEq(t, `{"host_id":""}`, string(data))
	})

	t.Run("jobs use the client shape", func(t *testing.T) {
		state := &callState{}
		state.Call.Props.Hosts = []string{"userA"}
		state.Recording = &public.CallJob{
			Type:    public.JobTypeRecording,
			InitAt:  100,
			StartAt: 200,
		}
		state.Transcription = &public.CallJob{
			Type:   public.JobTypeTranscribing,
			InitAt: 300,
			EndAt:  400,
			Props:  public.CallJobProps{Err: "boom"},
		}
		state.LiveCaptions = &public.CallJob{
			Type:   public.JobTypeCaptioning,
			InitAt: 500,
		}

		data, err := json.Marshal(newCallRoomMetadata(state))
		require.NoError(t, err)
		require.JSONEq(t, `{
			"host_id": "userA",
			"recording": {"type":"recording","init_at":100,"start_at":200,"end_at":0},
			"transcription": {"type":"transcribing","init_at":300,"start_at":0,"end_at":400,"err":"boom"},
			"live_captions": {"type":"captioning","init_at":500,"start_at":0,"end_at":0}
		}`, string(data))
	})
}

func TestMarkCallDirty(t *testing.T) {
	t.Run("deduplicates and wakes once", func(t *testing.T) {
		p := &Plugin{dirtyCalls: map[string]struct{}{}, dirtyCallsCh: make(chan struct{}, 1)}

		p.markCallDirty("channelA")
		p.markCallDirty("channelA")
		p.markCallDirty("channelB")

		require.Equal(t, map[string]struct{}{
			"channelA": {},
			"channelB": {},
		}, dirtySet(p))

		// A full doorbell must not block: a pending wakeup already covers every
		// mark made before it is serviced.
		require.Len(t, p.dirtyCallsCh, 1)
	})

	t.Run("lazily allocates the set", func(t *testing.T) {
		p := &Plugin{dirtyCallsCh: make(chan struct{}, 1)}
		p.markCallDirty("channelA")
		require.Equal(t, map[string]struct{}{"channelA": {}}, dirtySet(p))
	})

	t.Run("marks during a publish are not lost", func(t *testing.T) {
		p, _ := setupStatePlugin(t)

		p.markCallDirty("channelA")

		// publishDirtyCalls swaps the set before publishing, so a mark made while
		// it is working lands in the fresh set rather than being dropped with the
		// batch being drained.
		<-p.dirtyCallsCh
		p.dirtyCallsMut.Lock()
		p.dirtyCalls = map[string]struct{}{}
		p.dirtyCallsMut.Unlock()

		p.markCallDirty("channelB")
		require.Equal(t, map[string]struct{}{"channelB": {}}, dirtySet(p))
		require.Len(t, p.dirtyCallsCh, 1)
	})

	t.Run("publishDirtyCalls drains the set", func(t *testing.T) {
		p, _ := setupStatePlugin(t)

		// Neither channel has a call, so both publishes are no-ops. What matters
		// is that the set comes back empty.
		p.markCallDirty("channelA")
		p.markCallDirty("channelB")
		p.publishDirtyCalls()

		require.Empty(t, dirtySet(p))
	})
}

func TestSetCallHost(t *testing.T) {
	t.Run("assigns and marks dirty", func(t *testing.T) {
		p := &Plugin{dirtyCalls: map[string]struct{}{}, dirtyCallsCh: make(chan struct{}, 1)}
		state := &callState{}

		p.setCallHost(state, "channelA", "userA")

		require.Equal(t, []string{"userA"}, state.Call.Props.Hosts)
		require.Equal(t, map[string]struct{}{"channelA": {}}, dirtySet(p))
	})

	t.Run("empty host clears the list", func(t *testing.T) {
		p := &Plugin{dirtyCalls: map[string]struct{}{}, dirtyCallsCh: make(chan struct{}, 1)}
		state := &callState{}
		state.Call.Props.Hosts = []string{"userA"}

		p.setCallHost(state, "channelA", "")

		require.Nil(t, state.Call.Props.Hosts)
		require.Equal(t, "", state.Call.GetHostID())
		require.Equal(t, map[string]struct{}{"channelA": {}}, dirtySet(p))
	})
}

func TestCallJobDirtyMarking(t *testing.T) {
	validJob := func(callID string) *public.CallJob {
		return &public.CallJob{
			ID:        model.NewId(),
			CallID:    callID,
			Type:      public.JobTypeRecording,
			CreatorID: model.NewId(),
			InitAt:    time.Now().UnixMilli(),
		}
	}

	t.Run("createCallJob marks dirty", func(t *testing.T) {
		p, _ := setupStatePlugin(t)
		call := &public.Call{
			ID:        model.NewId(),
			CreateAt:  time.Now().UnixMilli(),
			StartAt:   time.Now().UnixMilli(),
			ChannelID: model.NewId(),
			OwnerID:   model.NewId(),
		}
		require.NoError(t, p.store.CreateCall(call))

		require.NoError(t, p.createCallJob(call.ChannelID, validJob(call.ID)))
		require.Equal(t, map[string]struct{}{call.ChannelID: {}}, dirtySet(p))
	})

	t.Run("updateCallJob marks dirty", func(t *testing.T) {
		p, _ := setupStatePlugin(t)
		call := &public.Call{
			ID:        model.NewId(),
			CreateAt:  time.Now().UnixMilli(),
			StartAt:   time.Now().UnixMilli(),
			ChannelID: model.NewId(),
			OwnerID:   model.NewId(),
		}
		require.NoError(t, p.store.CreateCall(call))

		job := validJob(call.ID)
		require.NoError(t, p.createCallJob(call.ChannelID, job))

		p.dirtyCallsMut.Lock()
		p.dirtyCalls = map[string]struct{}{}
		p.dirtyCallsMut.Unlock()

		job.StartAt = time.Now().UnixMilli()
		require.NoError(t, p.updateCallJob(call.ChannelID, job))
		require.Equal(t, map[string]struct{}{call.ChannelID: {}}, dirtySet(p))
	})

	t.Run("a failed write does not mark dirty", func(t *testing.T) {
		// Nothing was persisted, so there is nothing for the room to be told
		// about; marking would publish state that does not exist.
		p, _ := setupStatePlugin(t)

		require.Error(t, p.createCallJob("channelA", &public.CallJob{}))
		require.Empty(t, dirtySet(p))

		require.Error(t, p.updateCallJob("channelA", &public.CallJob{}))
		require.Empty(t, dirtySet(p))
	})
}

func TestPublishCallRoomMetadata(t *testing.T) {
	newCall := func(t *testing.T, p *Plugin, channelID string) *public.Call {
		t.Helper()
		call := &public.Call{
			ID:        model.NewId(),
			CreateAt:  time.Now().UnixMilli(),
			StartAt:   time.Now().UnixMilli(),
			ChannelID: channelID,
			OwnerID:   model.NewId(),
			Props:     public.CallProps{NodeID: "test-node"},
		}
		require.NoError(t, p.store.CreateCall(call))
		return call
	}

	t.Run("no call is a no-op", func(t *testing.T) {
		// The call ended while the publish sat queued.
		p, _ := setupStatePlugin(t)
		require.NoError(t, p.publishCallRoomMetadata(model.NewId()))
	})

	t.Run("no confirmed session is a no-op", func(t *testing.T) {
		// The token endpoint settles the host before the first client connects,
		// so there is no room to update yet. Publishing anyway would fail on
		// every single call start.
		p, _ := setupStatePlugin(t)
		channelID := model.NewId()
		call := newCall(t, p, channelID)
		require.NoError(t, p.store.CreateCallSession(&public.CallSession{
			ID:     model.NewId(),
			CallID: call.ID,
			UserID: model.NewId(),
			JoinAt: time.Now().UnixMilli(),
		}))

		require.NoError(t, p.publishCallRoomMetadata(channelID))
	})

	t.Run("a confirmed session publishes", func(t *testing.T) {
		p, _ := setupStatePlugin(t)
		channelID := model.NewId()
		call := newCall(t, p, channelID)
		require.NoError(t, p.store.CreateCallSession(&public.CallSession{
			ID:          model.NewId(),
			CallID:      call.ID,
			UserID:      model.NewId(),
			JoinAt:      time.Now().UnixMilli(),
			ConfirmedAt: time.Now().UnixMilli(),
		}))

		// LiveKit is unconfigured in tests, so reaching the client is how we know
		// both guards were passed.
		require.ErrorIs(t, p.publishCallRoomMetadata(channelID), errLiveKitNotConfigured)
	})
}

func TestConfirmedSessionCount(t *testing.T) {
	require.Zero(t, confirmedSessionCount(nil))
	require.Zero(t, confirmedSessionCount(map[string]*public.CallSession{
		"a": {ConfirmedAt: 0},
	}))
	require.Equal(t, 1, confirmedSessionCount(map[string]*public.CallSession{
		"a": {ConfirmedAt: 0},
		"b": {ConfirmedAt: 1},
	}))
	require.Equal(t, 2, confirmedSessionCount(map[string]*public.CallSession{
		"a": {ConfirmedAt: 1},
		"b": {ConfirmedAt: 2},
	}))
}

func TestMarkCallDirtyOnFirstParticipant(t *testing.T) {
	newPlugin := func() *Plugin {
		return &Plugin{dirtyCalls: map[string]struct{}{}, dirtyCallsCh: make(chan struct{}, 1)}
	}

	t.Run("marks on the first confirmed participant", func(t *testing.T) {
		p := newPlugin()
		state := &callState{sessions: map[string]*public.CallSession{
			"a": {ConfirmedAt: 1},
		}}

		p.markCallDirtyOnFirstParticipant(state, "channelA")
		require.Equal(t, map[string]struct{}{"channelA": {}}, dirtySet(p))
	})

	t.Run("does not mark on later joins", func(t *testing.T) {
		// LiveKit fans metadata out to every client in the room, so seeding per
		// join would be quadratic in identical payloads. Later joiners get the
		// metadata on connect instead.
		p := newPlugin()
		state := &callState{sessions: map[string]*public.CallSession{
			"a": {ConfirmedAt: 1},
			"b": {ConfirmedAt: 2},
		}}

		p.markCallDirtyOnFirstParticipant(state, "channelA")
		require.Empty(t, dirtySet(p))
	})

	t.Run("pending sessions do not count as participants", func(t *testing.T) {
		// Rows minted by the token endpoint are not in the room yet, so a join
		// alongside them is still the first one LiveKit can deliver to.
		p := newPlugin()
		state := &callState{sessions: map[string]*public.CallSession{
			"a": {ConfirmedAt: 1},
			"b": {},
			"c": {},
		}}

		p.markCallDirtyOnFirstParticipant(state, "channelA")
		require.Equal(t, map[string]struct{}{"channelA": {}}, dirtySet(p))
	})
}

func TestHostSwitchOffParticipantScreen(t *testing.T) {
	// The host control has to keep working while clients are still migrating: the
	// LiveKit message is additive, the WebSocket event is what stops the share
	// today, and LiveKit being unreachable must not swallow it.
	t.Run("publishes the WebSocket event even when LiveKit is unreachable", func(t *testing.T) {
		p, mockAPI := setupStatePlugin(t)

		channelID := model.NewId()
		hostID := model.NewId()
		sessionID := model.NewId()

		call := &public.Call{
			ID:        model.NewId(),
			CreateAt:  time.Now().UnixMilli(),
			StartAt:   time.Now().UnixMilli(),
			ChannelID: channelID,
			OwnerID:   hostID,
			Props: public.CallProps{
				Hosts:                  []string{hostID},
				ScreenSharingSessionID: sessionID,
			},
		}
		require.NoError(t, p.store.CreateCall(call))
		require.NoError(t, p.store.CreateCallSession(&public.CallSession{
			ID:          sessionID,
			CallID:      call.ID,
			UserID:      hostID,
			JoinAt:      time.Now().UnixMilli(),
			ConfirmedAt: time.Now().UnixMilli(),
		}))

		require.NoError(t, p.hostSwitchOffParticipantScreen(hostID, channelID, sessionID))

		mockAPI.AssertCalled(t, "PublishWebSocketEvent", wsEventHostScreenOff,
			mock.Anything, mock.Anything)
	})

	t.Run("no-op when the session is not the one sharing", func(t *testing.T) {
		p, mockAPI := setupStatePlugin(t)

		channelID := model.NewId()
		hostID := model.NewId()
		sessionID := model.NewId()

		call := &public.Call{
			ID:        model.NewId(),
			CreateAt:  time.Now().UnixMilli(),
			StartAt:   time.Now().UnixMilli(),
			ChannelID: channelID,
			OwnerID:   hostID,
			Props:     public.CallProps{Hosts: []string{hostID}},
		}
		require.NoError(t, p.store.CreateCall(call))

		require.NoError(t, p.hostSwitchOffParticipantScreen(hostID, channelID, sessionID))

		mockAPI.AssertNotCalled(t, "PublishWebSocketEvent", wsEventHostScreenOff,
			mock.Anything, mock.Anything)
	})
}
