package main

import (
	"context"
	"log"
	"net/url"
	"testing"

	"github.com/mattermost/mattermost-plugin-calls/server/db"
	"github.com/mattermost/mattermost-plugin-calls/server/testutils"

	serverMocks "github.com/mattermost/mattermost-plugin-calls/server/mocks/github.com/mattermost/mattermost-plugin-calls/server/interfaces"
	mlogMocks "github.com/mattermost/mattermost-plugin-calls/server/mocks/github.com/mattermost/mattermost/server/public/shared/mlog"

	"github.com/mattermost/mattermost/server/public/model"

	"github.com/mattermost/morph/models"

	"github.com/lib/pq"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
)

func initMMSchema(t *testing.T, store *db.Store) {
	t.Helper()

	_, err := store.WriterDB().Exec(`
CREATE TABLE IF NOT EXISTS pluginkeyvaluestore (
    pluginid varchar(190) NOT NULL,
    pkey varchar(150) NOT NULL,
    pvalue bytea,
		expireat bigint DEFAULT 0,
    PRIMARY KEY (pluginid, pkey)
);
		`)
	require.NoError(t, err)
}

func NewTestStore(t *testing.T) (*db.Store, func()) {
	t.Helper()

	mockMetrics := &serverMocks.MockMetrics{}
	mockLogger := &mlogMocks.MockLoggerIFace{}

	dsn, tearDown, err := testutils.RunPostgresContainerLocal(context.Background())
	require.NoError(t, err)

	var settings model.SqlSettings
	settings.SetDefaults(false)
	u, err := url.Parse(dsn)
	require.NoError(t, err)
	values := u.Query()
	values.Set("binary_parameters", "yes")
	u.RawQuery = values.Encode()
	dsn = u.String()
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

	store, err := db.NewStore(settings, conn, nil, mockLogger, mockMetrics)
	require.NoError(t, err)
	require.NotNil(t, store)

	initMMSchema(t, store)

	err = store.Migrate(models.Up, false)
	require.NoError(t, err)

	return store, func() {
		require.NoError(t, store.Close())
		tearDown()
	}
}

func ResetTestStore(t *testing.T, store *db.Store) {
	t.Helper()

	_, err := store.WriterDB().Exec(`TRUNCATE TABLE calls`)
	require.NoError(t, err)
	_, err = store.WriterDB().Exec(`TRUNCATE TABLE calls_channels`)
	require.NoError(t, err)
	_, err = store.WriterDB().Exec(`TRUNCATE TABLE calls_sessions`)
	require.NoError(t, err)
}
