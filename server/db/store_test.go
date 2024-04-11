// Copyright (c) 2022-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package db

import (
	"context"
	"testing"

	"github.com/mattermost/mattermost-plugin-calls/server/testutils"
	"github.com/mattermost/mattermost/server/public/model"

	serverMocks "github.com/mattermost/mattermost-plugin-calls/server/mocks/github.com/mattermost/mattermost-plugin-calls/server/interfaces"
	mlogMocks "github.com/mattermost/mattermost-plugin-calls/server/mocks/github.com/mattermost/mattermost/server/public/shared/mlog"

	"github.com/go-sql-driver/mysql"
	"github.com/lib/pq"
	"github.com/stretchr/testify/require"
)

func TestNewStore(t *testing.T) {
	t.Parallel()

	mockMetrics := &serverMocks.MockMetrics{}
	mockLogger := &mlogMocks.MockLoggerIFace{}

	t.Run("postgres", func(t *testing.T) {
		dsn, tearDown, err := testutils.RunPostgresContainerLocal(context.Background())
		require.NoError(t, err)
		t.Cleanup(tearDown)

		var settings model.SqlSettings
		settings.SetDefaults(false)
		settings.DataSource = model.NewString(dsn)
		settings.DriverName = model.NewString(model.DatabaseDriverPostgres)

		t.Run("writer only", func(t *testing.T) {
			conn, err := pq.NewConnector(dsn)
			require.NoError(t, err)
			require.NotNil(t, conn)

			mockLogger.On("Info", "store: no reader connector passed, using writer").Once()

			store, err := NewStore(settings, conn, nil, mockLogger, mockMetrics)
			require.NoError(t, err)
			require.NotNil(t, store)

			require.NoError(t, store.Close())
		})

		t.Run("writer and reader", func(t *testing.T) {
			wConn, err := pq.NewConnector(dsn)
			require.NoError(t, err)
			require.NotNil(t, wConn)

			rConn, err := pq.NewConnector(dsn)
			require.NoError(t, err)
			require.NotNil(t, rConn)

			store, err := NewStore(settings, wConn, rConn, mockLogger, mockMetrics)
			require.NoError(t, err)
			require.NotNil(t, store)

			require.NoError(t, store.Close())
		})
	})

	t.Run("mysql", func(t *testing.T) {
		dsn, tearDown, err := testutils.RunMySQLContainerLocal(context.Background())
		require.NoError(t, err)
		t.Cleanup(tearDown)

		var settings model.SqlSettings
		settings.SetDefaults(false)
		settings.DataSource = model.NewString(dsn)
		settings.DriverName = model.NewString(model.DatabaseDriverMysql)

		t.Run("writer only", func(t *testing.T) {
			config, err := mysql.ParseDSN(dsn)
			require.NoError(t, err)

			conn, err := mysql.NewConnector(config)
			require.NoError(t, err)
			require.NotNil(t, conn)

			mockLogger.On("Info", "store: no reader connector passed, using writer").Once()

			store, err := NewStore(settings, conn, nil, mockLogger, mockMetrics)
			require.NoError(t, err)
			require.NotNil(t, store)

			require.NoError(t, store.Close())
		})

		t.Run("writer and reader", func(t *testing.T) {
			config, err := mysql.ParseDSN(dsn)
			require.NoError(t, err)

			wConn, err := mysql.NewConnector(config)
			require.NoError(t, err)
			require.NotNil(t, wConn)

			rConn, err := mysql.NewConnector(config)
			require.NoError(t, err)
			require.NotNil(t, rConn)

			store, err := NewStore(settings, wConn, rConn, mockLogger, mockMetrics)
			require.NoError(t, err)
			require.NotNil(t, store)

			require.NoError(t, store.Close())
		})
	})
}
