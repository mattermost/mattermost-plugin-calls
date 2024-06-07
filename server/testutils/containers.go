// Copyright (c) 2022-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package testutils

import (
	"context"
	"fmt"
	"log"
	"time"

	tc "github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/mysql"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
)

const (
	DBName         = "mattermost_test"
	DBUser         = "mmuser"
	DBPass         = "mostest"
	DBNetworkAlias = "db"

	PostgresImage = "postgres:11"
	PostgrePort   = 5432

	MySQLImage = "mysql/mysql-server:8.0.32"
	MySQLPort  = 3306
)

// RunPostgresContainerLocal creates and run a postgres container accessible
// from the local network.
func RunPostgresContainerLocal(ctx context.Context) (string, func(), error) {
	cnt, tearDown, err := RunPostgresContainer(ctx, tc.CustomizeRequest(tc.GenericContainerRequest{
		ContainerRequest: tc.ContainerRequest{
			ExposedPorts: []string{fmt.Sprintf("%d/tcp", PostgrePort)},
		},
		Started: true,
	}))
	if err != nil {
		return "", nil, err
	}

	dsn, err := cnt.ConnectionString(ctx)
	if err != nil {
		tearDown()
		return "", nil, err
	}

	return dsn + "sslmode=disable", tearDown, err
}

// RunPostgresContainer creates and runs a postgres container
func RunPostgresContainer(ctx context.Context, opts ...tc.ContainerCustomizer) (*postgres.PostgresContainer, func(), error) {
	opts = append([]tc.ContainerCustomizer{
		tc.WithImage(PostgresImage),
		postgres.WithDatabase(DBName),
		postgres.WithUsername(DBUser),
		postgres.WithPassword(DBPass),
		tc.WithWaitStrategy(
			wait.ForLog("database system is ready to accept connections").
				WithOccurrence(2).
				WithStartupTimeout(15 * time.Second)),
	}, opts...)

	cnt, err := postgres.RunContainer(ctx, opts...)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to run container: %w", err)
	}

	return cnt, func() {
		if err := cnt.Terminate(ctx); err != nil {
			log.Print(err.Error())
		}
	}, nil
}

// RunMySQLContainer creates and runs a mysql container
func RunMySQLContainer(ctx context.Context, opts ...tc.ContainerCustomizer) (*mysql.MySQLContainer, func(), error) {
	opts = append([]tc.ContainerCustomizer{
		tc.WithImage(MySQLImage),
		mysql.WithDatabase(DBName),
		mysql.WithUsername(DBUser),
		mysql.WithPassword(DBPass),
	}, opts...)

	cnt, err := mysql.RunContainer(ctx, opts...)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to run container: %w", err)
	}

	return cnt, func() {
		if err := cnt.Terminate(ctx); err != nil {
			log.Print(err.Error())
		}
	}, nil
}

// RunMySQLContainerLocal creates and run a mysql container accessible
// from the local network.
func RunMySQLContainerLocal(ctx context.Context) (string, func(), error) {
	cnt, tearDown, err := RunMySQLContainer(ctx, tc.CustomizeRequest(tc.GenericContainerRequest{
		ContainerRequest: tc.ContainerRequest{
			ExposedPorts: []string{fmt.Sprintf("%d/tcp", MySQLPort)},
		},
		Started: true,
	}))
	if err != nil {
		return "", nil, err
	}

	dsn, err := cnt.ConnectionString(ctx)
	if err != nil {
		tearDown()
		return "", nil, err
	}

	return dsn, tearDown, err
}
