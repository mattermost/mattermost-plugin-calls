// Copyright (c) 2022-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package db

import (
	"database/sql"
	"database/sql/driver"
	"errors"
	"fmt"

	"github.com/mattermost/mattermost-plugin-calls/server/interfaces"
	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/shared/mlog"

	"github.com/jmoiron/sqlx"
)

type Store struct {
	settings     model.SqlSettings
	driverName   string
	log          mlog.LoggerIFace
	metrics      interfaces.StoreMetrics
	binaryParams bool

	// Writer
	wDB  *sql.DB
	wDBx *sqlx.DB
	// Reader
	rDB  *sql.DB
	rDBx *sqlx.DB
}

var ErrNotFound = errors.New("not found")

func NewStore(settings model.SqlSettings, rConnector driver.Connector, log mlog.LoggerIFace, metrics interfaces.StoreMetrics) (*Store, error) {
	if settings.DriverName == nil {
		return nil, fmt.Errorf("invalid nil DriverName")
	}

	if settings.DataSource == nil {
		return nil, fmt.Errorf("invalid nil DataSource")
	}

	if *settings.DriverName != model.DatabaseDriverMysql && *settings.DriverName != model.DatabaseDriverPostgres {
		return nil, fmt.Errorf("invalid db driver %q", *settings.DriverName)
	}

	if settings.MigrationsStatementTimeoutSeconds == nil {
		return nil, fmt.Errorf("invalid nil MigrationsStatementTimeoutSeconds")
	}

	if log == nil {
		return nil, fmt.Errorf("invalid nil logger")
	}

	if metrics == nil {
		return nil, fmt.Errorf("invalid nil metrics")
	}

	st := &Store{
		settings:   settings,
		driverName: *settings.DriverName,
		metrics:    metrics,
		log:        log,
	}

	if *settings.DriverName == model.DatabaseDriverPostgres {
		binaryParams, err := hasBinaryParams(*settings.DataSource)
		if err != nil {
			return nil, fmt.Errorf("failed to check binary parameters")
		}
		st.binaryParams = binaryParams
	}

	db, err := st.setupDBConn(*settings.DataSource)
	if err != nil {
		return nil, fmt.Errorf("failed to setup db connection: %w", err)
	}

	st.wDB = db
	st.wDBx = sqlx.NewDb(st.wDB, st.driverName)
	if st.driverName == model.DatabaseDriverMysql {
		st.wDBx.MapperFunc(func(s string) string { return s })
	}

	if rConnector == nil {
		log.Info("store: no reader connector passed, using writer")
		st.rDB = st.wDB
	} else {
		st.rDB = sql.OpenDB(rConnector)
		if err := st.rDB.Ping(); err != nil {
			return nil, fmt.Errorf("failed to ping reader DB: %w", err)
		}
	}

	st.rDBx = sqlx.NewDb(st.rDB, st.driverName)
	if st.driverName == model.DatabaseDriverMysql {
		st.rDBx.MapperFunc(func(s string) string { return s })
	}

	return st, nil
}

func (s *Store) Close() error {
	if s == nil {
		return nil
	}

	var ret error
	if err := s.wDB.Close(); err != nil {
		s.log.Error("failed to close writer db", mlog.Err(err))
		ret = err
	}
	if err := s.rDB.Close(); err != nil {
		s.log.Error("failed to close reader db", mlog.Err(err))
		ret = err
	}

	return ret
}

func (s *Store) WriterDB() *sql.DB {
	return s.wDB
}
