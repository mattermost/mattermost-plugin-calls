// Copyright (c) 2022-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package db

import (
	"testing"

	"github.com/mattermost/mattermost-plugin-calls/server/public"

	"github.com/mattermost/mattermost/server/public/model"

	"github.com/stretchr/testify/require"
)

func TestCallsChannelsStore(t *testing.T) {
	t.Parallel()
	testStore(t, map[string]func(t *testing.T, store *Store){
		"TestCreateCallsChannel":  testCreateCallsChannel,
		"TestUpdateCallsChannel":  testUpdateCallsChannel,
		"TestGetCallsChannel":     testGetCallsChannel,
		"TestGetAllCallsChannels": testGetAllCallsChannels,
	})
}

func testCreateCallsChannel(t *testing.T, store *Store) {
	t.Run("empty", func(t *testing.T) {
		err := store.CreateCallsChannel(nil)
		require.EqualError(t, err, "invalid channel: should not be nil")

		err = store.CreateCallsChannel(&public.CallsChannel{})
		require.EqualError(t, err, "invalid channel: invalid ChannelID: should not be empty")
	})

	t.Run("valid", func(t *testing.T) {
		channel := &public.CallsChannel{
			ChannelID: model.NewId(),
			Enabled:   true,
			Props: map[string]any{
				"string_prop": "test",
				"number_prop": float64(45),
				"slice_prop":  []any{"1", "2"},
				"map_prop": map[string]any{
					"key": "value",
				},
			},
		}

		err := store.CreateCallsChannel(channel)
		require.NoError(t, err)

		gotChannel, err := store.GetCallsChannel(channel.ChannelID, GetCallsChannelOpts{
			FromWriter: true,
		})
		require.NoError(t, err)
		require.Equal(t, channel, gotChannel)
	})
}

func testUpdateCallsChannel(t *testing.T, store *Store) {
	t.Run("nil", func(t *testing.T) {
		var channel *public.CallsChannel
		err := store.UpdateCallsChannel(channel)
		require.EqualError(t, err, "invalid channel: should not be nil")
	})

	t.Run("existing", func(t *testing.T) {
		channel := &public.CallsChannel{
			ChannelID: model.NewId(),
			Enabled:   true,
			Props: map[string]any{
				"test_prop": "test",
			},
		}

		err := store.CreateCallsChannel(channel)
		require.NoError(t, err)

		channel.Enabled = false
		channel.Props["new_prop"] = float64(45)
		channel.Props["test_prop"] = "updated"

		err = store.UpdateCallsChannel(channel)
		require.NoError(t, err)

		gotChannel, err := store.GetCallsChannel(channel.ChannelID, GetCallsChannelOpts{
			FromWriter: true,
		})
		require.NoError(t, err)
		require.Equal(t, channel, gotChannel)
	})
}

func testGetCallsChannel(t *testing.T, store *Store) {
	channel := &public.CallsChannel{
		ChannelID: model.NewId(),
		Props: map[string]any{
			"test_prop": "test",
		},
	}

	err := store.CreateCallsChannel(channel)
	require.NoError(t, err)

	gotChannel, err := store.GetCallsChannel(channel.ChannelID, GetCallsChannelOpts{FromWriter: true})
	require.NoError(t, err)
	require.NotNil(t, gotChannel)
	require.Equal(t, channel, gotChannel)
}

func testGetAllCallsChannels(t *testing.T, store *Store) {
	t.Run("no channels", func(t *testing.T) {
		channels, err := store.GetAllCallsChannels(GetCallsChannelOpts{})
		require.NoError(t, err)
		require.Empty(t, channels)
	})

	t.Run("all channels", func(t *testing.T) {
		var createdChannels []*public.CallsChannel
		for i := 0; i < 10; i++ {
			channel := &public.CallsChannel{
				ChannelID: model.NewId(),
				Enabled:   i%2 == 0,
				Props: map[string]any{
					"string_prop": "test",
					"number_prop": float64(45),
					"slice_prop":  []any{"1", "2"},
					"map_prop": map[string]any{
						"key": "value",
					},
				},
			}

			err := store.CreateCallsChannel(channel)
			require.NoError(t, err)

			createdChannels = append(createdChannels, channel)
		}

		channels, err := store.GetAllCallsChannels(GetCallsChannelOpts{})
		require.NoError(t, err)
		require.ElementsMatch(t, createdChannels, channels)
	})
}
