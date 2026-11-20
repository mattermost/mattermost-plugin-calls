// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package db

import (
	"context"
	"database/sql"
	"fmt"
	"time"
)

// CatchUpV1Calls copies ended v1 calls that are not in the v2 table yet, e.g.
// calls made under v1 after rolling back from v2 and switching to v2 again.
//
// Each copy is a single INSERT…SELECT, so it either completes or leaves
// nothing. If the most recent ended v1 call is already in v2 the tables are
// up to date and nothing else is read. Otherwise (a rollback happened, or an
// earlier catch-up failed, however long ago) every ended v1 call missing from
// v2 is copied. ON CONFLICT makes concurrent runs from several nodes safe;
// ORDER BY id gives them the same insert order so they can't deadlock.
// Returns the number of calls copied.
func (s *Store) CatchUpV1Calls() (int64, error) {
	s.metrics.IncStoreOp("CatchUpV1Calls")
	defer func(start time.Time) {
		s.metrics.ObserveStoreMethodsTime("CatchUpV1Calls", time.Since(start).Seconds())
	}(time.Now())

	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(*s.settings.QueryTimeout)*time.Second)
	defer cancel()

	var exists bool
	if err := s.wDB.QueryRowContext(ctx, "SELECT to_regclass('calls') IS NOT NULL").Scan(&exists); err != nil {
		return 0, fmt.Errorf("failed to check for v1 calls table: %w", err)
	}
	if !exists {
		return 0, nil
	}

	var latest sql.NullString
	if err := s.wDB.QueryRowContext(ctx, "SELECT (SELECT id FROM calls WHERE endat > 0 ORDER BY endat DESC LIMIT 1)").Scan(&latest); err != nil {
		return 0, fmt.Errorf("failed to get latest v1 call: %w", err)
	}
	if !latest.Valid {
		return 0, nil // nothing ended in v1
	}

	var upToDate bool
	if err := s.wDB.QueryRowContext(ctx, "SELECT EXISTS (SELECT 1 FROM "+tableCalls+" WHERE id = $1)", latest.String).Scan(&upToDate); err != nil {
		return 0, fmt.Errorf("failed to check latest v1 call: %w", err)
	}
	if upToDate {
		return 0, nil
	}

	const cols = "id, channelid, startat, endat, createat, deleteat, title, postid, threadid, ownerid, participants, stats, props"
	q := "INSERT INTO " + tableCalls + " (" + cols + ") " +
		"SELECT " + cols + " FROM calls WHERE endat > 0 " +
		"ORDER BY id ON CONFLICT (id) DO NOTHING"

	res, err := s.wDB.ExecContext(ctx, q)
	if err != nil {
		return 0, fmt.Errorf("failed to copy v1 calls: %w", err)
	}

	n, err := res.RowsAffected()
	if err != nil {
		return 0, fmt.Errorf("failed to get copied rows count: %w", err)
	}

	return n, nil
}
