// Copyright (c) 2022-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package db

import (
	"context"
	"fmt"
	"math"
	"time"

	"github.com/mattermost/mattermost-plugin-calls/server/public"

	"github.com/mattermost/mattermost/server/public/model"

	sq "github.com/mattermost/squirrel"
)

func (s *Store) GetAvgCallParticipants() (int64, error) {
	s.metrics.IncStoreOp("GetAvgCallParticipants")
	defer func(start time.Time) {
		s.metrics.ObserveStoreMethodsTime("GetAvgCallParticipants", time.Since(start).Seconds())
	}(time.Now())

	qb := getQueryBuilder(s.driverName).
		Select("AVG(jsonb_array_length(participants))").
		From("calls").
		Where("jsonb_typeof(participants) = 'array'")
	if s.driverName == model.DatabaseDriverMysql {
		qb = getQueryBuilder(s.driverName).Select("AVG(json_length(participants))").From("calls")
	}
	qb = qb.Where(sq.And{
		sq.Expr("EndAt > StartAt"),
		sq.Eq{"DeleteAt": 0},
	})

	q, args, err := qb.ToSql()
	if err != nil {
		return 0, fmt.Errorf("failed to prepare query: %w", err)
	}

	var count *float64
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(*s.settings.QueryTimeout)*time.Second)
	defer cancel()
	if err := s.rDBx.GetContext(ctx, &count, q, args...); err != nil {
		return 0, fmt.Errorf("failed to get average call participants: %w", err)
	}

	if count == nil {
		return 0, nil
	}

	return int64(math.Round(*count)), nil
}

func (s *Store) GetAvgCallDuration() (int64, error) {
	s.metrics.IncStoreOp("GetAvgCallDuration")
	defer func(start time.Time) {
		s.metrics.ObserveStoreMethodsTime("GetAvgCallDuration", time.Since(start).Seconds())
	}(time.Now())

	qb := getQueryBuilder(s.driverName).Select("AVG(EndAt - StartAt)/1000").
		From("calls").
		Where(sq.And{
			sq.Expr("EndAt > StartAt"),
			sq.Eq{"DeleteAt": 0},
		})

	q, args, err := qb.ToSql()
	if err != nil {
		return 0, fmt.Errorf("failed to prepare query: %w", err)
	}

	var count *float64
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(*s.settings.QueryTimeout)*time.Second)
	defer cancel()
	if err := s.rDBx.GetContext(ctx, &count, q, args...); err != nil {
		return 0, fmt.Errorf("failed to get average call duration: %w", err)
	}

	if count == nil {
		return 0, nil
	}

	return int64(math.Round(*count)), nil
}

func (s *Store) GetTotalActiveSessions() (int64, error) {
	s.metrics.IncStoreOp("GetTotalActiveSessions")
	defer func(start time.Time) {
		s.metrics.ObserveStoreMethodsTime("GetTotalActiveSessions", time.Since(start).Seconds())
	}(time.Now())

	qb := getQueryBuilder(s.driverName).Select("COUNT(*)").
		From("calls_sessions").
		Join("calls ON calls_sessions.CallID = calls.ID").
		Where(sq.And{
			sq.Eq{"calls.EndAt": 0},
			sq.Eq{"calls.DeleteAt": 0},
		})

	q, args, err := qb.ToSql()
	if err != nil {
		return 0, fmt.Errorf("failed to prepare query: %w", err)
	}

	var count int64
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(*s.settings.QueryTimeout)*time.Second)
	defer cancel()
	if err := s.rDBx.GetContext(ctx, &count, q, args...); err != nil {
		return 0, fmt.Errorf("failed to get calls sessions count: %w", err)
	}

	return count, nil
}

func (s *Store) GetTotalCalls(active bool) (int64, error) {
	s.metrics.IncStoreOp("GetTotalCalls")
	defer func(start time.Time) {
		s.metrics.ObserveStoreMethodsTime("GetTotalCalls", time.Since(start).Seconds())
	}(time.Now())

	qb := getQueryBuilder(s.driverName).Select("COUNT(*)").From("calls")

	if active {
		qb = qb.Where(sq.And{
			sq.Eq{"EndAt": 0},
			sq.Eq{"DeleteAt": 0},
		})
	} else {
		qb = qb.Where(sq.And{
			sq.Expr("EndAt > StartAt"),
			sq.Eq{"DeleteAt": 0},
		})
	}

	q, args, err := qb.ToSql()
	if err != nil {
		return 0, fmt.Errorf("failed to prepare query: %w", err)
	}

	var count int64
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(*s.settings.QueryTimeout)*time.Second)
	defer cancel()
	if err := s.rDBx.GetContext(ctx, &count, q, args...); err != nil {
		return 0, fmt.Errorf("failed to get calls count: %w", err)
	}

	return count, nil
}

func (s *Store) GetCallsByChannelType() (map[string]int64, error) {
	s.metrics.IncStoreOp("GetCallsByChannelType")
	defer func(start time.Time) {
		s.metrics.ObserveStoreMethodsTime("GetCallsByChannelType", time.Since(start).Seconds())
	}(time.Now())

	qb := getQueryBuilder(s.driverName).Select("COUNT(*) AS Count, Type").
		From("calls").
		Join("Channels ON calls.ChannelID = Channels.Id").
		Where(sq.And{
			sq.Expr("calls.EndAt > calls.StartAt"),
			sq.Eq{"calls.DeleteAt": 0},
		}).GroupBy("Type")

	q, args, err := qb.ToSql()
	if err != nil {
		return nil, fmt.Errorf("failed to prepare query: %w", err)
	}

	var rows []struct {
		Type  string
		Count int64
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(*s.settings.QueryTimeout)*time.Second)
	defer cancel()
	if err := s.rDBx.SelectContext(ctx, &rows, q, args...); err != nil {
		return nil, fmt.Errorf("failed to run query: %w", err)
	}

	m := make(map[string]int64, 12)
	for _, row := range rows {
		m[row.Type] = row.Count
	}

	return m, nil
}

func (s *Store) GetCallsByMonth() (map[string]int64, error) {
	s.metrics.IncStoreOp("GetCallsByMonth")
	defer func(start time.Time) {
		s.metrics.ObserveStoreMethodsTime("GetCallsByMonth", time.Since(start).Seconds())
	}(time.Now())

	qb := getQueryBuilder(s.driverName).
		Select("to_char(to_timestamp(startat / 1000), 'YYYY-MM') AS Month, COUNT(*) AS Count")
	if s.driverName == model.DatabaseDriverMysql {
		qb = getQueryBuilder(s.driverName).
			Select("DATE_FORMAT(FROM_UNIXTIME(startat / 1000), '%Y-%m') AS Month, COUNT(*) AS Count")
	}
	qb = qb.From("calls").Where(sq.And{
		sq.Expr("EndAt > calls.StartAt"),
		sq.Eq{"DeleteAt": 0},
		sq.GtOrEq{"StartAt": time.Now().AddDate(0, -12, 0).UnixMilli()},
	}).GroupBy("Month").OrderBy("Month").Limit(12)

	q, args, err := qb.ToSql()
	if err != nil {
		return nil, fmt.Errorf("failed to prepare query: %w", err)
	}

	var rows []struct {
		Month string
		Count int64
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(*s.settings.QueryTimeout)*time.Second)
	defer cancel()
	if err := s.rDBx.SelectContext(ctx, &rows, q, args...); err != nil {
		return nil, fmt.Errorf("failed to run query: %w", err)
	}

	m := make(map[string]int64, 12)
	for i := 0; i < 12; i++ {
		m[time.Now().AddDate(0, -i, 0).Format("2006-01")] = 0
	}

	for _, row := range rows {
		m[row.Month] = row.Count
	}

	return m, nil
}

func (s *Store) GetCallsByDay() (map[string]int64, error) {
	s.metrics.IncStoreOp("GetCallsByDay")
	defer func(start time.Time) {
		s.metrics.ObserveStoreMethodsTime("GetCallsByDay", time.Since(start).Seconds())
	}(time.Now())

	qb := getQueryBuilder(s.driverName).
		Select("to_char(to_timestamp(startat / 1000), 'YYYY-MM-DD') AS Day, COUNT(*) AS Count")
	if s.driverName == model.DatabaseDriverMysql {
		qb = getQueryBuilder(s.driverName).
			Select("DATE_FORMAT(FROM_UNIXTIME(startat / 1000), '%Y-%m-%d') AS Day, COUNT(*) AS Count")
	}
	qb = qb.From("calls").Where(sq.And{
		sq.Expr("EndAt > calls.StartAt"),
		sq.Eq{"DeleteAt": 0},
		sq.GtOrEq{"StartAt": time.Now().AddDate(0, 0, -30).UnixMilli()},
	}).GroupBy("Day").OrderBy("Day").Limit(30)

	q, args, err := qb.ToSql()
	if err != nil {
		return nil, fmt.Errorf("failed to prepare query: %w", err)
	}

	var rows []struct {
		Day   string
		Count int64
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(*s.settings.QueryTimeout)*time.Second)
	defer cancel()
	if err := s.rDBx.SelectContext(ctx, &rows, q, args...); err != nil {
		return nil, fmt.Errorf("failed to run query: %w", err)
	}

	m := make(map[string]int64, 30)
	for i := 0; i < 30; i++ {
		m[time.Now().AddDate(0, 0, -i).Format("2006-01-02")] = 0
	}

	for _, row := range rows {
		m[row.Day] = row.Count
	}

	return m, nil
}

func (s *Store) GetCallsStats() (*public.CallsStats, error) {
	s.metrics.IncStoreOp("GetCallsStats")
	defer func(start time.Time) {
		s.metrics.ObserveStoreMethodsTime("GetCallsStats", time.Since(start).Seconds())
	}(time.Now())

	var err error
	var stats public.CallsStats

	stats.TotalCalls, err = s.GetTotalCalls(false)
	if err != nil {
		return nil, err
	}

	stats.TotalActiveCalls, err = s.GetTotalCalls(true)
	if err != nil {
		return nil, err
	}

	stats.TotalActiveSessions, err = s.GetTotalActiveSessions()
	if err != nil {
		return nil, err
	}

	stats.CallsByDay, err = s.GetCallsByDay()
	if err != nil {
		return nil, err
	}

	stats.CallsByMonth, err = s.GetCallsByMonth()
	if err != nil {
		return nil, err
	}

	stats.CallsByChannelType, err = s.GetCallsByChannelType()
	if err != nil {
		return nil, err
	}

	stats.AvgDuration, err = s.GetAvgCallDuration()
	if err != nil {
		return nil, err
	}

	stats.AvgParticipants, err = s.GetAvgCallParticipants()
	if err != nil {
		return nil, err
	}

	return &stats, nil
}
