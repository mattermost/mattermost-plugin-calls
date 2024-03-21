package db

import (
	"database/sql"
	"fmt"

	"github.com/mattermost/mattermost-plugin-calls/server/public"

	sq "github.com/mattermost/squirrel"
)

func (s *Store) CreateCallsChannel(channel *public.CallsChannel) (*public.CallsChannel, error) {
	s.metrics.IncStoreOp("CreateCallsChannel")

	if channel == nil {
		return nil, fmt.Errorf("channel should not be nil")
	}

	if channel.ChannelID == "" {
		return nil, fmt.Errorf("invalid ChannelID: should not be empty")
	}

	qb := getQueryBuilder(s.driverName).
		Insert("calls_channels").
		Columns("ChannelID", "Enabled", "Props").
		Values(channel.ChannelID, channel.Enabled, channel.Props)

	q, args, err := qb.ToSql()
	if err != nil {
		return nil, fmt.Errorf("failed to prepare query: %w", err)
	}

	_, err = s.wDB.Exec(q, args...)
	if err != nil {
		return nil, fmt.Errorf("failed to run query: %w", err)
	}

	return channel, nil
}

func (s *Store) GetCallsChannel(channelID string, opts GetCallsChannelOpts) (*public.CallsChannel, error) {
	s.metrics.IncStoreOp("GetCallsChannel")

	qb := getQueryBuilder(s.driverName).Select("*").
		From("calls_channels").
		Where(sq.Eq{"ChannelID": channelID})

	q, args, err := qb.ToSql()
	if err != nil {
		return nil, fmt.Errorf("failed to prepare query: %w", err)
	}

	var channel public.CallsChannel
	if err := s.dbXFromGetOpts(opts).Get(&channel, q, args...); err == sql.ErrNoRows {
		return nil, fmt.Errorf("calls channel not found")
	} else if err != nil {
		return nil, fmt.Errorf("failed to get calls channel: %w", err)
	}

	return &channel, nil
}

func (s *Store) UpdateCallsChannel(channel *public.CallsChannel) error {
	s.metrics.IncStoreOp("UpdateCallsChannel")

	if channel == nil {
		return fmt.Errorf("channel should not be nil")
	}

	qb := getQueryBuilder(s.driverName).
		Update("calls_channels").
		Set("Enabled", channel.Enabled).
		Set("Props", channel.Props).
		Where(sq.Eq{"ChannelID": channel.ChannelID})

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
		return fmt.Errorf("failed to update calls channel")
	}

	return nil
}
