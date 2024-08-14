// Copyright (c) 2022-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package db

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/mattermost/mattermost-plugin-calls/server/public"

	sq "github.com/mattermost/squirrel"
)

func (s *Store) CreateCallSession(session *public.CallSession) error {
	s.metrics.IncStoreOp("CreateCallSession")
	defer func(start time.Time) {
		s.metrics.ObserveStoreMethodsTime("CreateCallSession", time.Since(start).Seconds())
	}(time.Now())

	if err := session.IsValid(); err != nil {
		return fmt.Errorf("invalid call session: %w", err)
	}

	qb := getQueryBuilder(s.driverName).
		Insert("calls_sessions").
		Columns("ID", "CallID", "UserID", "JoinAt", "Unmuted", "RaisedHand").
		Values(session.ID, session.CallID, session.UserID, session.JoinAt, session.Unmuted, session.RaisedHand)

	q, args, err := qb.ToSql()
	if err != nil {
		return fmt.Errorf("failed to prepare query: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(*s.settings.QueryTimeout)*time.Second)
	defer cancel()
	_, err = s.wDB.ExecContext(ctx, q, args...)
	if err != nil {
		return fmt.Errorf("failed to run query: %w", err)
	}

	return nil
}

func (s *Store) UpdateCallSession(session *public.CallSession) error {
	s.metrics.IncStoreOp("UpdateCallSession")
	defer func(start time.Time) {
		s.metrics.ObserveStoreMethodsTime("UpdateCallSession", time.Since(start).Seconds())
	}(time.Now())

	if err := session.IsValid(); err != nil {
		return fmt.Errorf("invalid call session: %w", err)
	}

	qb := getQueryBuilder(s.driverName).
		Update("calls_sessions").
		Set("Unmuted", session.Unmuted).
		Set("RaisedHand", session.RaisedHand).
		Where(sq.Eq{"ID": session.ID})

	q, args, err := qb.ToSql()
	if err != nil {
		return fmt.Errorf("failed to prepare query: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(*s.settings.QueryTimeout)*time.Second)
	defer cancel()
	_, err = s.wDB.ExecContext(ctx, q, args...)
	if err != nil {
		return fmt.Errorf("failed to run query: %w", err)
	}

	return nil
}

func (s *Store) DeleteCallSession(id string) error {
	s.metrics.IncStoreOp("DeleteCallSession")
	defer func(start time.Time) {
		s.metrics.ObserveStoreMethodsTime("DeleteCallSession", time.Since(start).Seconds())
	}(time.Now())

	qb := getQueryBuilder(s.driverName).
		Delete("calls_sessions").
		Where(sq.Eq{"ID": id})

	q, args, err := qb.ToSql()
	if err != nil {
		return fmt.Errorf("failed to prepare query: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(*s.settings.QueryTimeout)*time.Second)
	defer cancel()
	_, err = s.wDB.ExecContext(ctx, q, args...)
	if err != nil {
		return fmt.Errorf("failed to run query: %w", err)
	}

	return nil
}

func (s *Store) GetCallSession(id string, opts GetCallSessionOpts) (*public.CallSession, error) {
	s.metrics.IncStoreOp("GetCallSession")
	defer func(start time.Time) {
		s.metrics.ObserveStoreMethodsTime("GetCallSession", time.Since(start).Seconds())
	}(time.Now())

	qb := getQueryBuilder(s.driverName).Select("*").
		From("calls_sessions").
		Where(sq.Eq{"ID": id})

	q, args, err := qb.ToSql()
	if err != nil {
		return nil, fmt.Errorf("failed to prepare query: %w", err)
	}

	var session public.CallSession
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(*s.settings.QueryTimeout)*time.Second)
	defer cancel()
	if err := s.dbXFromGetOpts(opts).GetContext(ctx, &session, q, args...); err == sql.ErrNoRows {
		return nil, fmt.Errorf("call session not found")
	} else if err != nil {
		return nil, fmt.Errorf("failed to get call session: %w", err)
	}

	return &session, nil
}

func (s *Store) GetCallSessions(callID string, opts GetCallSessionOpts) (map[string]*public.CallSession, error) {
	s.metrics.IncStoreOp("GetCallSessions")
	defer func(start time.Time) {
		s.metrics.ObserveStoreMethodsTime("GetCallSessions", time.Since(start).Seconds())
	}(time.Now())

	qb := getQueryBuilder(s.driverName).Select("*").
		From("calls_sessions").
		Where(sq.Eq{"CallID": callID})

	q, args, err := qb.ToSql()
	if err != nil {
		return nil, fmt.Errorf("failed to prepare query: %w", err)
	}

	sessionsMap := make(map[string]*public.CallSession)
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(*s.settings.QueryTimeout)*time.Second)
	defer cancel()
	rows, err := s.dbFromGetOpts(opts).QueryContext(ctx, q, args...)
	if err != nil {
		return nil, fmt.Errorf("failed to get call sessions: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var session public.CallSession
		if err := rows.Scan(&session.ID, &session.CallID, &session.UserID, &session.JoinAt, &session.Unmuted, &session.RaisedHand); err != nil {
			return nil, fmt.Errorf("failed to scan rows: %w", err)
		}
		sessionsMap[session.ID] = &session
	}

	if err = rows.Err(); err != nil {
		return nil, fmt.Errorf("failed to read rows: %w", err)
	}

	return sessionsMap, nil
}

func (s *Store) DeleteCallsSessions(callID string) error {
	s.metrics.IncStoreOp("DeleteCallsSessions")
	defer func(start time.Time) {
		s.metrics.ObserveStoreMethodsTime("DeleteCallsSessions", time.Since(start).Seconds())
	}(time.Now())

	qb := getQueryBuilder(s.driverName).
		Delete("calls_sessions").
		Where(sq.Eq{"CallID": callID})

	q, args, err := qb.ToSql()
	if err != nil {
		return fmt.Errorf("failed to prepare query: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(*s.settings.QueryTimeout)*time.Second)
	defer cancel()
	_, err = s.wDB.ExecContext(ctx, q, args...)
	if err != nil {
		return fmt.Errorf("failed to run query: %w", err)
	}

	return nil
}

func (s *Store) GetCallSessionsCount(callID string, opts GetCallSessionOpts) (int, error) {
	s.metrics.IncStoreOp("GetCallSessionsCount")
	defer func(start time.Time) {
		s.metrics.ObserveStoreMethodsTime("GetCallSessionsCount", time.Since(start).Seconds())
	}(time.Now())

	qb := getQueryBuilder(s.driverName).Select("COUNT(*)").
		From("calls_sessions").
		Where(sq.Eq{"CallID": callID})

	q, args, err := qb.ToSql()
	if err != nil {
		return 0, fmt.Errorf("failed to prepare query: %w", err)
	}

	var count int
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(*s.settings.QueryTimeout)*time.Second)
	defer cancel()
	if err := s.dbXFromGetOpts(opts).GetContext(ctx, &count, q, args...); err != nil {
		return 0, fmt.Errorf("failed to get call sessions count: %w", err)
	}

	return count, nil
}

func (s *Store) IsUserInCall(userID, callID string, opts GetCallSessionOpts) (bool, error) {
	s.metrics.IncStoreOp("IsUserInCall")
	defer func(start time.Time) {
		s.metrics.ObserveStoreMethodsTime("IsUserInCall", time.Since(start).Seconds())
	}(time.Now())

	qb := getQueryBuilder(s.driverName).Select("1").
		From("calls_sessions").
		Where(
			sq.And{
				sq.Eq{"CallID": callID},
				sq.Eq{"UserID": userID},
			})

	q, args, err := qb.ToSql()
	if err != nil {
		return false, fmt.Errorf("failed to prepare query: %w", err)
	}

	var ok bool
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(*s.settings.QueryTimeout)*time.Second)
	defer cancel()
	if err := s.dbXFromGetOpts(opts).GetContext(ctx, &ok, q, args...); err == sql.ErrNoRows {
		return false, nil
	} else if err != nil {
		return false, fmt.Errorf("failed to get user in call: %w", err)
	}

	return ok, nil
}
