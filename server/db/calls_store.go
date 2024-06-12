package db

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/mattermost/mattermost-plugin-calls/server/public"

	"github.com/mattermost/mattermost/server/public/model"

	sq "github.com/mattermost/squirrel"
)

var callsColumns = []string{
	"ID",
	"ChannelID",
	"StartAt",
	"EndAt",
	"CreateAt",
	"DeleteAt",
	"Title",
	"PostID",
	"ThreadID",
	"OwnerID",
	"Participants",
	"Stats",
	"Props",
}

func (s *Store) CreateCall(call *public.Call) error {
	s.metrics.IncStoreOp("CreateCall")
	defer func(start time.Time) {
		s.metrics.ObserveStoreMethodsTime("CreateCall", time.Since(start).Seconds())
	}(time.Now())

	if err := call.IsValid(); err != nil {
		return fmt.Errorf("invalid call: %w", err)
	}

	qb := getQueryBuilder(s.driverName).
		Insert("calls").
		Columns(callsColumns...).
		Values(call.ID, call.ChannelID, call.StartAt, call.EndAt, call.CreateAt, call.DeleteAt,
			call.Title, call.PostID, call.ThreadID, call.OwnerID,
			s.newJSONValueWrapper(call.Participants), s.newJSONValueWrapper(call.Stats), s.newJSONValueWrapper(call.Props))

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

func (s *Store) UpdateCall(call *public.Call) error {
	s.metrics.IncStoreOp("UpdateCall")
	defer func(start time.Time) {
		s.metrics.ObserveStoreMethodsTime("UpdateCall", time.Since(start).Seconds())
	}(time.Now())

	if err := call.IsValid(); err != nil {
		return fmt.Errorf("invalid call: %w", err)
	}

	qb := getQueryBuilder(s.driverName).
		Update("calls").
		Set("EndAt", call.EndAt).
		Set("DeleteAt", call.DeleteAt).
		Set("ThreadID", call.ThreadID).
		Set("PostID", call.PostID).
		Set("Participants", s.newJSONValueWrapper(call.Participants)).
		Set("Stats", s.newJSONValueWrapper(call.Stats)).
		Set("Props", s.newJSONValueWrapper(call.Props)).
		Where(sq.Eq{"ID": call.ID})

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

func (s *Store) DeleteCall(callID string) error {
	s.metrics.IncStoreOp("DeleteCall")
	defer func(start time.Time) {
		s.metrics.ObserveStoreMethodsTime("DeleteCall", time.Since(start).Seconds())
	}(time.Now())

	qb := getQueryBuilder(s.driverName).
		Update("calls").
		Set("DeleteAt", time.Now().UnixMilli()).
		Where(sq.Eq{"ID": callID})

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

func (s *Store) DeleteCallByChannelID(channelID string) error {
	s.metrics.IncStoreOp("DeleteCallByChannelID")
	defer func(start time.Time) {
		s.metrics.ObserveStoreMethodsTime("DeleteCallByChannelID", time.Since(start).Seconds())
	}(time.Now())

	qb := getQueryBuilder(s.driverName).
		Update("calls").
		Set("DeleteAt", time.Now().UnixMilli()).
		Where(sq.Eq{"ChannelID": channelID})

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

func (s *Store) GetCall(callID string, opts GetCallOpts) (*public.Call, error) {
	s.metrics.IncStoreOp("GetCall")
	defer func(start time.Time) {
		s.metrics.ObserveStoreMethodsTime("GetCall", time.Since(start).Seconds())
	}(time.Now())

	qb := getQueryBuilder(s.driverName).Select("*").
		From("calls").
		Where(sq.Eq{"ID": callID})

	q, args, err := qb.ToSql()
	if err != nil {
		return nil, fmt.Errorf("failed to prepare query: %w", err)
	}

	var call public.Call
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(*s.settings.QueryTimeout)*time.Second)
	defer cancel()
	if err := s.dbXFromGetOpts(opts).GetContext(ctx, &call, q, args...); err == sql.ErrNoRows {
		return nil, fmt.Errorf("call %w", ErrNotFound)
	} else if err != nil {
		return nil, fmt.Errorf("failed to get call: %w", err)
	}

	return &call, nil
}

func (s *Store) GetCallActive(channelID string, opts GetCallOpts) (bool, error) {
	s.metrics.IncStoreOp("GetCallActive")
	defer func(start time.Time) {
		s.metrics.ObserveStoreMethodsTime("GetCallActive", time.Since(start).Seconds())
	}(time.Now())

	qb := getQueryBuilder(s.driverName).Select("1").
		From("calls").
		Where(
			sq.And{
				sq.Eq{"ChannelID": channelID},
				sq.Eq{"EndAt": 0},
				sq.Gt{"StartAt": 0},
				sq.Eq{"DeleteAt": 0},
			})

	q, args, err := qb.ToSql()
	if err != nil {
		return false, fmt.Errorf("failed to prepare query: %w", err)
	}

	var active bool
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(*s.settings.QueryTimeout)*time.Second)
	defer cancel()
	if err := s.dbXFromGetOpts(opts).GetContext(ctx, &active, q, args...); err == sql.ErrNoRows {
		return false, nil
	} else if err != nil {
		return false, fmt.Errorf("failed to get call: %w", err)
	}

	return active, nil
}

func (s *Store) GetActiveCallByChannelID(channelID string, opts GetCallOpts) (*public.Call, error) {
	s.metrics.IncStoreOp("GetActiveCallByChannelID")
	defer func(start time.Time) {
		s.metrics.ObserveStoreMethodsTime("GetActiveCallByChannelID", time.Since(start).Seconds())
	}(time.Now())

	qb := getQueryBuilder(s.driverName).Select("*").
		From("calls").
		Where(
			sq.And{
				sq.Eq{"ChannelID": channelID},
				sq.Eq{"EndAt": 0},
				sq.Gt{"StartAt": 0},
				sq.Eq{"DeleteAt": 0},
			},
		).OrderBy("StartAt DESC, ID").Limit(1)

	q, args, err := qb.ToSql()
	if err != nil {
		return nil, fmt.Errorf("failed to prepare query: %w", err)
	}

	var call public.Call
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(*s.settings.QueryTimeout)*time.Second)
	defer cancel()
	if err := s.dbXFromGetOpts(opts).GetContext(ctx, &call, q, args...); err == sql.ErrNoRows {
		return nil, fmt.Errorf("call %w", ErrNotFound)
	} else if err != nil {
		return nil, fmt.Errorf("failed to get call: %w", err)
	}

	return &call, nil
}

func (s *Store) GetAllActiveCalls(opts GetCallOpts) ([]*public.Call, error) {
	s.metrics.IncStoreOp("GetAllActiveCalls")
	defer func(start time.Time) {
		s.metrics.ObserveStoreMethodsTime("GetAllActiveCalls", time.Since(start).Seconds())
	}(time.Now())

	qb := getQueryBuilder(s.driverName).Select("*").
		From("calls").
		Where(
			sq.And{
				sq.Eq{"EndAt": 0},
				sq.Gt{"StartAt": 0},
				sq.Eq{"DeleteAt": 0},
			},
		).OrderBy("StartAt DESC, ID")

	q, args, err := qb.ToSql()
	if err != nil {
		return nil, fmt.Errorf("failed to prepare query: %w", err)
	}

	calls := []*public.Call{}
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(*s.settings.QueryTimeout)*time.Second)
	defer cancel()
	if err := s.dbXFromGetOpts(opts).SelectContext(ctx, &calls, q, args...); err != nil {
		return nil, fmt.Errorf("failed to get calls: %w", err)
	}

	return calls, nil
}

func (s *Store) GetRTCDHostForCall(callID string, opts GetCallOpts) (string, error) {
	s.metrics.IncStoreOp("GetRTCDHostForCall")
	defer func(start time.Time) {
		s.metrics.ObserveStoreMethodsTime("GetRTCDHostForCall", time.Since(start).Seconds())
	}(time.Now())

	selectProp := "COALESCE(props->>'rtcd_host', '')"
	if s.driverName == model.DatabaseDriverMysql {
		selectProp = `COALESCE(Props->>"$.rtcd_host", '')`
	}

	qb := getQueryBuilder(s.driverName).Select(selectProp).
		From("calls").
		Where(sq.Eq{"ID": callID}).OrderBy("StartAt DESC, ID").Limit(1)

	q, args, err := qb.ToSql()
	if err != nil {
		return "", fmt.Errorf("failed to prepare query: %w", err)
	}

	var rtcdHost string
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(*s.settings.QueryTimeout)*time.Second)
	defer cancel()
	if err := s.dbXFromGetOpts(opts).GetContext(ctx, &rtcdHost, q, args...); err == sql.ErrNoRows {
		return "", fmt.Errorf("call %w", ErrNotFound)
	} else if err != nil {
		return "", fmt.Errorf("failed to get rtcdHost for call: %w", err)
	}

	return rtcdHost, nil
}
