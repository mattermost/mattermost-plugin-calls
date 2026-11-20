// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package db

import (
	"testing"

	"github.com/mattermost/mattermost-plugin-calls/server/public"

	"github.com/mattermost/morph/models"

	"github.com/stretchr/testify/require"
)

func TestMigrate(t *testing.T) {
	for _, name := range []string{"postgres", "postgres_binary_params"} {
		binaryParams := name == "postgres_binary_params"

		t.Run(name, func(t *testing.T) {
			store, tearDown := newPostgresStore(t, binaryParams)
			require.NotNil(t, store)
			t.Cleanup(tearDown)

			initMMSchema(t, store)

			_, err := store.wDB.Exec(`SELECT COUNT(*) FROM calls_v2_channels`)
			require.ErrorContains(t, err, `pq: relation "calls_v2_channels" does not exist`)

			_, err = store.wDB.Exec(`SELECT COUNT(*) FROM calls_v2_calls`)
			require.ErrorContains(t, err, `pq: relation "calls_v2_calls" does not exist`)

			_, err = store.wDB.Exec(`SELECT COUNT(*) FROM calls_v2_sessions`)
			require.ErrorContains(t, err, `pq: relation "calls_v2_sessions" does not exist`)

			_, err = store.wDB.Exec(`SELECT COUNT(*) FROM calls_v2_jobs`)
			require.ErrorContains(t, err, `pq: relation "calls_v2_jobs" does not exist`)

			t.Run("empty pluginkeyvaluestore", func(t *testing.T) {
				t.Run("up", func(t *testing.T) {
					err := store.Migrate(models.Up, false)
					require.NoError(t, err)

					var count int
					err = store.wDBx.Get(&count, `SELECT COUNT(*) FROM calls_v2_channels`)
					require.NoError(t, err)
					require.Zero(t, count)

					err = store.wDBx.Get(&count, `SELECT COUNT(*) FROM calls_v2_calls`)
					require.NoError(t, err)
					require.Zero(t, count)

					err = store.wDBx.Get(&count, `SELECT COUNT(*) FROM calls_v2_sessions`)
					require.NoError(t, err)
					require.Zero(t, count)

					err = store.wDBx.Get(&count, `SELECT COUNT(*) FROM calls_v2_jobs`)
					require.NoError(t, err)
					require.Zero(t, count)
				})

				t.Run("down", func(t *testing.T) {
					err := store.Migrate(models.Down, false)
					require.NoError(t, err)

					_, err = store.wDB.Exec(`SELECT COUNT(*) FROM calls_v2_channels`)
					require.ErrorContains(t, err, `pq: relation "calls_v2_channels" does not exist`)

					_, err = store.wDB.Exec(`SELECT COUNT(*) FROM calls_v2_calls`)
					require.ErrorContains(t, err, `pq: relation "calls_v2_calls" does not exist`)

					_, err = store.wDB.Exec(`SELECT COUNT(*) FROM calls_v2_sessions`)
					require.ErrorContains(t, err, `pq: relation "calls_v2_sessions" does not exist`)

					_, err = store.wDB.Exec(`SELECT COUNT(*) FROM calls_v2_jobs`)
					require.ErrorContains(t, err, `pq: relation "calls_v2_jobs" does not exist`)
				})
			})

			t.Run("v1 tables present", func(t *testing.T) {
				// Plain v1 schema, plus a v2-only extra column on calls_sessions to
				// make sure only shared columns are read.
				_, err := store.wDB.Exec(`
				CREATE TABLE calls_channels (channelid VARCHAR(26) PRIMARY KEY, enabled boolean, props jsonb NOT NULL);
				CREATE TABLE calls (
					id VARCHAR(26) PRIMARY KEY, channelid VARCHAR(26), startat bigint, endat bigint,
					createat bigint, deleteat bigint, title VARCHAR(256), postid VARCHAR(26),
					threadid VARCHAR(26), ownerid VARCHAR(26), participants jsonb NOT NULL,
					stats jsonb NOT NULL, props jsonb NOT NULL, extra_v2_col bigint
				);
				INSERT INTO calls_channels (channelid, enabled, props) VALUES
					('00000000000000000000000004', true, 'null'),
					('00000000000000000000000005', false, 'null');
				INSERT INTO calls (id, channelid, startat, endat, createat, deleteat, title, postid, threadid, ownerid, participants, stats, props) VALUES
					('00000000000000000000000101', '00000000000000000000000004', 1, 2, 1, 0, 'ended', 'p', 't', 'o', '["u1","u2"]', '{}', '{}'),
					('00000000000000000000000102', '00000000000000000000000004', 1, 0, 1, 0, 'live', 'p', 't', 'o', '[]', '{}', '{}');
				`)
				require.NoError(t, err)

				t.Run("up", func(t *testing.T) {
					require.NoError(t, store.Migrate(models.Up, false))

					var callsChannels []public.CallsChannel
					err = store.wDBx.Select(&callsChannels, `SELECT channelid, enabled FROM calls_v2_channels`)
					require.NoError(t, err)
					require.ElementsMatch(t, []public.CallsChannel{
						{ChannelID: "00000000000000000000000004", Enabled: true},
						{ChannelID: "00000000000000000000000005", Enabled: false},
					}, callsChannels)

					// Only ended calls are copied.
					var ids []string
					err = store.wDBx.Select(&ids, `SELECT id FROM calls_v2_calls`)
					require.NoError(t, err)
					require.Equal(t, []string{"00000000000000000000000101"}, ids)
				})

				t.Run("runs only once", func(t *testing.T) {
					_, err := store.wDB.Exec(`DELETE FROM calls_v2_channels`)
					require.NoError(t, err)
					require.NoError(t, store.Migrate(models.Up, false))

					var count int
					require.NoError(t, store.wDBx.Get(&count, `SELECT COUNT(*) FROM calls_v2_channels`))
					require.Zero(t, count)
				})

				t.Run("v1 tables untouched", func(t *testing.T) {
					var count int
					require.NoError(t, store.wDBx.Get(&count, `SELECT COUNT(*) FROM calls`))
					require.Equal(t, 2, count)
				})

				t.Run("down", func(t *testing.T) {
					require.NoError(t, store.Migrate(models.Down, false))

					_, err = store.wDB.Exec(`SELECT COUNT(*) FROM calls_v2_channels`)
					require.ErrorContains(t, err, `pq: relation "calls_v2_channels" does not exist`)
					_, err = store.wDB.Exec(`SELECT COUNT(*) FROM calls_v2_calls`)
					require.ErrorContains(t, err, `pq: relation "calls_v2_calls" does not exist`)
				})
			})
		})
	}
}
