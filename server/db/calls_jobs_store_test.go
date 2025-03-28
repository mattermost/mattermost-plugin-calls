// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package db

import (
	"testing"
	"time"

	"github.com/mattermost/mattermost-plugin-calls/server/public"

	"github.com/mattermost/mattermost/server/public/model"

	"github.com/stretchr/testify/require"
)

func TestCallsJobsStore(t *testing.T) {
	testStore(t, map[string]func(t *testing.T, store *Store){
		"TestCreateCallJob":                testCreateCallJob,
		"TestUpdateCallJob":                testUpdateCallJob,
		"TestGetCallJob":                   testGetCallJob,
		"TestGetActiveCallJobs":            testGetActiveCallJobs,
		"TestCallsJobsTableColumnAddition": testCallsJobsTableColumnAddition,
	})
}

func testCreateCallJob(t *testing.T, store *Store) {
	t.Run("invalid", func(t *testing.T) {
		err := store.CreateCallJob(nil)
		require.EqualError(t, err, "invalid call job: should not be nil")

		err = store.CreateCallJob(&public.CallJob{})
		require.EqualError(t, err, "invalid call job: invalid ID: should not be empty")

		err = store.CreateCallJob(&public.CallJob{
			ID: model.NewId(),
		})
		require.EqualError(t, err, "invalid call job: invalid CallID: should not be empty")

		err = store.CreateCallJob(&public.CallJob{
			ID:     model.NewId(),
			CallID: model.NewId(),
		})
		require.EqualError(t, err, "invalid call job: invalid Type: should not be empty")

		err = store.CreateCallJob(&public.CallJob{
			ID:     model.NewId(),
			CallID: model.NewId(),
			Type:   public.JobType("invalid"),
		})
		require.EqualError(t, err, "invalid call job: invalid Type: invalid job type \"invalid\"")

		err = store.CreateCallJob(&public.CallJob{
			ID:     model.NewId(),
			CallID: model.NewId(),
			Type:   public.JobTypeRecording,
		})
		require.EqualError(t, err, "invalid call job: invalid CreatorID: should not be empty")

		err = store.CreateCallJob(&public.CallJob{
			ID:        model.NewId(),
			CallID:    model.NewId(),
			Type:      public.JobTypeRecording,
			CreatorID: model.NewId(),
		})
		require.EqualError(t, err, "invalid call job: invalid InitAt: should be > 0")
	})

	t.Run("valid", func(t *testing.T) {
		job := &public.CallJob{
			ID:        model.NewId(),
			CallID:    model.NewId(),
			Type:      public.JobTypeRecording,
			CreatorID: model.NewId(),
			InitAt:    time.Now().UnixMilli(),
		}
		err := store.CreateCallJob(job)
		require.NoError(t, err)

		gotJob, err := store.GetCallJob(job.ID, GetCallJobOpts{})
		require.NoError(t, err)
		require.Equal(t, job, gotJob)
	})
}

func testUpdateCallJob(t *testing.T, store *Store) {
	t.Run("nil", func(t *testing.T) {
		var job *public.CallJob
		err := store.UpdateCallJob(job)
		require.EqualError(t, err, "invalid call job: should not be nil")
	})

	t.Run("existing", func(t *testing.T) {
		job := &public.CallJob{
			ID:        model.NewId(),
			CallID:    model.NewId(),
			Type:      public.JobTypeRecording,
			CreatorID: model.NewId(),
			InitAt:    time.Now().UnixMilli(),
		}

		err := store.CreateCallJob(job)
		require.NoError(t, err)

		job.StartAt = time.Now().UnixMilli()

		err = store.UpdateCallJob(job)
		require.NoError(t, err)

		gotJob, err := store.GetCallJob(job.ID, GetCallJobOpts{})
		require.NoError(t, err)
		require.Equal(t, job, gotJob)
	})
}

func testGetCallJob(t *testing.T, store *Store) {
	t.Run("missing", func(t *testing.T) {
		job, err := store.GetCallJob(model.NewId(), GetCallJobOpts{})
		require.EqualError(t, err, "call job not found")
		require.Nil(t, job)
	})

	t.Run("existing", func(t *testing.T) {
		job := &public.CallJob{
			ID:        model.NewId(),
			CallID:    model.NewId(),
			Type:      public.JobTypeRecording,
			CreatorID: model.NewId(),
			InitAt:    time.Now().UnixMilli(),
		}

		err := store.CreateCallJob(job)
		require.NoError(t, err)

		gotJob, err := store.GetCallJob(job.ID, GetCallJobOpts{})
		require.NoError(t, err)
		require.Equal(t, job, gotJob)
	})

	t.Run("include ended", func(t *testing.T) {
		job := &public.CallJob{
			ID:        model.NewId(),
			CallID:    model.NewId(),
			Type:      public.JobTypeRecording,
			CreatorID: model.NewId(),
			InitAt:    time.Now().UnixMilli(),
		}

		err := store.CreateCallJob(job)
		require.NoError(t, err)

		job.StartAt = time.Now().UnixMilli()
		job.EndAt = job.StartAt + 1000

		err = store.UpdateCallJob(job)
		require.NoError(t, err)

		gotJob, err := store.GetCallJob(job.ID, GetCallJobOpts{})
		require.EqualError(t, err, "call job not found")
		require.Nil(t, gotJob)

		gotJob, err = store.GetCallJob(job.ID, GetCallJobOpts{
			IncludeEnded: true,
		})
		require.NoError(t, err)
		require.Equal(t, job, gotJob)
	})
}

func testGetActiveCallJobs(t *testing.T, store *Store) {
	t.Run("no jobs", func(t *testing.T) {
		jobs, err := store.GetActiveCallJobs(model.NewId(), GetCallJobOpts{})
		require.NoError(t, err)
		require.Empty(t, jobs)
	})

	t.Run("multiple jobs", func(t *testing.T) {
		callID := model.NewId()
		recJob := &public.CallJob{
			ID:        model.NewId(),
			CallID:    callID,
			Type:      public.JobTypeRecording,
			CreatorID: model.NewId(),
			InitAt:    time.Now().UnixMilli(),
		}

		err := store.CreateCallJob(recJob)
		require.NoError(t, err)

		trJob := *recJob
		trJob.ID = model.NewId()
		trJob.Type = public.JobTypeTranscribing
		err = store.CreateCallJob(&trJob)
		require.NoError(t, err)

		jobs, err := store.GetActiveCallJobs(callID, GetCallJobOpts{})
		require.NoError(t, err)
		require.Equal(t, map[public.JobType]*public.CallJob{
			public.JobTypeRecording:    recJob,
			public.JobTypeTranscribing: &trJob,
		}, jobs)
	})

	t.Run("ordered jobs", func(t *testing.T) {
		var jobs []*public.CallJob
		callID := model.NewId()
		startTimeBase := time.Now().UnixMilli()
		for i := 0; i < 10; i++ {
			recJob := &public.CallJob{
				ID:        model.NewId(),
				CallID:    callID,
				Type:      public.JobTypeRecording,
				CreatorID: model.NewId(),
				InitAt:    time.Now().UnixMilli(),
			}
			err := store.CreateCallJob(recJob)
			require.NoError(t, err)

			jobs = append(jobs, recJob)

			recJob.StartAt = startTimeBase + int64(i*1000)
			err = store.UpdateCallJob(recJob)
			require.NoError(t, err)
		}

		gotJobs, err := store.GetActiveCallJobs(callID, GetCallJobOpts{})
		require.NoError(t, err)
		require.Equal(t, jobs[len(jobs)-1], gotJobs[public.JobTypeRecording])
	})

	t.Run("should never include ended", func(t *testing.T) {
		callID := model.NewId()
		job := &public.CallJob{
			ID:        model.NewId(),
			CallID:    callID,
			Type:      public.JobTypeRecording,
			CreatorID: model.NewId(),
			InitAt:    time.Now().UnixMilli(),
		}

		err := store.CreateCallJob(job)
		require.NoError(t, err)

		jobs, err := store.GetActiveCallJobs(callID, GetCallJobOpts{
			IncludeEnded: true,
		})
		require.NoError(t, err)
		require.Equal(t, job, jobs[public.JobTypeRecording])

		job.StartAt = time.Now().UnixMilli()
		job.EndAt = job.StartAt + 1000
		err = store.UpdateCallJob(job)
		require.NoError(t, err)

		jobs, err = store.GetActiveCallJobs(callID, GetCallJobOpts{
			IncludeEnded: true,
		})
		require.NoError(t, err)
		require.Nil(t, jobs[public.JobTypeRecording])
		require.Empty(t, jobs)
	})
}

func testCallsJobsTableColumnAddition(t *testing.T, store *Store) {
	// This test simulates adding a new column to the calls_jobs table
	// and verifies that existing code can still fetch data correctly

	// Create a job with the current schema
	job := &public.CallJob{
		ID:        model.NewId(),
		CallID:    model.NewId(),
		Type:      public.JobTypeRecording,
		CreatorID: model.NewId(),
		InitAt:    time.Now().UnixMilli(),
		StartAt:   time.Now().UnixMilli(),
		Props: public.CallJobProps{
			JobID: "test-job-id",
		},
	}

	err := store.CreateCallJob(job)
	require.NoError(t, err)

	// Simulate adding a new column to the calls_jobs table
	var alterTableSQL string
	if store.driverName == model.DatabaseDriverPostgres {
		alterTableSQL = "ALTER TABLE calls_jobs ADD COLUMN test_column VARCHAR(26) DEFAULT NULL"
	} else {
		alterTableSQL = "ALTER TABLE calls_jobs ADD COLUMN test_column VARCHAR(26) DEFAULT NULL"
	}

	_, err = store.wDB.Exec(alterTableSQL)
	require.NoError(t, err)

	// Verify we can still fetch the job correctly after schema change
	gotJob, err := store.GetCallJob(job.ID, GetCallJobOpts{IncludeEnded: true})
	require.NoError(t, err)
	require.Equal(t, job, gotJob)

	// Verify we can still update the job
	job.EndAt = time.Now().UnixMilli()
	job.Props.BotConnID = "test-bot-conn-id"
	err = store.UpdateCallJob(job)
	require.NoError(t, err)

	// Verify the update worked correctly
	updatedJob, err := store.GetCallJob(job.ID, GetCallJobOpts{IncludeEnded: true})
	require.NoError(t, err)
	require.Equal(t, job.EndAt, updatedJob.EndAt)
	require.Equal(t, job.Props, updatedJob.Props)

	// Clean up - drop the test column
	var dropColumnSQL string
	if store.driverName == model.DatabaseDriverPostgres {
		dropColumnSQL = "ALTER TABLE calls_jobs DROP COLUMN test_column"
	} else {
		dropColumnSQL = "ALTER TABLE calls_jobs DROP COLUMN test_column"
	}

	_, err = store.wDB.Exec(dropColumnSQL)
	require.NoError(t, err)
}
