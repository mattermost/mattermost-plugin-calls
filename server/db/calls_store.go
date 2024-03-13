package db

import (
	"database/sql"
	"fmt"
	"time"

	"github.com/mattermost/mattermost-plugin-calls/server/public"

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

	if err := call.IsValid(); err != nil {
		return fmt.Errorf("invalid call: %w", err)
	}

	qb := getQueryBuilder(s.driverName).
		Insert("calls").
		Columns(callsColumns...).
		Values(call.ID, call.ChannelID, call.StartAt, call.EndAt, call.CreateAt, call.DeleteAt,
			call.Title, call.PostID, call.ThreadID, call.OwnerID,
			call.Participants, call.Stats, call.Props)

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

func (s *Store) UpdateCall(call *public.Call) error {
	s.metrics.IncStoreOp("UpdateCall")

	if err := call.IsValid(); err != nil {
		return fmt.Errorf("invalid call: %w", err)
	}

	qb := getQueryBuilder(s.driverName).
		Update("calls").
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
		Update("calls").
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
		Update("calls").
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
		From("calls").
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
		From("calls").
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
