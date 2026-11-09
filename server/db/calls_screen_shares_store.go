// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package db

import (
	"context"
	"fmt"
	"time"

	"github.com/mattermost/mattermost-plugin-calls/server/public"

	sq "github.com/mattermost/squirrel"
)

// RecordScreenShareStart opens a screen-share segment for a session. One row per
// (callID, sessionID, startAt): a session can share more than once in a call, and
// startAt disambiguates the segments. ON CONFLICT DO NOTHING makes a retried
// webhook idempotent rather than erroring on the duplicate key.
func (s *Store) RecordScreenShareStart(callID, userID, sessionID string, startAt int64) error {
	s.metrics.IncStoreOp("RecordScreenShareStart")
	defer func(start time.Time) {
		s.metrics.ObserveStoreMethodsTime("RecordScreenShareStart", time.Since(start).Seconds())
	}(time.Now())

	qb := getQueryBuilder().
		Insert("calls_screen_shares").
		Columns("CallID", "UserID", "SessionID", "StartAt", "StopAt").
		Values(callID, userID, sessionID, startAt, 0).
		Suffix("ON CONFLICT (callid, sessionid, startat) DO NOTHING")

	q, args, err := qb.ToSql()
	if err != nil {
		return fmt.Errorf("failed to prepare query: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(*s.settings.QueryTimeout)*time.Second)
	defer cancel()
	if _, err := s.wDB.ExecContext(ctx, q, args...); err != nil {
		return fmt.Errorf("failed to run query: %w", err)
	}

	return nil
}

// RecordScreenShareStop closes the open screen-share segment for a session. Only
// one segment per session is open at a time (a sharer must stop before starting
// again, and concurrent sharers are rejected), so stamping every open row for the
// session closes exactly the current one. The StopAt = 0 guard makes a repeated
// stop a no-op.
func (s *Store) RecordScreenShareStop(callID, sessionID string, stopAt int64) error {
	s.metrics.IncStoreOp("RecordScreenShareStop")
	defer func(start time.Time) {
		s.metrics.ObserveStoreMethodsTime("RecordScreenShareStop", time.Since(start).Seconds())
	}(time.Now())

	qb := getQueryBuilder().
		Update("calls_screen_shares").
		Set("StopAt", stopAt).
		Where(sq.And{
			sq.Eq{"CallID": callID},
			sq.Eq{"SessionID": sessionID},
			sq.Eq{"StopAt": 0},
		})

	q, args, err := qb.ToSql()
	if err != nil {
		return fmt.Errorf("failed to prepare query: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(*s.settings.QueryTimeout)*time.Second)
	defer cancel()
	if _, err := s.wDB.ExecContext(ctx, q, args...); err != nil {
		return fmt.Errorf("failed to run query: %w", err)
	}

	return nil
}

// RecordStopForActiveScreenShares stamps stopAt on every open screen-share
// segment of the call (StopAt = 0). It is the completeness backstop called when a
// call ends: a share whose stop was never recorded (server crash, missed webhook,
// a failed per-stop write, or a sharer still sharing at call end) can't have
// outlived the call, so its stop is set to the call's end time.
func (s *Store) RecordStopForActiveScreenShares(callID string, stopAt int64) error {
	s.metrics.IncStoreOp("RecordStopForActiveScreenShares")
	defer func(start time.Time) {
		s.metrics.ObserveStoreMethodsTime("RecordStopForActiveScreenShares", time.Since(start).Seconds())
	}(time.Now())

	qb := getQueryBuilder().
		Update("calls_screen_shares").
		Set("StopAt", stopAt).
		Where(sq.And{
			sq.Eq{"CallID": callID},
			sq.Eq{"StopAt": 0},
		})

	q, args, err := qb.ToSql()
	if err != nil {
		return fmt.Errorf("failed to prepare query: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(*s.settings.QueryTimeout)*time.Second)
	defer cancel()
	if _, err := s.wDB.ExecContext(ctx, q, args...); err != nil {
		return fmt.Errorf("failed to run query: %w", err)
	}

	return nil
}

// GetScreenSharesForCalls returns the screen-share segments for the given calls,
// keyed by callID and ordered by start time, for building the audit report.
func (s *Store) GetScreenSharesForCalls(callIDs []string, opts GetCallOpts) (map[string][]*public.CallScreenShare, error) {
	s.metrics.IncStoreOp("GetScreenSharesForCalls")
	defer func(start time.Time) {
		s.metrics.ObserveStoreMethodsTime("GetScreenSharesForCalls", time.Since(start).Seconds())
	}(time.Now())

	result := map[string][]*public.CallScreenShare{}
	if len(callIDs) == 0 {
		return result, nil
	}

	qb := getQueryBuilder().
		Select("CallID", "UserID", "SessionID", "StartAt", "StopAt").
		From("calls_screen_shares").
		Where(sq.Eq{"CallID": callIDs}).
		OrderBy("StartAt ASC")

	q, args, err := qb.ToSql()
	if err != nil {
		return nil, fmt.Errorf("failed to prepare query: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(*s.settings.QueryTimeout)*time.Second)
	defer cancel()
	rows, err := s.dbFromGetOpts(opts).QueryContext(ctx, q, args...)
	if err != nil {
		return nil, fmt.Errorf("failed to get call screen shares: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var ss public.CallScreenShare
		if err := rows.Scan(&ss.CallID, &ss.UserID, &ss.SessionID, &ss.StartAt, &ss.StopAt); err != nil {
			return nil, fmt.Errorf("failed to scan rows: %w", err)
		}
		share := ss
		result[ss.CallID] = append(result[ss.CallID], &share)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("failed to read rows: %w", err)
	}

	return result, nil
}
