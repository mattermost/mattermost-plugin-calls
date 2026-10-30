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

// RecordParticipantJoin records a user's join time for a call, keeping the
// earliest across repeated joins/reconnects. LEAST (rather than a plain
// DO NOTHING) makes FirstJoinAt the true minimum even if join events are applied
// out of order, so the audit value can't be corrupted by event reordering.
func (s *Store) RecordParticipantJoin(callID, userID string, joinAt int64) error {
	s.metrics.IncStoreOp("RecordParticipantJoin")
	defer func(start time.Time) {
		s.metrics.ObserveStoreMethodsTime("RecordParticipantJoin", time.Since(start).Seconds())
	}(time.Now())

	qb := getQueryBuilder().
		Insert("calls_participants").
		Columns("CallID", "UserID", "FirstJoinAt", "LastLeaveAt").
		Values(callID, userID, joinAt, 0).
		Suffix("ON CONFLICT (callid, userid) DO UPDATE SET firstjoinat = LEAST(calls_participants.firstjoinat, EXCLUDED.firstjoinat)")

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

// RecordParticipantLeave records the latest time a user left a call. The guard
// keeps the most recent leave, so out-of-order or reconnect-driven leaves can't
// move LastLeaveAt backwards. A leave for a user with no recorded join is a
// no-op (the join always comes first in practice).
func (s *Store) RecordParticipantLeave(callID, userID string, leaveAt int64) error {
	s.metrics.IncStoreOp("RecordParticipantLeave")
	defer func(start time.Time) {
		s.metrics.ObserveStoreMethodsTime("RecordParticipantLeave", time.Since(start).Seconds())
	}(time.Now())

	qb := getQueryBuilder().
		Update("calls_participants").
		Set("LastLeaveAt", leaveAt).
		Where(sq.And{
			sq.Eq{"CallID": callID},
			sq.Eq{"UserID": userID},
			sq.Lt{"LastLeaveAt": leaveAt},
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

// GetParticipantsForCalls returns the attendance records for the given calls,
// keyed by callID then userID, for building the audit report.
func (s *Store) GetParticipantsForCalls(callIDs []string, opts GetCallOpts) (map[string]map[string]*public.CallParticipant, error) {
	s.metrics.IncStoreOp("GetParticipantsForCalls")
	defer func(start time.Time) {
		s.metrics.ObserveStoreMethodsTime("GetParticipantsForCalls", time.Since(start).Seconds())
	}(time.Now())

	result := map[string]map[string]*public.CallParticipant{}
	if len(callIDs) == 0 {
		return result, nil
	}

	qb := getQueryBuilder().
		Select("CallID", "UserID", "FirstJoinAt", "LastLeaveAt").
		From("calls_participants").
		Where(sq.Eq{"CallID": callIDs})

	q, args, err := qb.ToSql()
	if err != nil {
		return nil, fmt.Errorf("failed to prepare query: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(*s.settings.QueryTimeout)*time.Second)
	defer cancel()
	rows, err := s.dbFromGetOpts(opts).QueryContext(ctx, q, args...)
	if err != nil {
		return nil, fmt.Errorf("failed to get call participants: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var cp public.CallParticipant
		if err := rows.Scan(&cp.CallID, &cp.UserID, &cp.FirstJoinAt, &cp.LastLeaveAt); err != nil {
			return nil, fmt.Errorf("failed to scan rows: %w", err)
		}
		if result[cp.CallID] == nil {
			result[cp.CallID] = map[string]*public.CallParticipant{}
		}
		participant := cp
		result[cp.CallID][cp.UserID] = &participant
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("failed to read rows: %w", err)
	}

	return result, nil
}
