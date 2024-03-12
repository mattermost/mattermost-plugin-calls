// Copyright (c) 2022-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package db

import (
	"testing"

	"github.com/mattermost/mattermost-plugin-calls/server/public"

	"github.com/mattermost/morph/models"

	"github.com/stretchr/testify/require"
)

func TestMigrate(t *testing.T) {
	t.Run("postgres", func(t *testing.T) {
		t.Parallel()

		store, tearDown := newPostgresStore(t)
		require.NotNil(t, store)
		t.Cleanup(tearDown)

		initMMSchema(t, store)

		_, err := store.wDB.Exec(`SELECT COUNT(*) FROM callschannels`)
		require.EqualError(t, err, `pq: relation "callschannels" does not exist`)

		_, err = store.wDB.Exec(`SELECT COUNT(*) FROM calls`)
		require.EqualError(t, err, `pq: relation "calls" does not exist`)

		t.Run("empty pluginkeyvaluestore", func(t *testing.T) {
			t.Run("up", func(t *testing.T) {
				err := store.Migrate(models.Up, false)
				require.NoError(t, err)

				var count int
				err = store.wDBx.Get(&count, `SELECT COUNT(*) FROM callschannels`)
				require.NoError(t, err)
				require.Zero(t, count)

				err = store.wDBx.Get(&count, `SELECT COUNT(*) FROM calls`)
				require.NoError(t, err)
				require.Zero(t, count)
			})

			t.Run("down", func(t *testing.T) {
				err := store.Migrate(models.Down, false)
				require.NoError(t, err)

				_, err = store.wDB.Exec(`SELECT COUNT(*) FROM callschannels`)
				require.EqualError(t, err, `pq: relation "callschannels" does not exist`)

				_, err = store.wDB.Exec(`SELECT COUNT(*) FROM calls`)
				require.EqualError(t, err, `pq: relation "calls" does not exist`)
			})
		})

		t.Run("non-empty pluginkeyvaluestore", func(t *testing.T) {
			_, err := store.wDB.Exec(`INSERT INTO pluginkeyvaluestore (pluginid, pkey, pvalue) VALUES 
				('com.mattermost.calls', 'config', '{}'),
				('com.mattermost.calls', '00000000000000000000000001', NULL),
				('com.mattermost.calls', '00000000000000000000000002', '{}'),
				('com.mattermost.calls', '00000000000000000000000003', '{"enabled": null}'),
				('com.mattermost.calls', '00000000000000000000000004', '{"enabled": true}'),
				('com.mattermost.calls', '00000000000000000000000005', '{"enabled": false}'),
				('com.mattermost.calls', '00000000000000000000000006', '{"enabled": false}'),
				('com.mattermost.calls', '00000000000000000000000007', '{"enabled": true}')
				`)
			require.NoError(t, err)

			t.Run("up", func(t *testing.T) {
				err = store.Migrate(models.Up, false)
				require.NoError(t, err)

				var callsChannels []public.CallsChannel
				err = store.wDBx.Select(&callsChannels, `SELECT channelid, enabled FROM callschannels`)
				require.NoError(t, err)
				require.ElementsMatch(t, []public.CallsChannel{
					{
						ChannelID: "00000000000000000000000004",
						Enabled:   true,
					},
					{
						ChannelID: "00000000000000000000000005",
						Enabled:   false,
					},
					{
						ChannelID: "00000000000000000000000006",
						Enabled:   false,
					},
					{
						ChannelID: "00000000000000000000000007",
						Enabled:   true,
					},
				}, callsChannels)
			})

			t.Run("down", func(t *testing.T) {
				err := store.Migrate(models.Down, false)
				require.NoError(t, err)

				_, err = store.wDB.Exec(`SELECT COUNT(*) FROM callschannels`)
				require.EqualError(t, err, `pq: relation "callschannels" does not exist`)

				_, err = store.wDB.Exec(`SELECT COUNT(*) FROM calls`)
				require.EqualError(t, err, `pq: relation "calls" does not exist`)
			})
		})
	})

	t.Run("mysql", func(t *testing.T) {
		t.Parallel()

		store, tearDown := newMySQLStore(t)
		require.NotNil(t, store)
		t.Cleanup(tearDown)

		initMMSchema(t, store)

		_, err := store.wDB.Exec(`SELECT COUNT(*) FROM CallsChannels`)
		require.EqualError(t, err, `Error 1146 (42S02): Table 'mattermost_test.CallsChannels' doesn't exist`)

		t.Run("empty PluginKeyValueStore", func(t *testing.T) {
			t.Run("up", func(t *testing.T) {
				err := store.Migrate(models.Up, false)
				require.NoError(t, err)

				var count int
				err = store.wDBx.Get(&count, `SELECT COUNT(*) FROM CallsChannels`)
				require.NoError(t, err)
				require.Zero(t, count)

				err = store.wDBx.Get(&count, `SELECT COUNT(*) FROM Calls`)
				require.NoError(t, err)
				require.Zero(t, count)
			})

			t.Run("down", func(t *testing.T) {
				err := store.Migrate(models.Down, false)
				require.NoError(t, err)

				_, err = store.wDB.Exec(`SELECT COUNT(*) FROM CallsChannels`)
				require.EqualError(t, err, `Error 1146 (42S02): Table 'mattermost_test.CallsChannels' doesn't exist`)

				_, err = store.wDB.Exec(`SELECT COUNT(*) FROM Calls`)
				require.EqualError(t, err, `Error 1146 (42S02): Table 'mattermost_test.Calls' doesn't exist`)
			})
		})

		t.Run("non-empty pluginkeyvaluestore", func(t *testing.T) {
			_, err := store.wDB.Exec(`INSERT INTO PluginKeyValueStore (PluginId, PKey, PValue) VALUES 
				('com.mattermost.calls', 'config', '{}'),
				('com.mattermost.calls', '00000000000000000000000001', NULL),
				('com.mattermost.calls', '00000000000000000000000002', '{}'),
				('com.mattermost.calls', '00000000000000000000000003', '{"enabled": null}'),
				('com.mattermost.calls', '00000000000000000000000004', '{"enabled": true}'),
				('com.mattermost.calls', '00000000000000000000000005', '{"enabled": false}'),
				('com.mattermost.calls', '00000000000000000000000006', '{"enabled": false}'),
				('com.mattermost.calls', '00000000000000000000000007', '{"enabled": true}')
				`)
			require.NoError(t, err)

			t.Run("up", func(t *testing.T) {
				err = store.Migrate(models.Up, false)
				require.NoError(t, err)

				var callsChannels []public.CallsChannel
				err = store.wDBx.Select(&callsChannels, `SELECT ChannelID, Enabled FROM CallsChannels`)
				require.NoError(t, err)
				require.ElementsMatch(t, []public.CallsChannel{
					{
						ChannelID: "00000000000000000000000004",
						Enabled:   true,
					},
					{
						ChannelID: "00000000000000000000000005",
						Enabled:   false,
					},
					{
						ChannelID: "00000000000000000000000006",
						Enabled:   false,
					},
					{
						ChannelID: "00000000000000000000000007",
						Enabled:   true,
					},
				}, callsChannels)
			})

			t.Run("down", func(t *testing.T) {
				err := store.Migrate(models.Down, false)
				require.NoError(t, err)

				_, err = store.wDB.Exec(`SELECT COUNT(*) FROM CallsChannels`)
				require.EqualError(t, err, `Error 1146 (42S02): Table 'mattermost_test.CallsChannels' doesn't exist`)

				_, err = store.wDB.Exec(`SELECT COUNT(*) FROM Calls`)
				require.EqualError(t, err, `Error 1146 (42S02): Table 'mattermost_test.Calls' doesn't exist`)
			})
		})
	})
}
