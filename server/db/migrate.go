// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package db

import (
	"context"
	"fmt"
	"log"
	"path"
	"time"

	"github.com/mattermost/mattermost/server/public/shared/mlog"
	"github.com/mattermost/morph"
	"github.com/mattermost/morph/drivers"
	ps "github.com/mattermost/morph/drivers/postgres"
	"github.com/mattermost/morph/models"
	mbindata "github.com/mattermost/morph/sources/embedded"
)

const (
	migrationsTableName = "db_migrations_calls_v2"

	// copyV1DataMigrationVersion is the version of 000002_copy_v1_data.
	copyV1DataMigrationVersion = 2
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

func (s *Store) Migrate(direction models.Direction, dryRun bool) error {
	// The copy checks run before morph takes its connections (the driver and
	// the migration lock each hold one until Close), so they can't starve a
	// small connection pool.
	var cp copyPlan
	if direction != models.Down && !dryRun {
		cp = s.planV1Copy()
	}

	engine, err := s.initMorph(dryRun, *s.settings.MigrationsStatementTimeoutSeconds)
	if err != nil {
		return fmt.Errorf("failed to initialize morph: %w", err)
	}

	switch direction {
	case models.Down:
		defer engine.Close()
		_, err = engine.ApplyDown(-1)
		return err
	default:
		if dryRun {
			defer engine.Close()
			return engine.ApplyAll()
		}
		return s.applyAllLogCopy(engine, cp)
	}
}

// copyPlan describes the one-time v1 data copy (000002) expected from a run.
type copyPlan struct {
	pending               bool
	srcCalls, srcChannels int
}

// planV1Copy works out whether this run performs the one-time v1 data copy.
// The copy only happens once per database, so the log lines are the only
// record of it. Failures here must not block migrating.
func (s *Store) planV1Copy() copyPlan {
	pending, err := s.copyV1DataPending()
	if err != nil {
		s.log.Warn("Failed to check whether the v1 data copy is pending", mlog.Err(err))
		return copyPlan{}
	}
	if !pending {
		return copyPlan{}
	}
	srcCalls, srcChannels := s.countV1Source()
	return copyPlan{pending: true, srcCalls: srcCalls, srcChannels: srcChannels}
}

// applyAllLogCopy applies all migrations and, when cp says this run performs
// the one-time copy, logs what was expected and what was copied. It closes the
// engine before counting the destination rows so the lock connection is free.
func (s *Store) applyAllLogCopy(engine *morph.Morph, cp copyPlan) error {
	if !cp.pending {
		defer engine.Close()
		return engine.ApplyAll()
	}

	s.log.Info("Running one-time copy of v1 data into v2 tables",
		mlog.Int("v1_ended_calls", cp.srcCalls), mlog.Int("v1_channels", cp.srcChannels))

	start := time.Now()
	err := engine.ApplyAll()
	engine.Close()
	if err != nil {
		s.log.Error("Migrations failed, v1 data copy may be incomplete", mlog.Err(err), mlog.Duration("elapsed", time.Since(start)))
		return err
	}

	var dstCalls, dstChannels int
	if err := s.wDB.QueryRow("SELECT COUNT(*) FROM " + tableCalls).Scan(&dstCalls); err != nil {
		s.log.Warn("Failed to count copied calls", mlog.Err(err))
	}
	if err := s.wDB.QueryRow("SELECT COUNT(*) FROM " + tableChannels).Scan(&dstChannels); err != nil {
		s.log.Warn("Failed to count copied channels", mlog.Err(err))
	}
	s.log.Info("Finished one-time copy of v1 data into v2 tables",
		mlog.Int("v2_calls", dstCalls), mlog.Int("v2_channels", dstChannels),
		mlog.Int("v1_ended_calls", cp.srcCalls), mlog.Int("v1_channels", cp.srcChannels),
		mlog.Duration("elapsed", time.Since(start)))

	return nil
}

// copyV1DataPending reports whether the v1 data copy migration has not been
// applied yet.
func (s *Store) copyV1DataPending() (bool, error) {
	var exists bool
	if err := s.wDB.QueryRow("SELECT to_regclass($1) IS NOT NULL", migrationsTableName).Scan(&exists); err != nil {
		return false, err
	}
	if !exists {
		return true, nil
	}

	var applied bool
	err := s.wDB.QueryRow("SELECT EXISTS (SELECT 1 FROM "+migrationsTableName+" WHERE version = $1)", copyV1DataMigrationVersion).Scan(&applied)
	return !applied, err
}

// countV1Source returns the number of rows the copy is expected to read. Zero
// when the v1 tables don't exist.
func (s *Store) countV1Source() (endedCalls, channels int) {
	for _, q := range []struct {
		table, query string
		dst          *int
	}{
		{"calls", "SELECT COUNT(*) FROM calls WHERE endat > 0", &endedCalls},
		{"calls_channels", "SELECT COUNT(*) FROM calls_channels", &channels},
	} {
		var exists bool
		if err := s.wDB.QueryRow("SELECT to_regclass($1) IS NOT NULL", q.table).Scan(&exists); err != nil || !exists {
			continue
		}
		if err := s.wDB.QueryRow(q.query).Scan(q.dst); err != nil {
			s.log.Warn("Failed to count v1 rows", mlog.String("table", q.table), mlog.Err(err))
		}
	}
	return
}
