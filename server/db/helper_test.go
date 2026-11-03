// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package db

import (
	"context"
	"log"
	"net/url"
	"testing"

	"github.com/mattermost/mattermost-plugin-calls/server/testutils"

	serverMocks "github.com/mattermost/mattermost-plugin-calls/server/mocks/github.com/mattermost/mattermost-plugin-calls/server/interfaces"
	mlogMocks "github.com/mattermost/mattermost-plugin-calls/server/mocks/github.com/mattermost/mattermost/server/public/shared/mlog"

	"github.com/mattermost/mattermost/server/public/model"

	"github.com/mattermost/morph/models"

	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
)

func initMMSchema(t *testing.T, store *Store) {
	t.Helper()

	_, err := store.wDB.Exec(`
CREATE TABLE IF NOT EXISTS pluginkeyvaluestore (
    pluginid varchar(190) NOT NULL,
    pkey varchar(150) NOT NULL,
    pvalue bytea,
		expireat bigint DEFAULT 0,
    PRIMARY KEY (pluginid, pkey)
);
	`)
	require.NoError(t, err)

	_, err = store.wDB.Exec(`
CREATE TYPE channel_type AS ENUM ('P', 'G', 'O', 'D');
CREATE TABLE IF NOT EXISTS channels (
    id character varying(26) NOT NULL,
    createat bigint,
    updateat bigint,
    deleteat bigint,
    teamid character varying(26),
    type channel_type,
    displayname character varying(64),
    name character varying(64),
    header character varying(1024),
    purpose character varying(250),
    lastpostat bigint,
    totalmsgcount bigint,
    extraupdateat bigint,
    creatorid character varying(26),
    schemeid character varying(26),
    groupconstrained boolean,
    shared boolean,
    totalmsgcountroot bigint,
    lastrootpostat bigint DEFAULT '0'::bigint
);
`)
	require.NoError(t, err)
}

func newPostgresStore(t *testing.T, binaryParams bool) (*Store, func()) {
	t.Helper()

	mockMetrics := &serverMocks.MockMetrics{}
	mockLogger := &mlogMocks.MockLoggerIFace{}

	dsn, tearDown, err := testutils.RunPostgresContainerLocal(context.Background())
	require.NoError(t, err)

	var settings model.SqlSettings
	settings.SetDefaults(false)
	if binaryParams {
		u, err := url.Parse(dsn)
		require.NoError(t, err)
		values := u.Query()
		values.Set("binary_parameters", "yes")
		u.RawQuery = values.Encode()
		dsn = u.String()
	}
	settings.DataSource = model.NewPointer(dsn)
	settings.DriverName = model.NewPointer(model.DatabaseDriverPostgres)

	mockLogger.On("Info", mock.Anything).Run(func(args mock.Arguments) {
		log.Print(args.Get(0).(string))
	})
	mockLogger.On("Debug", mock.Anything).Run(func(args mock.Arguments) {
		log.Print(args.Get(0).(string))
	})
	mockMetrics.On("IncStoreOp", mock.AnythingOfType("string"))
	mockMetrics.On("ObserveStoreMethodsTime", mock.AnythingOfType("string"), mock.AnythingOfType("float64"))

	mockLogger.On("Debug", "db opened", mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything).Once()

	store, err := NewStore(settings, nil, mockLogger, mockMetrics)
	require.NoError(t, err)
	require.NotNil(t, store)

	return store, func() {
		require.NoError(t, store.Close())
		tearDown()
	}
}

func newStore(t *testing.T, binaryParams bool) (*Store, func()) {
	t.Helper()
	return newPostgresStore(t, binaryParams)
}

func resetStore(t *testing.T, store *Store) {
	t.Helper()

	_, err := store.wDB.Exec(`TRUNCATE TABLE calls`)
	require.NoError(t, err)
	_, err = store.wDB.Exec(`TRUNCATE TABLE calls_channels`)
	require.NoError(t, err)
	_, err = store.wDB.Exec(`TRUNCATE TABLE calls_sessions`)
	require.NoError(t, err)
	_, err = store.wDB.Exec(`TRUNCATE TABLE channels`)
	require.NoError(t, err)
}

func testStore(t *testing.T, tests map[string]func(t *testing.T, store *Store)) {
	t.Helper()

	for _, name := range []string{model.DatabaseDriverPostgres, "postgres_binary_params"} {
		t.Run(name, func(t *testing.T) {
			store, tearDown := newStore(t, name == "postgres_binary_params")
			require.NotNil(t, store)
			t.Cleanup(tearDown)

			initMMSchema(t, store)

			err := store.Migrate(models.Up, false)
			require.NoError(t, err)

			for testName, testFn := range tests {
				t.Run(testName, func(t *testing.T) {
					resetStore(t, store)
					testFn(t, store)
				})
			}
		})
	}
}
