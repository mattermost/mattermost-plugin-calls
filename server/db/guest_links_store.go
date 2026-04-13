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

var guestLinksColumns = []string{
	"ID",
	"ChannelID",
	"Type",
	"CreatedBy",
	"CreateAt",
	"DeleteAt",
	"ExpiresAt",
	"MaxUses",
	"UseCount",
	"Secret",
	"TrunkID",
	"DispatchRuleID",
	"Props",
}

func (s *Store) CreateGuestLink(link *public.GuestLink) error {
	s.metrics.IncStoreOp("CreateGuestLink")
	defer func(start time.Time) {
		s.metrics.ObserveStoreMethodsTime("CreateGuestLink", time.Since(start).Seconds())
	}(time.Now())

	if err := link.IsValid(); err != nil {
		return fmt.Errorf("invalid guest link: %w", err)
	}

	qb := getQueryBuilder(s.driverName).
		Insert("calls_guest_links").
		Columns(guestLinksColumns...).
		Values(link.ID, link.ChannelID, link.Type, link.CreatedBy,
			link.CreateAt, link.DeleteAt, link.ExpiresAt, link.MaxUses, link.UseCount,
			link.Secret, link.TrunkID, link.DispatchRuleID,
			s.newJSONValueWrapper(link.Props))

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

func (s *Store) GetGuestLink(id string, opts GetGuestLinkOpts) (*public.GuestLink, error) {
	s.metrics.IncStoreOp("GetGuestLink")
	defer func(start time.Time) {
		s.metrics.ObserveStoreMethodsTime("GetGuestLink", time.Since(start).Seconds())
	}(time.Now())

	qb := getQueryBuilder(s.driverName).Select(guestLinksColumns...).
		From("calls_guest_links").
		Where(sq.Eq{"ID": id})

	q, args, err := qb.ToSql()
	if err != nil {
		return nil, fmt.Errorf("failed to prepare query: %w", err)
	}

	var link public.GuestLink
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(*s.settings.QueryTimeout)*time.Second)
	defer cancel()
	if err := s.dbXFromGetOpts(opts).GetContext(ctx, &link, q, args...); err == sql.ErrNoRows {
		return nil, ErrNotFound
	} else if err != nil {
		return nil, fmt.Errorf("failed to get guest link: %w", err)
	}

	return &link, nil
}

func (s *Store) GetGuestLinkBySecret(secret string, opts GetGuestLinkOpts) (*public.GuestLink, error) {
	s.metrics.IncStoreOp("GetGuestLinkBySecret")
	defer func(start time.Time) {
		s.metrics.ObserveStoreMethodsTime("GetGuestLinkBySecret", time.Since(start).Seconds())
	}(time.Now())

	qb := getQueryBuilder(s.driverName).Select(guestLinksColumns...).
		From("calls_guest_links").
		Where(sq.Eq{"Secret": secret})

	q, args, err := qb.ToSql()
	if err != nil {
		return nil, fmt.Errorf("failed to prepare query: %w", err)
	}

	var link public.GuestLink
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(*s.settings.QueryTimeout)*time.Second)
	defer cancel()
	if err := s.dbXFromGetOpts(opts).GetContext(ctx, &link, q, args...); err == sql.ErrNoRows {
		return nil, ErrNotFound
	} else if err != nil {
		return nil, fmt.Errorf("failed to get guest link by secret: %w", err)
	}

	return &link, nil
}

func (s *Store) GetActiveGuestLinksByChannel(channelID string, opts GetGuestLinkOpts) ([]*public.GuestLink, error) {
	s.metrics.IncStoreOp("GetActiveGuestLinksByChannel")
	defer func(start time.Time) {
		s.metrics.ObserveStoreMethodsTime("GetActiveGuestLinksByChannel", time.Since(start).Seconds())
	}(time.Now())

	qb := getQueryBuilder(s.driverName).Select(guestLinksColumns...).
		From("calls_guest_links").
		Where(sq.And{
			sq.Eq{"ChannelID": channelID},
			sq.Eq{"DeleteAt": 0},
		}).
		OrderBy("CreateAt DESC")

	q, args, err := qb.ToSql()
	if err != nil {
		return nil, fmt.Errorf("failed to prepare query: %w", err)
	}

	var links []*public.GuestLink
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(*s.settings.QueryTimeout)*time.Second)
	defer cancel()
	if err := s.dbXFromGetOpts(opts).SelectContext(ctx, &links, q, args...); err != nil {
		return nil, fmt.Errorf("failed to get active guest links: %w", err)
	}

	return links, nil
}

func (s *Store) DeleteGuestLink(id string) error {
	s.metrics.IncStoreOp("DeleteGuestLink")
	defer func(start time.Time) {
		s.metrics.ObserveStoreMethodsTime("DeleteGuestLink", time.Since(start).Seconds())
	}(time.Now())

	qb := getQueryBuilder(s.driverName).
		Update("calls_guest_links").
		Set("DeleteAt", time.Now().UnixMilli()).
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

func (s *Store) IncrementGuestLinkUseCount(id string) error {
	s.metrics.IncStoreOp("IncrementGuestLinkUseCount")
	defer func(start time.Time) {
		s.metrics.ObserveStoreMethodsTime("IncrementGuestLinkUseCount", time.Since(start).Seconds())
	}(time.Now())

	// UseCount = UseCount + 1, done atomically in SQL.
	qb := getQueryBuilder(s.driverName).
		Update("calls_guest_links").
		Set("UseCount", sq.Expr("UseCount + 1")).
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

func (s *Store) GetActiveSIPGuestLinkByChannel(channelID string, opts GetGuestLinkOpts) (*public.GuestLink, error) {
	s.metrics.IncStoreOp("GetActiveSIPGuestLinkByChannel")
	defer func(start time.Time) {
		s.metrics.ObserveStoreMethodsTime("GetActiveSIPGuestLinkByChannel", time.Since(start).Seconds())
	}(time.Now())

	qb := getQueryBuilder(s.driverName).Select(guestLinksColumns...).
		From("calls_guest_links").
		Where(sq.And{
			sq.Eq{"ChannelID": channelID},
			sq.Eq{"Type": public.GuestLinkTypeSIP},
			sq.Eq{"DeleteAt": 0},
			sq.Eq{"MaxUses": 0},
		}).
		Limit(1)

	q, args, err := qb.ToSql()
	if err != nil {
		return nil, fmt.Errorf("failed to prepare query: %w", err)
	}

	var link public.GuestLink
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(*s.settings.QueryTimeout)*time.Second)
	defer cancel()
	if err := s.dbXFromGetOpts(opts).GetContext(ctx, &link, q, args...); err == sql.ErrNoRows {
		return nil, ErrNotFound
	} else if err != nil {
		return nil, fmt.Errorf("failed to get active SIP guest link: %w", err)
	}

	return &link, nil
}

func (s *Store) GetAllActiveSIPGuestLinks(opts GetGuestLinkOpts) ([]*public.GuestLink, error) {
	s.metrics.IncStoreOp("GetAllActiveSIPGuestLinks")
	defer func(start time.Time) {
		s.metrics.ObserveStoreMethodsTime("GetAllActiveSIPGuestLinks", time.Since(start).Seconds())
	}(time.Now())

	qb := getQueryBuilder(s.driverName).Select(guestLinksColumns...).
		From("calls_guest_links").
		Where(sq.And{
			sq.Eq{"Type": public.GuestLinkTypeSIP},
			sq.Eq{"DeleteAt": 0},
		})

	q, args, err := qb.ToSql()
	if err != nil {
		return nil, fmt.Errorf("failed to prepare query: %w", err)
	}

	var links []*public.GuestLink
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(*s.settings.QueryTimeout)*time.Second)
	defer cancel()
	if err := s.dbXFromGetOpts(opts).SelectContext(ctx, &links, q, args...); err != nil {
		return nil, fmt.Errorf("failed to get all active SIP guest links: %w", err)
	}

	return links, nil
}
