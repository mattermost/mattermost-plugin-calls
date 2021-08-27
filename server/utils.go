package main

import (
	"fmt"
)

func (p *Plugin) kvSetAtomic(key string, cb func(data []byte) ([]byte, error)) error {
	for {
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
