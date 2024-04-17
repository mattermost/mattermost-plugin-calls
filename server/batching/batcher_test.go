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
			b, err := NewBatcher(0, 100)
			require.EqualError(t, err, "interval should be > 0")
			require.Nil(t, b)
		})

		t.Run("invalid size", func(t *testing.T) {
			b, err := NewBatcher(time.Second, 0)
			require.EqualError(t, err, "size should be > 0")
			require.Nil(t, b)
		})

		t.Run("valid", func(t *testing.T) {
			b, err := NewBatcher(time.Second, 10)
			require.NoError(t, err)
			require.NotNil(t, b)
		})
	})

	t.Run("batching", func(t *testing.T) {
		b, err := NewBatcher(10*time.Millisecond, 10)
		require.NoError(t, err)
		require.NotNil(t, b)

		b.Start()

		var counter int

		// Simulating some bursts of requests that need batching.
		go func() {
			for i := 0; i < 10; i++ {
				for j := 0; j < 10; j++ {
					fmt.Printf("pushing %d\n", i*10+j)
					err := b.Push(func() {
						fmt.Printf("executing %d\n", counter)
						counter++
					})
					require.NoError(t, err)
				}
				time.Sleep(50 * time.Millisecond)
			}
		}()

		time.Sleep(1 * time.Second)

		b.Stop()

		require.Equal(t, 100, counter)
		require.GreaterOrEqual(t, b.batches, 10)
	})
}
