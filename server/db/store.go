// Copyright (c) 2022-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package db

import (
	"database/sql"
	"database/sql/driver"
	"fmt"

	"github.com/mattermost/mattermost-plugin-calls/server/interfaces"
	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/shared/mlog"

	"github.com/jmoiron/sqlx"
	sq "github.com/mattermost/squirrel"
)

type Store struct {
	settings   model.SqlSettings
	driverName string
	log        mlog.LoggerIFace
	metrics    interfaces.StoreMetrics

	// Writer
	wDB  *sql.DB
	wDBx *sqlx.DB
	// Reader
	rDB  *sql.DB
	rDBx *sqlx.DB
}

func NewStore(settings model.SqlSettings, wConnector, rConnector driver.Connector, log mlog.LoggerIFace, metrics interfaces.StoreMetrics) (*Store, error) {
	if settings.DriverName == nil {
		return nil, fmt.Errorf("invalid nil DriverName")
	}

	if *settings.DriverName != model.DatabaseDriverMysql && *settings.DriverName != model.DatabaseDriverPostgres {
		return nil, fmt.Errorf("invalid db driver %q", *settings.DriverName)
	}

	if settings.MigrationsStatementTimeoutSeconds == nil {
		return nil, fmt.Errorf("invalid nil MigrationsStatementTimeoutSeconds")
	}

	if wConnector == nil {
		return nil, fmt.Errorf("invalid nil writer connector")
	}

	if rConnector == nil {
		log.Info("store: no reader connector passed, using writer")
		rConnector = wConnector
	}

	if log == nil {
		return nil, fmt.Errorf("invalid nil logger")
	}

	if metrics == nil {
		return nil, fmt.Errorf("invalid nil metrics")
	}

	st := &Store{
		settings:   settings,
		driverName: *settings.DriverName,
		metrics:    metrics,
		log:        log,
	}

	st.wDB = sql.OpenDB(wConnector)
	if err := st.wDB.Ping(); err != nil {
		return nil, fmt.Errorf("failed to ping writer DB: %w", err)
	}
	st.wDBx = sqlx.NewDb(st.wDB, st.driverName)
	if st.driverName == model.DatabaseDriverMysql {
		st.wDBx.MapperFunc(func(s string) string { return s })
	}

	st.rDB = sql.OpenDB(rConnector)
	if err := st.rDB.Ping(); err != nil {
		return nil, fmt.Errorf("failed to ping reader DB: %w", err)
	}
	st.rDBx = sqlx.NewDb(st.rDB, st.driverName)
	if st.driverName == model.DatabaseDriverMysql {
		st.rDBx.MapperFunc(func(s string) string { return s })
	}

	return st, nil
}

func (s *Store) Close() error {
	if s == nil {
		return nil
	}

	var ret error
	if err := s.wDB.Close(); err != nil {
		s.log.Error("failed to close writer db", mlog.Err(err))
		ret = err
	}
	if err := s.rDB.Close(); err != nil {
		s.log.Error("failed to close reader db", mlog.Err(err))
		ret = err
	}

	return ret
}

func getQueryBuilder(driverName string) sq.StatementBuilderType {
	return sq.StatementBuilder.PlaceholderFormat(getQueryPlaceholder(driverName))
}

func getQueryPlaceholder(driverName string) sq.PlaceholderFormat {
	if driverName == model.DatabaseDriverPostgres {
		return sq.Dollar
	}
	return sq.Question
}

func (s *Store) KVGet(pluginID, key string, fromWriter bool) ([]byte, error) {
	s.metrics.IncStoreOp("KVGet")

	db := s.wDB
	if !fromWriter {
		db = s.rDB
	}

	qb := getQueryBuilder(s.driverName).Select("PValue").
		From("PluginKeyValueStore").
		Where(sq.Eq{"PluginId": pluginID}).
		Where(sq.Eq{"PKey": key}).
		Where(sq.Or{sq.Eq{"ExpireAt": 0}, sq.Gt{"ExpireAt": model.GetMillis()}})
	q, args, err := qb.ToSql()
	if err != nil {
		return nil, fmt.Errorf("failed to prepare query: %w", err)
	}

	var data []byte
	row := db.QueryRow(q, args...)
	if err := row.Scan(&data); err == sql.ErrNoRows {
		return nil, nil
	} else if err != nil {
		return nil, fmt.Errorf("failed to scan row: %w", err)
	}

	return data, nil
}

// GetPost is an alternative to p.API.GetPost() that fetches from the writer DB node.
// This should only be used internally to get calls posts as it doesn't take care of more
// advanced logic needed by clients like populating reply counts.
func (s *Store) GetPost(postID string) (*model.Post, error) {
	s.metrics.IncStoreOp("GetPost")

	qb := getQueryBuilder(s.driverName).
		Select("*").
		From("Posts").
		Where(sq.Eq{"Id": postID})
	q, args, err := qb.ToSql()
	if err != nil {
		return nil, fmt.Errorf("failed to prepare query: %w", err)
	}

	var post model.Post
	if err := s.wDBx.Get(&post, q, args...); err == sql.ErrNoRows {
		return nil, fmt.Errorf("post not found (id=%s)", postID)
	} else if err != nil {
		return nil, fmt.Errorf("failed to get post (id=%s): %w", postID, err)
	}

	return &post, nil
}

func (s *Store) UpdateFileInfoPostID(fileID, channelID, postID string) error {
	qb := getQueryBuilder(s.driverName).Update("FileInfo").
		Set("ChannelId", channelID).
		Set("PostId", postID).
		Where(sq.Eq{"Id": fileID})
	q, args, err := qb.ToSql()
	if err != nil {
		return err
	}
	if _, err := s.wDB.Exec(q, args...); err != nil {
		return err
	}

	return nil
}
