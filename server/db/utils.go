// Copyright (c) 2022-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package db

import (
	"database/sql"
	"fmt"
	"net/url"
	"time"

	"github.com/mattermost/mattermost/server/public/model"

	"github.com/go-sql-driver/mysql"
	sq "github.com/mattermost/squirrel"
)

func (s *Store) setupConnForMigrations(dsn string) (*sql.DB, error) {
	db, err := sql.Open(s.driverName, dsn)
	if err != nil {
		return nil, fmt.Errorf("failed to open sql connection: %w", err)
	}

	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("failed to ping DB: %w", err)
	}

	db.SetMaxIdleConns(*s.settings.MaxIdleConns)
	db.SetMaxOpenConns(*s.settings.MaxOpenConns)
	db.SetConnMaxLifetime(time.Duration(*s.settings.ConnMaxLifetimeMilliseconds) * time.Millisecond)
	db.SetConnMaxIdleTime(time.Duration(*s.settings.ConnMaxIdleTimeMilliseconds) * time.Millisecond)

	return db, nil
}

// appendMultipleStatementsFlag attached dsn parameters to MySQL dsn in order to make migrations work.
func appendMultipleStatementsFlag(dsn string) (string, error) {
	config, err := mysql.ParseDSN(dsn)
	if err != nil {
		return "", err
	}

	if config.Params == nil {
		config.Params = map[string]string{}
	}

	config.Params["multiStatements"] = "true"
	return config.FormatDSN(), nil
}

// resetReadTimeout removes the timeout constraint from the MySQL dsn.
func resetReadTimeout(dsn string) (string, error) {
	config, err := mysql.ParseDSN(dsn)
	if err != nil {
		return "", err
	}
	config.ReadTimeout = 0
	return config.FormatDSN(), nil
}

func hasBinaryParams(dsn string) (bool, error) {
	url, err := url.Parse(dsn)
	if err != nil {
		return false, err
	}
	return url.Query().Get("binary_parameters") == "yes", nil
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
