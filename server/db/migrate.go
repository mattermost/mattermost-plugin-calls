// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package db

import (
	"context"
	"fmt"
	"log"
	"path"
	"strconv"
	"strings"

	"github.com/mattermost/mattermost/server/public/shared/mlog"
	"github.com/mattermost/morph"
	"github.com/mattermost/morph/drivers"
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
	driver, err = ps.WithInstance(s.wDB)
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

// sourceMigrations returns the up migrations embedded in this build, keyed by
// version, with the migration name as value.
func (s *Store) sourceMigrations() (map[uint32]string, error) {
	entries, err := assets.ReadDir(path.Join("migrations", s.driverName))
	if err != nil {
		return nil, err
	}

	src := make(map[uint32]string)
	for _, entry := range entries {
		fileName := entry.Name()
		if !strings.HasSuffix(fileName, ".up.sql") {
			continue
		}
		base := strings.TrimSuffix(fileName, ".up.sql")
		versionStr, name, ok := strings.Cut(base, "_")
		if !ok {
			return nil, fmt.Errorf("invalid migration file name %q", fileName)
		}
		version, err := strconv.ParseUint(versionStr, 10, 32)
		if err != nil {
			return nil, fmt.Errorf("invalid migration version in %q: %w", fileName, err)
		}
		src[uint32(version)] = name
	}

	return src, nil
}

// hasNewerSchema reports whether the migrations table already contains every
// migration known to this build plus at least one it doesn't know about (e.g.
// applied by a newer Calls version sharing the same table). In that case
// morph would refuse to run, even though nothing needs to be applied.
func (s *Store) hasNewerSchema() (bool, error) {
	var exists bool
	if err := s.wDB.QueryRow(`SELECT to_regclass($1) IS NOT NULL`, migrationsTableName).Scan(&exists); err != nil {
		return false, fmt.Errorf("failed to check migrations table: %w", err)
	}
	if !exists {
		return false, nil
	}

	rows, err := s.wDB.Query(`SELECT version, name FROM ` + migrationsTableName)
	if err != nil {
		return false, fmt.Errorf("failed to query applied migrations: %w", err)
	}
	defer rows.Close()

	applied := make(map[uint32]string)
	for rows.Next() {
		var version uint32
		var name string
		if err := rows.Scan(&version, &name); err != nil {
			return false, fmt.Errorf("failed to scan applied migration: %w", err)
		}
		applied[version] = name
	}
	if err := rows.Err(); err != nil {
		return false, err
	}

	src, err := s.sourceMigrations()
	if err != nil {
		return false, err
	}

	// Any known migration that's unapplied (a gap) must still go through morph so it fails safely.
	for version, name := range src {
		if applied[version] != name {
			return false, nil
		}
	}

	return len(applied) > len(src), nil
}

func (s *Store) Migrate(direction models.Direction, dryRun bool) error {
	if direction == models.Up {
		newer, err := s.hasNewerSchema()
		if err != nil {
			return err
		}
		if newer {
			s.log.Info("newer schema present, skipping migrations")
			return nil
		}
	}

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
