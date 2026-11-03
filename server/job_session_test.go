// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"testing"
	"time"

	"github.com/mattermost/mattermost-plugin-calls/server/public"

	"github.com/mattermost/mattermost/server/public/model"

	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
)

// A failed job session must end the job rows it already created, otherwise
// the call reports a job in progress until it ends.
func TestStartJobSessionFailure(t *testing.T) {
	setup := func(t *testing.T) (*Plugin, *callState) {
		t.Helper()

		p, mockAPI := setupStatePlugin(t)
		p.botSession = &model.Session{UserId: model.NewId()}

		cfg := p.configuration.Clone()
		cfg.EnableRecordings = model.NewPointer(true)
		cfg.EnableTranscriptions = model.NewPointer(true)
		cfg.EnableLiveCaptions = model.NewPointer(true)
		p.configuration = cfg

		appErr := model.NewAppError("CreateSession", "api.session.create.error", nil, "", 500)
		mockAPI.On("CreateSession", mock.Anything).Return(nil, appErr)

		call := &public.Call{
			ID:        model.NewId(),
			CreateAt:  time.Now().UnixMilli(),
			StartAt:   time.Now().UnixMilli(),
			ChannelID: model.NewId(),
			OwnerID:   model.NewId(),
			PostID:    model.NewId(),
		}
		require.NoError(t, p.store.CreateCall(call))

		state, err := p.getCallState(call.ChannelID, true)
		require.NoError(t, err)

		return p, state
	}

	t.Run("recording", func(t *testing.T) {
		p, state := setup(t)
		channelID := state.Call.ChannelID

		_, code, err := p.startRecordingJob(state, channelID, state.Call.OwnerID)
		require.ErrorContains(t, err, "failed to create job session")
		require.Equal(t, 500, code)

		state, err = p.getCallState(channelID, true)
		require.NoError(t, err)
		require.Nil(t, state.Recording)
	})

	t.Run("transcription", func(t *testing.T) {
		p, state := setup(t)
		channelID := state.Call.ChannelID

		err := p.startTranscribingJob(state, channelID, state.Call.OwnerID, model.NewId())
		require.ErrorContains(t, err, "failed to create job session")

		state, err = p.getCallState(channelID, true)
		require.NoError(t, err)
		require.Nil(t, state.Transcription)
		require.Nil(t, state.LiveCaptions)
	})
}
