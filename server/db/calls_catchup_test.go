// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package db

import (
	"fmt"
	"sync"
	"testing"
	"time"

	"github.com/mattermost/mattermost/server/public/model"

	"github.com/stretchr/testify/require"
)

const v1CallsSchema = `CREATE TABLE calls (
	id VARCHAR(26) PRIMARY KEY, channelid VARCHAR(26), startat bigint, endat bigint,
	createat bigint, deleteat bigint, title VARCHAR(256), postid VARCHAR(26),
	threadid VARCHAR(26), ownerid VARCHAR(26), participants jsonb NOT NULL,
	stats jsonb NOT NULL, props jsonb NOT NULL)`

func TestCatchUpV1Calls(t *testing.T) {
	testStore(t, map[string]func(t *testing.T, store *Store){
		"NoV1Table":        testCatchUpNoV1Table,
		"RoundTrip":        testCatchUpRoundTrip,
		"Overlap":          testCatchUpOverlap,
		"EmptyV2":          testCatchUpEmptyV2,
		"Fidelity":         testCatchUpFidelity,
		"Parallel":         testCatchUpParallel,
		"MissingColumn":    testCatchUpMissingColumn,
		"MetricsIncludeV1": testCatchUpMetrics,
	})
}

func setupV1Calls(t *testing.T, store *Store, schema string) {
	t.Helper()
	_, err := store.wDB.Exec(schema)
	require.NoError(t, err)
	t.Cleanup(func() {
		_, err := store.wDB.Exec(`DROP TABLE IF EXISTS calls`)
		require.NoError(t, err)
	})
}

// insertCall inserts an ended (endAt > 0) or live call into the given table.
func insertCall(t *testing.T, store *Store, table, id string, startAt, endAt int64, stats string) {
	t.Helper()
	_, err := store.wDB.Exec(`INSERT INTO `+table+` (id, channelid, startat, endat, createat, deleteat, title, postid, threadid, ownerid, participants, stats, props)
		VALUES ($1, $2, $3, $4, $3, 0, 't', 'p', 'th', 'o', '["u1","u2"]', $5, '{}')`,
		id, model.NewId(), startAt, endAt, stats)
	require.NoError(t, err)
}

func v2CallIDs(t *testing.T, store *Store) []string {
	t.Helper()
	var ids []string
	require.NoError(t, store.wDBx.Select(&ids, `SELECT id FROM calls_v2_calls`))
	return ids
}

func testCatchUpNoV1Table(t *testing.T, store *Store) {
	n, err := store.CatchUpV1Calls()
	require.NoError(t, err)
	require.Zero(t, n)
}

func testCatchUpRoundTrip(t *testing.T, store *Store) {
	setupV1Calls(t, store, v1CallsSchema)
	now := time.Now().UnixMilli()
	hour := int64(time.Hour / time.Millisecond)

	a, b, c, d, e := model.NewId(), model.NewId(), model.NewId(), model.NewId(), model.NewId()
	// v1 era, copied by the one-time migration (simulated by the first catch-up).
	insertCall(t, store, "calls", a, now-100*hour, now-99*hour, "{}")
	insertCall(t, store, "calls", b, now-98*hour, now-97*hour, "{}")
	n, err := store.CatchUpV1Calls()
	require.NoError(t, err)
	require.EqualValues(t, 2, n)

	// Native v2 call, then calls made under v1 after a rollback.
	insertCall(t, store, "calls_v2_calls", c, now-50*hour, now-49*hour, "{}")
	insertCall(t, store, "calls", d, now-40*hour, now-39*hour, "{}")
	insertCall(t, store, "calls", e, now-10*hour, 0, "{}") // still live, not copied

	n, err = store.CatchUpV1Calls()
	require.NoError(t, err)
	require.EqualValues(t, 1, n)
	require.ElementsMatch(t, []string{a, b, c, d}, v2CallIDs(t, store))

	// Idempotent.
	n, err = store.CatchUpV1Calls()
	require.NoError(t, err)
	require.Zero(t, n)
	require.Len(t, v2CallIDs(t, store), 4)
}

func testCatchUpOverlap(t *testing.T, store *Store) {
	setupV1Calls(t, store, v1CallsSchema)
	now := time.Now().UnixMilli()
	hour := int64(time.Hour / time.Millisecond)

	watermark := now - 100*hour
	insertCall(t, store, "calls_v2_calls", model.NewId(), watermark-hour, watermark, "{}")

	inside, outside := model.NewId(), model.NewId()
	insertCall(t, store, "calls", inside, watermark-5*hour, watermark-2*hour, "{}")    // within 24h of watermark
	insertCall(t, store, "calls", outside, watermark-50*hour, watermark-48*hour, "{}") // older than the window

	n, err := store.CatchUpV1Calls()
	require.NoError(t, err)
	require.EqualValues(t, 1, n)
	require.Contains(t, v2CallIDs(t, store), inside)
	require.NotContains(t, v2CallIDs(t, store), outside)
}

func testCatchUpEmptyV2(t *testing.T, store *Store) {
	setupV1Calls(t, store, v1CallsSchema)
	now := time.Now().UnixMilli()
	for i := 0; i < 5; i++ {
		insertCall(t, store, "calls", model.NewId(), now-int64(1000+i), now-int64(500+i), "{}")
	}
	n, err := store.CatchUpV1Calls()
	require.NoError(t, err)
	require.EqualValues(t, 5, n)
}

func testCatchUpFidelity(t *testing.T, store *Store) {
	setupV1Calls(t, store, v1CallsSchema)
	now := time.Now().UnixMilli()
	id := model.NewId()
	insertCall(t, store, "calls", id, now-2000, now-1000, `{"video_duration": 42, "has_used_video": true, "has_used_screen_share": true}`)

	_, err := store.CatchUpV1Calls()
	require.NoError(t, err)

	cols := "id, channelid, startat, endat, createat, deleteat, title, postid, threadid, ownerid, participants::text, stats::text, props::text"
	row := func(table string) []string {
		out := make([]string, 13)
		dest := make([]any, 13)
		for i := range dest {
			dest[i] = new(any)
		}
		r := store.wDB.QueryRow(`SELECT `+cols+` FROM `+table+` WHERE id = $1`, id)
		require.NoError(t, r.Scan(dest...))
		for i := range dest {
			out[i] = anyToString(*(dest[i].(*any)))
		}
		return out
	}
	require.Equal(t, row("calls"), row("calls_v2_calls"))
}

func anyToString(v any) string {
	switch x := v.(type) {
	case []byte:
		return string(x)
	case string:
		return x
	default:
		return fmt.Sprint(x)
	}
}

func testCatchUpParallel(t *testing.T, store *Store) {
	setupV1Calls(t, store, v1CallsSchema)
	now := time.Now().UnixMilli()
	for i := 0; i < 200; i++ {
		insertCall(t, store, "calls", model.NewId(), now-int64(10000+i), now-int64(5000+i), "{}")
	}

	var wg sync.WaitGroup
	errs := make(chan error, 8)
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, err := store.CatchUpV1Calls()
			errs <- err
		}()
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		require.NoError(t, err)
	}

	var total, distinct int
	require.NoError(t, store.wDBx.Get(&total, `SELECT COUNT(*) FROM calls_v2_calls`))
	require.NoError(t, store.wDBx.Get(&distinct, `SELECT COUNT(DISTINCT id) FROM calls_v2_calls`))
	require.Equal(t, 200, total)
	require.Equal(t, total, distinct)
}

func testCatchUpMissingColumn(t *testing.T, store *Store) {
	// A v1 table lacking a listed column must produce an error, not a panic or
	// a partial copy.
	setupV1Calls(t, store, `CREATE TABLE calls (id VARCHAR(26) PRIMARY KEY, endat bigint)`)
	_, err := store.wDB.Exec(`INSERT INTO calls (id, endat) VALUES ($1, 10)`, model.NewId())
	require.NoError(t, err)

	n, err := store.CatchUpV1Calls()
	require.Error(t, err)
	require.Zero(t, n)
	require.Empty(t, v2CallIDs(t, store))
}

func testCatchUpMetrics(t *testing.T, store *Store) {
	setupV1Calls(t, store, v1CallsSchema)
	now := time.Now().UnixMilli()
	insertCall(t, store, "calls", model.NewId(), now-2000, now-1000, "{}")
	insertCall(t, store, "calls", model.NewId(), now-4000, now-3000, "{}")

	_, err := store.CatchUpV1Calls()
	require.NoError(t, err)

	total, err := store.GetTotalCalls(false)
	require.NoError(t, err)
	require.EqualValues(t, 2, total)

	byMonth, err := store.GetCallsByMonth()
	require.NoError(t, err)
	var sum int64
	for _, c := range byMonth {
		sum += c
	}
	require.EqualValues(t, 2, sum)
}
