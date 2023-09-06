// Copyright (c) 2022-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"database/sql"
	"fmt"
	"github.com/mattermost/mattermost/server/public/shared/driver"

	"github.com/mattermost/mattermost/server/public/model"

	sq "github.com/mattermost/squirrel"
)

func (p *Plugin) initDB() error {
	serverCfg := p.API.GetConfig()
	if serverCfg == nil {
		return fmt.Errorf("server config should not be nil")
	}

	if serverCfg.SqlSettings.DriverName == nil {
		return fmt.Errorf("SqlSettings.DriverName should not be nil")
	}

	p.driverName = *serverCfg.SqlSettings.DriverName

	p.wDB = sql.OpenDB(driver.NewConnector(p.Driver, true))
	if err := p.wDB.Ping(); err != nil {
		return fmt.Errorf("failed to ping writer DB: %w", err)
	}

	p.LogInfo("handle to writer DB initialized successfully", "driver", p.driverName)

	return nil
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

// KVGet is an alternative to p.API.KVGet() that can also fetch from the writer DB node.
func (p *Plugin) KVGet(key string, fromWriter bool) ([]byte, error) {
	p.metrics.IncStoreOp("KVGet")

	if !fromWriter {
		data, appErr := p.API.KVGet(key)
		if appErr != nil {
			return nil, fmt.Errorf("failed to kvget for key: %s error: %w", key, appErr)
		}
		return data, nil
	}

	qb := getQueryBuilder(p.driverName).Select("PValue").
		From("PluginKeyValueStore").
		Where(sq.Eq{"PluginId": manifest.Id}).
		Where(sq.Eq{"PKey": key}).
		Where(sq.Or{sq.Eq{"ExpireAt": 0}, sq.Gt{"ExpireAt": model.GetMillis()}})
	q, args, err := qb.ToSql()
	if err != nil {
		return nil, fmt.Errorf("failed to prepare query: %w", err)
	}

	var data []byte
	row := p.wDB.QueryRow(q, args...)
	if err := row.Scan(&data); err == sql.ErrNoRows {
		return nil, nil
	} else if err != nil {
		return nil, fmt.Errorf("failed to scan row: %w", err)
	}

	return data, nil
}
