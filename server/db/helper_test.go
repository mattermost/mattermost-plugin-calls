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

	"github.com/go-sql-driver/mysql"
	"github.com/lib/pq"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
)

func initMMSchema(t *testing.T, store *Store) {
	t.Helper()

	if store.driverName == model.DatabaseDriverPostgres {
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
	} else {
		_, err := store.wDB.Exec(`
CREATE TABLE IF NOT EXISTS PluginKeyValueStore (
  PluginId varchar(190) NOT NULL,
  PKey varchar(150) NOT NULL,
  PValue mediumblob,
  ExpireAt bigint(20) DEFAULT 0,
  PRIMARY KEY (PluginId, PKey)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`)
		require.NoError(t, err)
	}
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
	settings.DataSource = model.NewString(dsn)
	settings.DriverName = model.NewString(model.DatabaseDriverPostgres)

	conn, err := pq.NewConnector(dsn)
	require.NoError(t, err)
	require.NotNil(t, conn)

	mockLogger.On("Info", mock.Anything).Run(func(args mock.Arguments) {
		log.Printf(args.Get(0).(string))
	})
	mockLogger.On("Debug", mock.Anything).Run(func(args mock.Arguments) {
		log.Printf(args.Get(0).(string))
	})
	mockMetrics.On("IncStoreOp", mock.AnythingOfType("string"))

	store, err := NewStore(settings, conn, nil, mockLogger, mockMetrics)
	require.NoError(t, err)
	require.NotNil(t, store)

	return store, func() {
		require.NoError(t, store.Close())
		tearDown()
	}
}

func newMySQLStore(t *testing.T) (*Store, func()) {
	t.Helper()

	mockMetrics := &serverMocks.MockMetrics{}
	mockLogger := &mlogMocks.MockLoggerIFace{}

	dsn, tearDown, err := testutils.RunMySQLContainerLocal(context.Background())
	require.NoError(t, err)

	var settings model.SqlSettings
	settings.SetDefaults(false)
	settings.DataSource = model.NewString(dsn)
	settings.DriverName = model.NewString(model.DatabaseDriverMysql)

	config, err := mysql.ParseDSN(dsn)
	require.NoError(t, err)

	conn, err := mysql.NewConnector(config)
	require.NoError(t, err)
	require.NotNil(t, conn)

	mockLogger.On("Info", mock.Anything).Run(func(args mock.Arguments) {
		log.Printf(args.Get(0).(string))
	})
	mockLogger.On("Debug", mock.Anything).Run(func(args mock.Arguments) {
		log.Printf(args.Get(0).(string))
	})
	mockMetrics.On("IncStoreOp", mock.AnythingOfType("string"))

	store, err := NewStore(settings, conn, nil, mockLogger, mockMetrics)
	require.NoError(t, err)
	require.NotNil(t, store)

	return store, func() {
		require.NoError(t, store.Close())
		tearDown()
	}
}

func newStore(t *testing.T, driverName string, binaryParams bool) (*Store, func()) {
	t.Helper()

	if driverName == model.DatabaseDriverMysql {
		return newMySQLStore(t)
	}

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
}

func testStore(t *testing.T, tests map[string]func(t *testing.T, store *Store)) {
	t.Helper()

	for _, name := range []string{model.DatabaseDriverPostgres, "postgres_binary_params", model.DatabaseDriverMysql} {
		t.Run(name, func(t *testing.T) {
			driverName := name
			if name == "postgres_binary_params" {
				driverName = model.DatabaseDriverPostgres
			}

			store, tearDown := newStore(t, driverName, name == "postgres_binary_params")
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
