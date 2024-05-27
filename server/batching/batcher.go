// Copyright (c) 2022-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package batching

import (
	"fmt"
	"time"
)

type Context map[string]any

const (
	ContextBatchNumKey  = "batch_num"
	ContextBatchSizeKey = "batch_size"
)

type Item func(ctx Context)
type BatchCb func(ctx Context) error

type Batcher struct {
	cfg     Config
	itemsCh chan Item
	stopCh  chan struct{}
	doneCh  chan struct{}
	batches int
}

type Config struct {
	// The frequency at which batches should be executed.
	Interval time.Duration
	// The maximum size of the queue of items.
	Size int
	// An optional callback to be executed before processing a batch.
	// This is where expensive operations should usually be performed
	// in order to make the batching efficient.
	PreRunCb BatchCb
	// An optional callback to be executed after processing a batch.
	PostRunCb BatchCb
}

// NewBatcher creates a new Batcher with the given config.
func NewBatcher(cfg Config) (*Batcher, error) {
	if cfg.Interval <= 0 {
		return nil, fmt.Errorf("interval should be > 0")
	}

	if cfg.Size <= 0 {
		return nil, fmt.Errorf("size should be > 0")
	}

	return &Batcher{
		cfg:     cfg,
		itemsCh: make(chan Item, cfg.Size),
		stopCh:  make(chan struct{}),
		doneCh:  make(chan struct{}),
	}, nil
}

// Push adds one item into the work queue.
func (b *Batcher) Push(item Item) error {
	select {
	case b.itemsCh <- item:
	default:
		return fmt.Errorf("failed to push item, channel is full")
	}

	return nil
}

// Start begins the processing of batches at the configured interval. Should only be called once.
func (b *Batcher) Start() {
	go func() {
		defer close(b.doneCh)
		ticker := time.NewTicker(b.cfg.Interval)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				if batchSize := len(b.itemsCh); batchSize > 0 {
					b.batches++

					ctx := Context{
						ContextBatchNumKey:  b.batches,
						ContextBatchSizeKey: batchSize,
					}

					if b.cfg.PreRunCb != nil {
						if err := b.cfg.PreRunCb(ctx); err != nil {
							continue
						}
					}

					for i := 0; i < batchSize; i++ {
						(<-b.itemsCh)(ctx)
					}

					if b.cfg.PostRunCb != nil {
						_ = b.cfg.PostRunCb(ctx)
					}
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
