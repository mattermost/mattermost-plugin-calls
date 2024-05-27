package db

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/mattermost/mattermost/server/public/model"

	sq "github.com/mattermost/squirrel"
)

func (s *Store) KVGet(pluginID, key string, fromWriter bool) ([]byte, error) {
	s.metrics.IncStoreOp("KVGet")
	defer func(start time.Time) {
		s.metrics.ObserveStoreMethodsTime("KVGet", time.Since(start).Seconds())
	}(time.Now())

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
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(*s.settings.QueryTimeout)*time.Second)
	defer cancel()
	row := db.QueryRowContext(ctx, q, args...)
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
	defer func(start time.Time) {
		s.metrics.ObserveStoreMethodsTime("GetPost", time.Since(start).Seconds())
	}(time.Now())

	qb := getQueryBuilder(s.driverName).
		Select("*").
		From("Posts").
		Where(sq.Eq{"Id": postID})
	q, args, err := qb.ToSql()
	if err != nil {
		return nil, fmt.Errorf("failed to prepare query: %w", err)
	}

	var post model.Post
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(*s.settings.QueryTimeout)*time.Second)
	defer cancel()
	if err := s.wDBx.GetContext(ctx, &post, q, args...); err == sql.ErrNoRows {
		return nil, fmt.Errorf("post not found (id=%s)", postID)
	} else if err != nil {
		return nil, fmt.Errorf("failed to get post (id=%s): %w", postID, err)
	}

	return &post, nil
}

func (s *Store) UpdateFileInfoPostID(fileID, channelID, postID string) error {
	s.metrics.IncStoreOp("UpdateFileInfoPostID")
	defer func(start time.Time) {
		s.metrics.ObserveStoreMethodsTime("UpdateFileInfoPostID", time.Since(start).Seconds())
	}(time.Now())

	qb := getQueryBuilder(s.driverName).Update("FileInfo").
		Set("ChannelId", channelID).
		Set("PostId", postID).
		Where(sq.Eq{"Id": fileID})
	q, args, err := qb.ToSql()
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(*s.settings.QueryTimeout)*time.Second)
	defer cancel()
	if _, err := s.wDB.ExecContext(ctx, q, args...); err != nil {
		return err
	}

	return nil
}
