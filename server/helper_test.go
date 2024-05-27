package main

import (
	"context"
	"log"
	"net/url"
	"testing"
	"time"

	"github.com/mattermost/mattermost-plugin-calls/server/db"
	"github.com/mattermost/mattermost-plugin-calls/server/testutils"

	serverMocks "github.com/mattermost/mattermost-plugin-calls/server/mocks/github.com/mattermost/mattermost-plugin-calls/server/interfaces"
	mlogMocks "github.com/mattermost/mattermost-plugin-calls/server/mocks/github.com/mattermost/mattermost/server/public/shared/mlog"

	"github.com/mattermost/mattermost/server/public/model"

	"github.com/mattermost/morph/models"

	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
)

func createPost(t *testing.T, store *db.Store, postID, userID, channelID string) {
	t.Helper()
	nowMs := time.Now().UnixMilli()
	_, err := store.WriterDB().Exec(`INSERT INTO Posts
	(Id, CreateAt, UpdateAt, DeleteAt, UserId, ChannelId, RootId, OriginalId, Message, Type, Hashtags, Filenames, Fileids, HasReactions, EditAt, IsPinned)
	VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
		postID, nowMs, nowMs, 0, userID, channelID, "", "", "test", "", "", "[]", "[]", 0, 0, 0,
	)
	require.NoError(t, err)
}

func initMMSchema(t *testing.T, store *db.Store) {
	t.Helper()

	_, err := store.WriterDB().Exec(`
CREATE TABLE IF NOT EXISTS pluginkeyvaluestore (
    pluginid varchar(190) NOT NULL,
    pkey varchar(150) NOT NULL,
    pvalue bytea,
		expireat bigint DEFAULT 0,
    PRIMARY KEY (pluginid, pkey)
);`)
	require.NoError(t, err)

	_, err = store.WriterDB().Exec(`
CREATE TABLE public.posts (
    id character varying(26) NOT NULL,
    createat bigint,
    updateat bigint,
    deleteat bigint,
    userid character varying(26),
    channelid character varying(26),
    rootid character varying(26),
    originalid character varying(26),
    message character varying(65535),
    type character varying(26),
    props jsonb,
    hashtags character varying(1000),
    filenames character varying(4000),
    fileids character varying(300),
    hasreactions boolean,
    editat bigint,
    ispinned boolean,
    remoteid character varying(26)
);`)
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

	mockLogger.On("Info", mock.Anything).Run(func(args mock.Arguments) {
		log.Printf(args.Get(0).(string))
	})
	mockLogger.On("Debug", mock.Anything).Run(func(args mock.Arguments) {
		log.Printf(args.Get(0).(string))
	})
	mockMetrics.On("IncStoreOp", mock.AnythingOfType("string"))
	mockMetrics.On("ObserveStoreMethodsTime", mock.AnythingOfType("string"), mock.AnythingOfType("float64"))

	mockLogger.On("Debug", "db opened", mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything).Once()

	store, err := db.NewStore(settings, nil, mockLogger, mockMetrics)
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
	_, err = store.WriterDB().Exec(`TRUNCATE TABLE posts`)
	require.NoError(t, err)
}
