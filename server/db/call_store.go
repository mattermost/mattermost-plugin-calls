package db

import (
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

func (s *Store) CreateCall(call *public.Call) (*public.Call, error) {
	s.metrics.IncStoreOp("CreateCall")

	if call == nil {
		return nil, fmt.Errorf("call should not be nil")
	}

	if call.ID != "" {
		return nil, fmt.Errorf("invalid ID: should be empty")
	}

	if call.ChannelID == "" {
		return nil, fmt.Errorf("invalid ChannelID: should not be empty")
	}

	if call.StartAt == 0 {
		return nil, fmt.Errorf("invalid StartAt: should be > 0")
	}

	if call.CreateAt != 0 {
		return nil, fmt.Errorf("invalid CreateAt: should be zero")
	}

	if call.DeleteAt != 0 {
		return nil, fmt.Errorf("invalid DeleteAt: should be zero")
	}

	if call.PostID == "" {
		return nil, fmt.Errorf("invalid PostID: should not be empty")
	}

	if call.ThreadID == "" {
		return nil, fmt.Errorf("invalid ThreadID: should not be empty")
	}

	if call.OwnerID == "" {
		return nil, fmt.Errorf("invalid OwnerID: should not be empty")
	}

	call.ID = model.NewId()
	call.CreateAt = time.Now().UnixMilli()

	qb := getQueryBuilder(s.driverName).
		Insert("Calls").
		Columns(callsColumns...).
		Values(call.ID, call.ChannelID, call.StartAt, call.EndAt, call.CreateAt, call.DeleteAt,
			call.Title, call.PostID, call.ThreadID, call.OwnerID,
			call.Participants, call.Stats, call.Props)

	q, args, err := qb.ToSql()
	if err != nil {
		return nil, fmt.Errorf("failed to prepare query: %w", err)
	}

	_, err = s.wDB.Exec(q, args...)
	if err != nil {
		return nil, fmt.Errorf("failed to run query: %w", err)
	}

	return call, nil
}

func (s *Store) UpdateCall(call *public.Call) error {
	s.metrics.IncStoreOp("UpdateCall")

	if call == nil {
		return fmt.Errorf("call should not be nil")
	}

	qb := getQueryBuilder(s.driverName).
		Update("Calls").
		Set("EndAt", call.EndAt).
		Set("DeleteAt", call.DeleteAt).
		Set("Participants", call.Participants).
		Set("Stats", call.Stats).
		Set("Props", call.Props).
		Where(
			sq.Eq{"ID": call.ID},
			sq.Eq{"ChannelID": call.ChannelID},
		)

	q, args, err := qb.ToSql()
	if err != nil {
		return fmt.Errorf("failed to prepare query: %w", err)
	}

	res, err := s.wDB.Exec(q, args...)
	if err != nil {
		return fmt.Errorf("failed to run query: %w", err)
	}

	count, err := res.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}

	if count != 1 {
		return fmt.Errorf("failed to update call")
	}

	return nil
}

func (s *Store) DeleteCall(callID string) error {
	s.metrics.IncStoreOp("DeleteCall")

	qb := getQueryBuilder(s.driverName).
		Update("Calls").
		Set("DeleteAt", time.Now().UnixMilli()).
		Where(sq.Eq{"ID": callID})

	q, args, err := qb.ToSql()
	if err != nil {
		return fmt.Errorf("failed to prepare query: %w", err)
	}

	res, err := s.wDB.Exec(q, args...)
	if err != nil {
		return fmt.Errorf("failed to run query: %w", err)
	}

	count, err := res.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}

	if count != 1 {
		return fmt.Errorf("failed to delete call")
	}

	return nil
}

func (s *Store) DeleteCallByChannelID(channelID string) error {
	s.metrics.IncStoreOp("DeleteCallByChannelID")

	qb := getQueryBuilder(s.driverName).
		Update("Calls").
		Set("DeleteAt", time.Now().UnixMilli()).
		Where(sq.Eq{"ChannelID": channelID})

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

func (s *Store) GetCall(callID string, opts GetCallOpts) (*public.Call, error) {
	s.metrics.IncStoreOp("GetCall")

	qb := getQueryBuilder(s.driverName).Select("*").
		From("Calls").
		Where(sq.Eq{"ID": callID})

	q, args, err := qb.ToSql()
	if err != nil {
		return nil, fmt.Errorf("failed to prepare query: %w", err)
	}

	var call public.Call
	if err := s.dbXFromGetOpts(opts).Get(&call, q, args...); err == sql.ErrNoRows {
		return nil, fmt.Errorf("call not found")
	} else if err != nil {
		return nil, fmt.Errorf("failed to get call: %w", err)
	}

	return &call, nil
}

func (s *Store) GetCallByChannelID(channelID string, opts GetCallOpts) (*public.Call, error) {
	s.metrics.IncStoreOp("GetCallByChannelID")

	qb := getQueryBuilder(s.driverName).Select("*").
		From("Calls").
		Where(sq.Eq{"ChannelID": channelID})

	q, args, err := qb.ToSql()
	if err != nil {
		return nil, fmt.Errorf("failed to prepare query: %w", err)
	}

	var call public.Call
	if err := s.dbXFromGetOpts(opts).Get(&call, q, args...); err == sql.ErrNoRows {
		return nil, fmt.Errorf("call not found")
	} else if err != nil {
		return nil, fmt.Errorf("failed to get call: %w", err)
	}

	return &call, nil
}
