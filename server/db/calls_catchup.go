// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package db

import (
	"context"
	"fmt"
	"time"
)

// catchUpOverlapMs widens the catch-up window below the watermark to absorb
// clock skew between nodes. Rows already present are skipped by id.
const catchUpOverlapMs = int64(24 * time.Hour / time.Millisecond)

// CatchUpV1Calls copies ended v1 calls that are not in the v2 table yet, e.g.
// calls made under v1 after rolling back from v2 and switching to v2 again.
//
// v1 and v2 never run at the same time, so every call v1 ends during a
// rollback ends after the last call in v2's table. MAX(endat) of that table is
// therefore the watermark: no state to store, and the scan uses v1's endat
// index rather than the whole table. On an empty v2 table it copies everything.
//
// It is a single INSERT…SELECT, so a failure leaves nothing partially copied
// and the next run retries the same range. ON CONFLICT makes concurrent runs
// from several nodes safe; ORDER BY id gives them the same insert order so they
// can't deadlock. Returns the number of calls copied.
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

	const cols = "id, channelid, startat, endat, createat, deleteat, title, postid, threadid, ownerid, participants, stats, props"
	q := "INSERT INTO " + tableCalls + " (" + cols + ") " +
		"SELECT " + cols + " FROM calls " +
		"WHERE endat > 0 AND endat > COALESCE((SELECT MAX(endat) FROM " + tableCalls + "), 0) - $1 " +
		"ORDER BY id ON CONFLICT (id) DO NOTHING"

	res, err := s.wDB.ExecContext(ctx, q, catchUpOverlapMs)
	if err != nil {
		return 0, fmt.Errorf("failed to copy v1 calls: %w", err)
	}

	n, err := res.RowsAffected()
	if err != nil {
		return 0, fmt.Errorf("failed to get copied rows count: %w", err)
	}

	return n, nil
}
