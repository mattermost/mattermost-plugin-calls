// Copyright (c) 2022-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package db

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/mattermost/mattermost-plugin-calls/server/public"

	sq "github.com/mattermost/squirrel"
)

func (s *Store) CreateCallJob(job *public.CallJob) error {
	s.metrics.IncStoreOp("CreateCallJob")
	defer func(start time.Time) {
		s.metrics.ObserveStoreMethodsTime("CreateCallJob", time.Since(start).Seconds())
	}(time.Now())

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

	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(*s.settings.QueryTimeout)*time.Second)
	defer cancel()
	_, err = s.wDB.ExecContext(ctx, q, args...)
	if err != nil {
		return fmt.Errorf("failed to run query: %w", err)
	}

	return nil
}

func (s *Store) UpdateCallJob(job *public.CallJob) error {
	s.metrics.IncStoreOp("UpdateCallJob")
	defer func(start time.Time) {
		s.metrics.ObserveStoreMethodsTime("UpdateCallJob", time.Since(start).Seconds())
	}(time.Now())

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

	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(*s.settings.QueryTimeout)*time.Second)
	defer cancel()
	_, err = s.wDB.ExecContext(ctx, q, args...)
	if err != nil {
		return fmt.Errorf("failed to run query: %w", err)
	}

	return nil
}

func (s *Store) GetCallJob(id string, opts GetCallJobOpts) (*public.CallJob, error) {
	s.metrics.IncStoreOp("GetCallJob")
	defer func(start time.Time) {
		s.metrics.ObserveStoreMethodsTime("GetCallJob", time.Since(start).Seconds())
	}(time.Now())

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
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(*s.settings.QueryTimeout)*time.Second)
	defer cancel()
	if err := s.dbXFromGetOpts(opts).GetContext(ctx, &job, q, args...); err == sql.ErrNoRows {
		return nil, fmt.Errorf("call job not found")
	} else if err != nil {
		return nil, fmt.Errorf("failed to get call job: %w", err)
	}

	return &job, nil
}

func (s *Store) GetActiveCallJobs(callID string, opts GetCallJobOpts) (map[public.JobType]*public.CallJob, error) {
	s.metrics.IncStoreOp("GetActiveCallJobs")
	defer func(start time.Time) {
		s.metrics.ObserveStoreMethodsTime("GetActiveCallJobs", time.Since(start).Seconds())
	}(time.Now())

	qb := getQueryBuilder(s.driverName).Select("*").
		From("calls_jobs").
		Where(sq.And{
			sq.Eq{"CallID": callID},
			sq.Eq{"EndAt": 0},
		}).OrderBy("StartAt DESC, ID")

	q, args, err := qb.ToSql()
	if err != nil {
		return nil, fmt.Errorf("failed to prepare query: %w", err)
	}

	jobs := []*public.CallJob{}
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(*s.settings.QueryTimeout)*time.Second)
	defer cancel()
	if err := s.dbXFromGetOpts(opts).SelectContext(ctx, &jobs, q, args...); err != nil {
		return nil, fmt.Errorf("failed to get call jobs: %w", err)
	}

	// We want to return only one job per type. Since we are sorting by
	// StartAt (DESC) we select the first one we find. It should generally be one
	// but we want to avoid consistencies issues (e.g. two running jobs for same
	// type).
	jobsMap := make(map[public.JobType]*public.CallJob, len(jobs))
	for _, job := range jobs {
		_, ok := jobsMap[job.Type]
		if !ok {
			jobsMap[job.Type] = job
		}
	}

	return jobsMap, nil
}
