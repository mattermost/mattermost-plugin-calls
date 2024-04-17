// Copyright (c) 2022-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package batching

import (
	"fmt"
	"time"
)

type Item func()

type Batcher struct {
	interval time.Duration
	itemsCh  chan Item
	stopCh   chan struct{}
	doneCh   chan struct{}
	batches  int
}

// NewBatcher creates a new Batcher with the given options:
// interval: the frequency at which batches should be executed
// size: the maximum size of the items queue
func NewBatcher(interval time.Duration, size int) (*Batcher, error) {
	if interval <= 0 {
		return nil, fmt.Errorf("interval should be > 0")
	}

	if size <= 0 {
		return nil, fmt.Errorf("size should be > 0")
	}

	return &Batcher{
		interval: interval,
		itemsCh:  make(chan Item, size),
		stopCh:   make(chan struct{}),
		doneCh:   make(chan struct{}),
	}, nil
}

// Push adds one item into the batch queue.
func (b *Batcher) Push(item Item) error {
	select {
	case b.itemsCh <- item:
	default:
		return fmt.Errorf("failed to push item, channel is full")
	}

	return nil
}

// Start starts the batching process. Should only be called once.
func (b *Batcher) Start() {
	go func() {
		defer close(b.doneCh)
		ticker := time.NewTicker(b.interval)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				if batchSize := len(b.itemsCh); batchSize > 0 {
					for i := 0; i < batchSize; i++ {
						(<-b.itemsCh)()
					}
					b.batches++
				}
			case <-b.stopCh:
				return
			}
		}
	}()
}

// Stop stops the batching process. Should only be called once.
func (b *Batcher) Stop() {
	close(b.stopCh)
	<-b.doneCh
}
