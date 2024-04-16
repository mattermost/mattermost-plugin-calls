// Copyright (c) 2022-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package db

import (
	"database/sql"
	"fmt"

	"github.com/mattermost/mattermost-plugin-calls/server/public"

	sq "github.com/mattermost/squirrel"
)

func (s *Store) CreateCallSession(session *public.CallSession) error {
	s.metrics.IncStoreOp("CreateCallSession")

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

	_, err = s.wDB.Exec(q, args...)
	if err != nil {
		return fmt.Errorf("failed to run query: %w", err)
	}

	return nil
}

func (s *Store) UpdateCallSession(session *public.CallSession) error {
	s.metrics.IncStoreOp("UpdateCallSession")

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

	_, err = s.wDB.Exec(q, args...)
	if err != nil {
		return fmt.Errorf("failed to run query: %w", err)
	}

	return nil
}

func (s *Store) DeleteCallSession(id string) error {
	s.metrics.IncStoreOp("DeleteCallSession")

	qb := getQueryBuilder(s.driverName).
		Delete("calls_sessions").
		Where(sq.Eq{"ID": id})

	q, args, err := qb.ToSql()
	if err != nil {
		return fmt.Errorf("failed to prepare query: %w", err)
	}

	_, err = s.wDB.Exec(q, args...)
	if err != nil {
		return fmt.Errorf("failed to run query: %w", err)
	}

	return nil
}

func (s *Store) GetCallSession(id string, opts GetCallSessionOpts) (*public.CallSession, error) {
	s.metrics.IncStoreOp("GetCallSession")

	qb := getQueryBuilder(s.driverName).Select("*").
		From("calls_sessions").
		Where(sq.Eq{"ID": id})

	q, args, err := qb.ToSql()
	if err != nil {
		return nil, fmt.Errorf("failed to prepare query: %w", err)
	}

	var session public.CallSession
	if err := s.dbXFromGetOpts(opts).Get(&session, q, args...); err == sql.ErrNoRows {
		return nil, fmt.Errorf("call session not found")
	} else if err != nil {
		return nil, fmt.Errorf("failed to get call session: %w", err)
	}

	return &session, nil
}

func (s *Store) GetCallSessions(callID string, opts GetCallSessionOpts) (map[string]*public.CallSession, error) {
	s.metrics.IncStoreOp("GetCallSessions")

	qb := getQueryBuilder(s.driverName).Select("*").
		From("calls_sessions").
		Where(sq.Eq{"CallID": callID})

	q, args, err := qb.ToSql()
	if err != nil {
		return nil, fmt.Errorf("failed to prepare query: %w", err)
	}

	sessions := []*public.CallSession{}
	if err := s.dbXFromGetOpts(opts).Select(&sessions, q, args...); err != nil {
		return nil, fmt.Errorf("failed to get call sessions: %w", err)
	}

	sessionsMap := make(map[string]*public.CallSession, len(sessions))
	for _, session := range sessions {
		sessionsMap[session.ID] = session
	}

	return sessionsMap, nil
}

func (s *Store) DeleteCallsSessions(callID string) error {
	s.metrics.IncStoreOp("DeleteCallsSessions")

	qb := getQueryBuilder(s.driverName).
		Delete("calls_sessions").
		Where(sq.Eq{"CallID": callID})

	q, args, err := qb.ToSql()
	if err != nil {
		return fmt.Errorf("failed to prepare query: %w", err)
	}

	_, err = s.wDB.Exec(q, args...)
	if err != nil {
		return fmt.Errorf("failed to run query: %w", err)
	}

	return nil
}
