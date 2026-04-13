// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
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

var guestSessionsColumns = []string{
	"ID",
	"LinkID",
	"Type",
	"ChannelID",
	"DisplayName",
	"CreateAt",
	"EndAt",
	"IPAddress",
	"CallerNumber",
	"Props",
}

func (s *Store) CreateGuestSession(session *public.GuestSession) error {
	s.metrics.IncStoreOp("CreateGuestSession")
	defer func(start time.Time) {
		s.metrics.ObserveStoreMethodsTime("CreateGuestSession", time.Since(start).Seconds())
	}(time.Now())

	if err := session.IsValid(); err != nil {
		return fmt.Errorf("invalid guest session: %w", err)
	}

	qb := getQueryBuilder(s.driverName).
		Insert("calls_guest_sessions").
		Columns(guestSessionsColumns...).
		Values(session.ID, session.LinkID, session.Type, session.ChannelID,
			session.DisplayName, session.CreateAt, session.EndAt,
			session.IPAddress, session.CallerNumber,
			s.newJSONValueWrapper(session.Props))

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

func (s *Store) GetGuestSession(id string, opts GetGuestSessionOpts) (*public.GuestSession, error) {
	s.metrics.IncStoreOp("GetGuestSession")
	defer func(start time.Time) {
		s.metrics.ObserveStoreMethodsTime("GetGuestSession", time.Since(start).Seconds())
	}(time.Now())

	qb := getQueryBuilder(s.driverName).Select(guestSessionsColumns...).
		From("calls_guest_sessions").
		Where(sq.Eq{"ID": id})

	q, args, err := qb.ToSql()
	if err != nil {
		return nil, fmt.Errorf("failed to prepare query: %w", err)
	}

	var session public.GuestSession
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(*s.settings.QueryTimeout)*time.Second)
	defer cancel()
	if err := s.dbXFromGetOpts(opts).GetContext(ctx, &session, q, args...); err == sql.ErrNoRows {
		return nil, ErrNotFound
	} else if err != nil {
		return nil, fmt.Errorf("failed to get guest session: %w", err)
	}

	return &session, nil
}

func (s *Store) UpdateGuestSessionEndAt(id string, endAt int64) error {
	s.metrics.IncStoreOp("UpdateGuestSessionEndAt")
	defer func(start time.Time) {
		s.metrics.ObserveStoreMethodsTime("UpdateGuestSessionEndAt", time.Since(start).Seconds())
	}(time.Now())

	qb := getQueryBuilder(s.driverName).
		Update("calls_guest_sessions").
		Set("EndAt", endAt).
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

func (s *Store) GetGuestSessionsByChannel(channelID string, opts GetGuestSessionOpts) ([]*public.GuestSession, error) {
	s.metrics.IncStoreOp("GetGuestSessionsByChannel")
	defer func(start time.Time) {
		s.metrics.ObserveStoreMethodsTime("GetGuestSessionsByChannel", time.Since(start).Seconds())
	}(time.Now())

	qb := getQueryBuilder(s.driverName).Select(guestSessionsColumns...).
		From("calls_guest_sessions").
		Where(sq.Eq{"ChannelID": channelID}).
		OrderBy("CreateAt DESC")

	q, args, err := qb.ToSql()
	if err != nil {
		return nil, fmt.Errorf("failed to prepare query: %w", err)
	}

	var sessions []*public.GuestSession
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(*s.settings.QueryTimeout)*time.Second)
	defer cancel()
	if err := s.dbXFromGetOpts(opts).SelectContext(ctx, &sessions, q, args...); err != nil {
		return nil, fmt.Errorf("failed to get guest sessions by channel: %w", err)
	}

	return sessions, nil
}

func (s *Store) GetGuestSessionsByLink(linkID string, opts GetGuestSessionOpts) ([]*public.GuestSession, error) {
	s.metrics.IncStoreOp("GetGuestSessionsByLink")
	defer func(start time.Time) {
		s.metrics.ObserveStoreMethodsTime("GetGuestSessionsByLink", time.Since(start).Seconds())
	}(time.Now())

	qb := getQueryBuilder(s.driverName).Select(guestSessionsColumns...).
		From("calls_guest_sessions").
		Where(sq.Eq{"LinkID": linkID}).
		OrderBy("CreateAt DESC")

	q, args, err := qb.ToSql()
	if err != nil {
		return nil, fmt.Errorf("failed to prepare query: %w", err)
	}

	var sessions []*public.GuestSession
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(*s.settings.QueryTimeout)*time.Second)
	defer cancel()
	if err := s.dbXFromGetOpts(opts).SelectContext(ctx, &sessions, q, args...); err != nil {
		return nil, fmt.Errorf("failed to get guest sessions by link: %w", err)
	}

	return sessions, nil
}

func (s *Store) EndActiveGuestSessionsByChannel(channelID string, endAt int64) error {
	s.metrics.IncStoreOp("EndActiveGuestSessionsByChannel")
	defer func(start time.Time) {
		s.metrics.ObserveStoreMethodsTime("EndActiveGuestSessionsByChannel", time.Since(start).Seconds())
	}(time.Now())

	qb := getQueryBuilder(s.driverName).
		Update("calls_guest_sessions").
		Set("EndAt", endAt).
		Where(sq.And{
			sq.Eq{"ChannelID": channelID},
			sq.Eq{"EndAt": 0},
		})

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
