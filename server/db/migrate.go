// Copyright (c) 2022-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package db

import (
	"context"
	"fmt"
	"log"
	"path"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/shared/mlog"
	"github.com/mattermost/morph"
	"github.com/mattermost/morph/drivers"
	ms "github.com/mattermost/morph/drivers/mysql"
	ps "github.com/mattermost/morph/drivers/postgres"
	"github.com/mattermost/morph/models"
	mbindata "github.com/mattermost/morph/sources/embedded"
)

const (
	migrationsTableName = "db_migrations_calls"
)

// morphLogWriter is a target to pass to the logger instance of morph.
// For now, everything is just logged at a debug level. If we need to log
// errors/warnings from the library also, that needs to be seen later.
type morphLogWriter struct {
	log mlog.LoggerIFace
}

func (l *morphLogWriter) Write(in []byte) (int, error) {
	l.log.Debug(string(in))
	return len(in), nil
}

func (s *Store) initMorph(dryRun bool, timeoutSecs int) (*morph.Morph, error) {
	assetsList, err := assets.ReadDir(path.Join("migrations", s.driverName))
	if err != nil {
		return nil, err
	}

	assetNamesForDriver := make([]string, len(assetsList))
	for i, entry := range assetsList {
		assetNamesForDriver[i] = entry.Name()
	}

	src, err := mbindata.WithInstance(&mbindata.AssetSource{
		Names: assetNamesForDriver,
		AssetFunc: func(name string) ([]byte, error) {
			return assets.ReadFile(path.Join("migrations", s.driverName, name))
		},
	})
	if err != nil {
		return nil, fmt.Errorf("failed to generate source assets: %w", err)
	}

	var driver drivers.Driver
	switch s.driverName {
	case model.DatabaseDriverMysql:
		// MySQL requires the multiStatements flag to be on for migrations to
		// work so we need to open a dedicated connection.

		dsn, dsnErr := resetReadTimeout(*s.settings.DataSource)
		if dsnErr != nil {
			return nil, fmt.Errorf("failed to reset read timeout: %w", dsnErr)
		}
		dsn, dsnErr = appendMultipleStatementsFlag(dsn)
		if dsnErr != nil {
			return nil, fmt.Errorf("failed to append multiple statements flag: %w", dsnErr)
		}

		db, connErr := s.setupDBConn(dsn)
		if connErr != nil {
			return nil, fmt.Errorf("failed to setup db connection: %w", connErr)
		}
		defer db.Close()

		driver, err = ms.WithInstance(db)
	case model.DatabaseDriverPostgres:
		driver, err = ps.WithInstance(s.wDB)
	default:
		err = fmt.Errorf("unsupported database type %s for migration", s.driverName)
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get driver for migration: %w", err)
	}

	opts := []morph.EngineOption{
		morph.WithLogger(log.New(&morphLogWriter{
			log: s.log,
		}, "", log.Lshortfile)),
		morph.WithLock("mm-calls-migrations-lock-key"),
		morph.SetMigrationTableName(migrationsTableName),
		morph.SetStatementTimeoutInSeconds(timeoutSecs),
		morph.SetDryRun(dryRun),
	}

	engine, err := morph.New(context.Background(), driver, src, opts...)
	if err != nil {
		return nil, fmt.Errorf("failed to creare morph engine: %w", err)
	}

	return engine, nil
}

func (s *Store) Migrate(direction models.Direction, dryRun bool) error {
	engine, err := s.initMorph(dryRun, *s.settings.MigrationsStatementTimeoutSeconds)
	if err != nil {
		return fmt.Errorf("failed to initialize morph: %w", err)
	}
	defer engine.Close()

	switch direction {
	case models.Down:
		_, err = engine.ApplyDown(-1)
		return err
	default:
		return engine.ApplyAll()
	}
}
