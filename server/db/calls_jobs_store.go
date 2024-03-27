// Copyright (c) 2022-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package db

import (
	"database/sql"
	"fmt"

	"github.com/mattermost/mattermost-plugin-calls/server/public"

	sq "github.com/mattermost/squirrel"
)

func (s *Store) CreateCallJob(job *public.CallJob) error {
	s.metrics.IncStoreOp("CreateCallJob")

	if err := job.IsValid(); err != nil {
		return fmt.Errorf("invalid call job: %w", err)
	}

	qb := getQueryBuilder(s.driverName).
		Insert("calls_jobs").
		Columns("ID", "CallID", "Type", "CreatorID", "InitAt", "StartAt", "EndAt", "Props").
		Values(job.ID, job.CallID, job.Type, job.CreatorID, job.InitAt, job.StartAt, job.EndAt, s.newJSONValueWrapper(job.Props))

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

func (s *Store) UpdateCallJob(job *public.CallJob) error {
	s.metrics.IncStoreOp("UpdateCallJob")

	if err := job.IsValid(); err != nil {
		return fmt.Errorf("invalid call job: %w", err)
	}

	qb := getQueryBuilder(s.driverName).
		Update("calls_jobs").
		Set("StartAt", job.StartAt).
		Set("EndAt", job.EndAt).
		Set("Props", s.newJSONValueWrapper(job.Props)).
		Where(sq.Eq{"ID": job.ID})

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
		return fmt.Errorf("failed to update call job")
	}

	return nil
}

func (s *Store) GetCallJob(id string, opts GetCallJobOpts) (*public.CallJob, error) {
	s.metrics.IncStoreOp("GetCallJob")

	qb := getQueryBuilder(s.driverName).Select("*").
		From("calls_jobs").
		Where(sq.Eq{"ID": id})

	if !opts.IncludeEnded {
		qb = qb.Where(sq.Eq{"EndAt": 0})
	}

	q, args, err := qb.ToSql()
	if err != nil {
		return nil, fmt.Errorf("failed to prepare query: %w", err)
	}

	var job public.CallJob
	if err := s.dbXFromGetOpts(opts).Get(&job, q, args...); err == sql.ErrNoRows {
		return nil, fmt.Errorf("call job not found")
	} else if err != nil {
		return nil, fmt.Errorf("failed to get call job: %w", err)
	}

	return &job, nil
}

func (s *Store) GetCallJobs(callID string, opts GetCallJobOpts) ([]*public.CallJob, error) {
	s.metrics.IncStoreOp("GetCallJobs")

	qb := getQueryBuilder(s.driverName).Select("*").
		From("calls_jobs").
		Where(sq.Eq{"CallID": callID}).
		OrderBy("StartAt DESC, ID")

	if !opts.IncludeEnded {
		qb = qb.Where(sq.Eq{"EndAt": 0})
	}

	q, args, err := qb.ToSql()
	if err != nil {
		return nil, fmt.Errorf("failed to prepare query: %w", err)
	}

	jobs := []*public.CallJob{}
	if err := s.dbXFromGetOpts(opts).Select(&jobs, q, args...); err != nil {
		return nil, fmt.Errorf("failed to get call jobs: %w", err)
	}

	return jobs, nil
}
