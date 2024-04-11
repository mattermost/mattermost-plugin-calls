package db

import (
	"database/sql"
	"fmt"

	"github.com/mattermost/mattermost-plugin-calls/server/public"

	sq "github.com/mattermost/squirrel"
)

func (s *Store) CreateCallsChannel(channel *public.CallsChannel) error {
	s.metrics.IncStoreOp("CreateCallsChannel")

	if err := channel.IsValid(); err != nil {
		return fmt.Errorf("invalid channel: %w", err)
	}

	qb := getQueryBuilder(s.driverName).
		Insert("calls_channels").
		Columns("ChannelID", "Enabled", "Props").
		Values(channel.ChannelID, channel.Enabled, s.newJSONValueWrapper(channel.Props))

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
		return nil, fmt.Errorf("calls channel %w", ErrNotFound)
	} else if err != nil {
		return nil, fmt.Errorf("failed to get calls channel: %w", err)
	}

	return &channel, nil
}

func (s *Store) GetAllCallsChannels(opts GetCallsChannelOpts) ([]*public.CallsChannel, error) {
	s.metrics.IncStoreOp("GetAllCallsChannels")

	// TODO: consider implementing paging
	// This should be fine for now as we wouldn't expect to have more than a few
	// channels with calls explicitly enabled/disabled.
	qb := getQueryBuilder(s.driverName).Select("*").From("calls_channels")

	q, args, err := qb.ToSql()
	if err != nil {
		return nil, fmt.Errorf("failed to prepare query: %w", err)
	}

	channels := []*public.CallsChannel{}
	if err := s.dbXFromGetOpts(opts).Select(&channels, q, args...); err != nil {
		return nil, fmt.Errorf("failed to get calls channels: %w", err)
	}

	return channels, nil
}

func (s *Store) UpdateCallsChannel(channel *public.CallsChannel) error {
	s.metrics.IncStoreOp("UpdateCallsChannel")

	if err := channel.IsValid(); err != nil {
		return fmt.Errorf("invalid channel: %w", err)
	}

	qb := getQueryBuilder(s.driverName).
		Update("calls_channels").
		Set("Enabled", channel.Enabled).
		Set("Props", s.newJSONValueWrapper(channel.Props)).
		Where(sq.Eq{"ChannelID": channel.ChannelID})

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
