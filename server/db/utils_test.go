package db

import (
	"context"
	"log"
	"os"
	"testing"
	"time"

	"github.com/mattermost/mattermost-plugin-calls/server/testutils"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/shared/mlog"

	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"

	mlogMocks "github.com/mattermost/mattermost-plugin-calls/server/mocks/github.com/mattermost/mattermost/server/public/shared/mlog"
)

func TestSetupConn(t *testing.T) {
	mockLogger := &mlogMocks.MockLoggerIFace{}
	mockLogger.On("Info", mock.Anything).Run(func(args mock.Arguments) {
		log.Print(args.Get(0).(string))
	})
	mockLogger.On("Debug", mock.Anything).Run(func(args mock.Arguments) {
		log.Print(args.Get(0).(string))
	})

	for _, driverName := range []string{model.DatabaseDriverPostgres, model.DatabaseDriverMysql} {
		t.Run(driverName, func(t *testing.T) {
			var dsn string
			var tearDown func()
			var err error
			if driverName == model.DatabaseDriverPostgres {
				dsn, tearDown, err = testutils.RunPostgresContainerLocal(context.Background())
				require.NoError(t, err)
			} else {
				dsn, tearDown, err = testutils.RunMySQLContainerLocal(context.Background())
				require.NoError(t, err)
			}
			t.Cleanup(tearDown)

			t.Run("defaults", func(t *testing.T) {
				var settings model.SqlSettings
				settings.SetDefaults(false)
				settings.DataSource = model.NewPointer(dsn)
				settings.DriverName = model.NewPointer(driverName)
				s := &Store{
					driverName: driverName,
					settings:   settings,
					log:        mockLogger,
				}

				mockLogger.On("Debug", "db opened", mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything).Once()

				db, err := s.setupDBConn(dsn)
				require.NoError(t, err)
				defer require.NoError(t, db.Close())
				require.Equal(t, 30, db.Stats().MaxOpenConnections)
			})

			t.Run("overrides", func(t *testing.T) {
				os.Setenv("MM_CALLS_MAX_OPEN_CONNS", "45")
				defer os.Unsetenv("MM_CALLS_MAX_OPEN_CONNS")
				os.Setenv("MM_CALLS_MAX_IDLE_CONNS", "45")
				defer os.Unsetenv("MM_CALLS_MAX_IDLE_CONNS")

				var settings model.SqlSettings
				settings.SetDefaults(false)
				settings.DataSource = model.NewPointer(dsn)
				settings.DriverName = model.NewPointer(driverName)
				s := &Store{
					driverName: driverName,
					settings:   settings,
					log:        mockLogger,
				}

				mockLogger.On("Debug", "db opened", mock.Anything, mlog.Int("maxIdleConns", 45), mlog.Int("maxOpenConns", 45),
					mock.Anything, mock.Anything, mock.Anything).Once()

				db, err := s.setupDBConn(dsn)
				require.NoError(t, err)
				defer require.NoError(t, db.Close())
				require.Equal(t, 45, db.Stats().MaxOpenConnections)
			})
		})
	}
}

func TestGenLast12MonthsMap(t *testing.T) {
	daysInMonth := func(m time.Month, year int) int {
		return time.Date(year, m+1, 0, 0, 0, 0, 0, time.UTC).Day()
	}

	for year := 2023; year < 4545; year++ {
		for month := time.January; month < time.December; month++ {
			for i := 0; i < daysInMonth(month, year); i++ {
				d := time.Date(year, month, 1, 0, 0, 0, 0, time.UTC)
				m := genLast12MonthsMap(d)
				require.Len(t, m, 12)
			}
		}
	}
}
