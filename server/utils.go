package main

import (
	"fmt"

	"github.com/prometheus/client_golang/prometheus"
)

func (p *Plugin) kvSetAtomic(key string, cb func(data []byte) ([]byte, error)) error {
	for {
		p.metrics.StoreOpCounters.With(prometheus.Labels{"type": "KVGet"}).Inc()
		storedData, appErr := p.API.KVGet(key)
		if appErr != nil {
			return fmt.Errorf("KVGet failed: %w", appErr)
		}

		toStoreData, err := cb(storedData)
		if err != nil {
			return fmt.Errorf("callback failed: %w", err)
		} else if toStoreData == nil {
			return nil
		}

		p.metrics.StoreOpCounters.With(prometheus.Labels{"type": "KVCompareAndSet"}).Inc()
		ok, appErr := p.API.KVCompareAndSet(key, storedData, toStoreData)
		if appErr != nil {
			return fmt.Errorf("KVCompareAndSet failed: %w", appErr)
		}

		if !ok {
			continue
		}

		return nil
	}
}

func (p *Plugin) iterSessions(channelID string, cb func(us *session)) {
	p.mut.RLock()
	for _, session := range p.sessions {
		if session.channelID == channelID {
			p.mut.RUnlock()
			cb(session)
			p.mut.RLock()
		}
	}
	p.mut.RUnlock()
}
