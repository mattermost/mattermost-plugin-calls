// Copyright (c) 2022-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package batching

import (
	"fmt"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestBatcher(t *testing.T) {
	t.Run("NewBatcher", func(t *testing.T) {
		t.Run("invalid interval", func(t *testing.T) {
			b, err := NewBatcher(Config{
				Size: 10,
			})
			require.EqualError(t, err, "interval should be > 0")
			require.Nil(t, b)
		})

		t.Run("invalid size", func(t *testing.T) {
			b, err := NewBatcher(Config{
				Interval: time.Second,
			})
			require.EqualError(t, err, "size should be > 0")
			require.Nil(t, b)
		})

		t.Run("valid", func(t *testing.T) {
			b, err := NewBatcher(Config{
				Interval: time.Second,
				Size:     10,
			})
			require.NoError(t, err)
			require.NotNil(t, b)
		})
	})

	t.Run("basic batching", func(t *testing.T) {
		b, err := NewBatcher(Config{
			Interval: 10 * time.Millisecond,
			Size:     10,
		})
		require.NoError(t, err)
		require.NotNil(t, b)

		b.Start()

		var counter int

		// Simulating some bursts of requests that need batching.
		for i := 0; i < 10; i++ {
			for j := 0; j < 10; j++ {
				fmt.Printf("pushing %d\n", i*10+j)
				err := b.Push(func(_ Context) {
					fmt.Printf("executing %d\n", counter)
					counter++
				})
				require.NoError(t, err)
			}
			time.Sleep(50 * time.Millisecond)
		}

		b.Stop()

		require.Equal(t, 100, counter)
		require.GreaterOrEqual(t, b.batches, 10)
	})

	t.Run("context aware batching", func(t *testing.T) {
		preRunCb := func(ctx Context) error {
			ctx["shared_state"] = 0
			return nil
		}

		postRunCb := func(ctx Context) error {
			require.Equal(t, ctx[ContextBatchSizeKey].(int), ctx["shared_state"])
			return nil
		}

		b, err := NewBatcher(Config{
			Interval:  10 * time.Millisecond,
			Size:      10,
			PreRunCb:  preRunCb,
			PostRunCb: postRunCb,
		})
		require.NoError(t, err)
		require.NotNil(t, b)

		b.Start()

		// Simulating some bursts of requests that need batching.
		for i := 0; i < 10; i++ {
			for j := 0; j < 10; j++ {
				err := b.Push(func(ctx Context) {
					ctx["shared_state"] = ctx["shared_state"].(int) + 1
				})
				require.NoError(t, err)
			}
			time.Sleep(50 * time.Millisecond)
		}

		b.Stop()
	})

	t.Run("returning error", func(t *testing.T) {
		b, err := NewBatcher(Config{
			Interval: 10 * time.Millisecond,
			Size:     100,
			PreRunCb: func(_ Context) error {
				return fmt.Errorf("some error")
			},
		})
		require.NoError(t, err)
		require.NotNil(t, b)

		b.Start()

		var counter int
		// Simulating some bursts of requests that need batching.
		for i := 0; i < 10; i++ {
			for j := 0; j < 10; j++ {
				err := b.Push(func(_ Context) {
					counter++
				})
				require.NoError(t, err)
			}
			time.Sleep(50 * time.Millisecond)
		}

		b.Stop()
		require.Zero(t, counter)
	})
}
