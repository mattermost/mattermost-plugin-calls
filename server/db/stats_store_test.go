// Copyright (c) 2022-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package db

import (
	"testing"
	"time"

	"github.com/mattermost/mattermost-plugin-calls/server/public"

	"github.com/mattermost/mattermost/server/public/model"

	"github.com/stretchr/testify/require"
)

func TestStatsStore(t *testing.T) {
	testStore(t, map[string]func(t *testing.T, store *Store){
		"TestGetStats": testGetStats,
	})
}

func testGetStats(t *testing.T, store *Store) {
	t.Run("empty tables", func(t *testing.T) {
		stats, err := store.GetCallsStats()
		require.NoError(t, err)

		require.Zero(t, stats.TotalCalls)
		require.Zero(t, stats.TotalActiveCalls)
		require.Zero(t, stats.TotalActiveSessions)
		require.Zero(t, stats.AvgDuration)
		require.Zero(t, stats.AvgParticipants)
		require.Len(t, stats.CallsByDay, 30)
		require.Len(t, stats.CallsByMonth, 12)
		require.Empty(t, stats.CallsByChannelType)
	})

	createCall := func(startAt time.Time, sessions int, channelID string) {
		if channelID == "" {
			channelID = model.NewId()
		}

		call := &public.Call{
			ID:           model.NewId(),
			CreateAt:     startAt.UnixMilli(),
			ChannelID:    channelID,
			StartAt:      startAt.UnixMilli(),
			EndAt:        startAt.Add(time.Hour).UnixMilli(),
			PostID:       model.NewId(),
			ThreadID:     model.NewId(),
			OwnerID:      model.NewId(),
			Participants: []string{model.NewId(), model.NewId()},
			Stats: public.CallStats{
				ScreenDuration: 4,
			},
			Props: public.CallProps{
				Hosts: []string{"userA", "userB"},
			},
		}
		if sessions > 0 {
			call.EndAt = 0
			for i := 0; i < sessions; i++ {
				err := store.CreateCallSession(&public.CallSession{
					ID:     model.NewId(),
					CallID: call.ID,
					UserID: call.Participants[i],
					JoinAt: startAt.UnixMilli(),
				})
				require.NoError(t, err)
			}
		}

		err := store.CreateCall(call)
		require.NoError(t, err)
	}

	createJob := func(startAt time.Time, jt public.JobType) {
		job := &public.CallJob{
			Type:      jt,
			ID:        model.NewId(),
			CreatorID: model.NewId(),
			CallID:    model.NewId(),
			InitAt:    startAt.UnixMilli(),
			StartAt:   startAt.UnixMilli(),
			EndAt:     startAt.Add(time.Hour).UnixMilli(),
		}

		err := store.CreateCallJob(job)
		require.NoError(t, err)
	}

	t.Run("calls", func(t *testing.T) {
		defer resetStore(t, store)

		now := time.Now()

		for i := 0; i < 100; i++ {
			createCall(now.AddDate(0, 0, -i), 0, "")
		}

		stats, err := store.GetCallsStats()
		require.NoError(t, err)

		require.Equal(t, int64(100), stats.TotalCalls)
		require.Zero(t, stats.TotalActiveCalls)
		require.Zero(t, stats.TotalActiveSessions)
		require.Equal(t, int64(3600), stats.AvgDuration)
		require.Equal(t, int64(2), stats.AvgParticipants)
		require.Len(t, stats.CallsByDay, 30)
		require.Len(t, stats.CallsByMonth, 12)
		require.Empty(t, stats.CallsByChannelType)

		for day := range stats.CallsByDay {
			require.Equal(t, int64(1), stats.CallsByDay[day])
		}

		nCalls := 0
		for i := 0; i < 12; i++ {
			d := time.Date(now.Year(), now.Month()-time.Month(i), 1, 0, 0, 0, 0, time.UTC)
			daysInMonth := time.Date(d.Year(), d.Month()+1, 0, 0, 0, 0, 0, time.UTC).Day()
			callsInMonth := 0

			if i == 0 {
				// In the current month we'll have N calls where N is the current day in the month.
				callsInMonth = now.Day()
			} else if nCalls < 100 {
				// Previous months will have 1 call per day until we reach our target (100).
				callsInMonth = min(daysInMonth, 100-nCalls)
			}

			nCalls += callsInMonth

			require.Equal(t, int64(callsInMonth), stats.CallsByMonth[d.Format("2006-01")])
		}
	})

	t.Run("active calls", func(t *testing.T) {
		defer resetStore(t, store)

		for i := 0; i < 100; i++ {
			createCall(time.Now().AddDate(0, 0, -i), 2, "")
		}

		stats, err := store.GetCallsStats()
		require.NoError(t, err)

		require.Zero(t, stats.TotalCalls)
		require.Equal(t, int64(100), stats.TotalActiveCalls)
		require.Equal(t, int64(200), stats.TotalActiveSessions)
		require.Zero(t, stats.AvgDuration)
		require.Zero(t, stats.AvgParticipants)
		require.Len(t, stats.CallsByDay, 30)
		require.Len(t, stats.CallsByMonth, 12)
		require.Empty(t, stats.CallsByChannelType)
	})

	t.Run("calls by channel type", func(t *testing.T) {
		defer resetStore(t, store)

		_, err := store.wDB.Exec(`INSERT INTO Channels (Id, Type) VALUES 
				('public', 'O'),
				('private', 'P'),
				('group', 'G'),
				('direct', 'D')
				`)
		require.NoError(t, err)

		for i := 0; i < 45; i++ {
			createCall(time.Now().AddDate(0, 0, -i), 0, "public")
		}

		for i := 0; i < 46; i++ {
			createCall(time.Now().AddDate(0, 0, -i), 0, "private")
		}

		for i := 0; i < 47; i++ {
			createCall(time.Now().AddDate(0, 0, -i), 0, "group")
		}

		for i := 0; i < 48; i++ {
			createCall(time.Now().AddDate(0, 0, -i), 0, "direct")
		}

		for i := 0; i < 10; i++ {
			createCall(time.Now().AddDate(0, 0, -i), 2, "direct")
		}

		stats, err := store.GetCallsStats()
		require.NoError(t, err)

		require.Equal(t, int64(45+46+47+48), stats.TotalCalls)
		require.Equal(t, int64(10), stats.TotalActiveCalls)
		require.Equal(t, int64(20), stats.TotalActiveSessions)
		require.Equal(t, int64(3600), stats.AvgDuration)
		require.Equal(t, int64(2), stats.AvgParticipants)
		require.Len(t, stats.CallsByDay, 30)
		require.Len(t, stats.CallsByMonth, 12)
		require.Equal(t, map[string]int64{
			"O": 45,
			"P": 46,
			"G": 47,
			"D": 48,
		}, stats.CallsByChannelType)
	})

	t.Run("recording jobs", func(t *testing.T) {
		defer resetStore(t, store)

		now := time.Now()

		for i := 0; i < 100; i++ {
			createJob(now.AddDate(0, 0, -i), public.JobTypeRecording)
		}

		stats, err := store.GetCallsStats()
		require.NoError(t, err)

		require.Len(t, stats.RecordingJobsByDay, 30)
		require.Len(t, stats.RecordingJobsByMonth, 12)

		for day := range stats.RecordingJobsByDay {
			require.Equal(t, int64(1), stats.RecordingJobsByDay[day])
		}

		nJobs := 0
		for i := 0; i < 12; i++ {
			d := time.Date(now.Year(), now.Month()-time.Month(i), 1, 0, 0, 0, 0, time.UTC)
			daysInMonth := time.Date(d.Year(), d.Month()+1, 0, 0, 0, 0, 0, time.UTC).Day()
			jobsInMonth := 0

			if i == 0 {
				// In the current month we'll have N jobs where N is the current day in the month.
				jobsInMonth = now.Day()
			} else if nJobs < 100 {
				// Previous months will have 1 job per day until we reach our target (100).
				jobsInMonth = min(daysInMonth, 100-nJobs)
			}

			nJobs += jobsInMonth

			require.Equal(t, int64(jobsInMonth), stats.RecordingJobsByMonth[d.Format("2006-01")])
		}
	})
}
