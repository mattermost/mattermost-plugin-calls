// Copyright (c) 2022-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package db

import (
	"database/sql"

	"github.com/jmoiron/sqlx"
)

type GetCallOpts struct {
	FromWriter bool
}

func (o GetCallOpts) UseWriter() bool {
	return o.FromWriter
}

type GetCallsChannelOpts struct {
	FromWriter bool
}

func (o GetCallsChannelOpts) UseWriter() bool {
	return o.FromWriter
}

type GetCallSessionOpts struct {
	FromWriter bool
}

func (o GetCallSessionOpts) UseWriter() bool {
	return o.FromWriter
}

type GetCallJobOpts struct {
	FromWriter   bool
	IncludeEnded bool
}

func (o GetCallJobOpts) UseWriter() bool {
	return o.FromWriter
}

type getOpts interface {
	UseWriter() bool
}

func (s *Store) dbXFromGetOpts(opts getOpts) *sqlx.DB {
	if opts.UseWriter() {
		return s.wDBx
	}
	return s.rDBx
}

func (s *Store) dbFromGetOpts(opts getOpts) *sql.DB {
	if opts.UseWriter() {
		return s.wDB
	}
	return s.rDB
}
