package main

import (
	"bytes"
	"compress/zlib"
	"fmt"
	"io"
	"net/url"
	"time"
)

const (
	handlerKey              = "handler"
	handlerKeyCheckInterval = 5 * time.Second
)

func (p *Plugin) getHandlerID() (string, error) {
	p.metrics.IncStoreOp("KVGet")
	data, appErr := p.API.KVGet(handlerKey)
	if appErr != nil {
		return "", fmt.Errorf("failed to get handler id: %w", appErr)
	}
	return string(data), nil
}

func (p *Plugin) setHandlerID(nodeID string) error {
	p.metrics.IncStoreOp("KVSetWithExpiry")
	if appErr := p.API.KVSetWithExpiry(handlerKey, []byte(nodeID), int64(handlerKeyCheckInterval.Seconds()*2)); appErr != nil {
		return fmt.Errorf("failed to set handler id: %w", appErr)
	}
	return nil
}

func (p *Plugin) kvSetAtomic(key string, cb func(data []byte) ([]byte, error)) error {
	for {
		p.metrics.IncStoreOp("KVGet")
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

		p.metrics.IncStoreOp("KVCompareAndSet")
		ok, appErr := p.API.KVCompareAndSet(key, storedData, toStoreData)
		if appErr != nil {
			return fmt.Errorf("KVCompareAndSet failed: %w", appErr)
		}

		if !ok {
			// pausing a little to avoid excessive lock contention
			time.Sleep(5 * time.Millisecond)
			continue
		}

		return nil
	}
}

func unpackSDPData(data []byte) ([]byte, error) {
	buf := bytes.NewBuffer(data)
	rd, err := zlib.NewReader(buf)
	if err != nil {
		return nil, fmt.Errorf("failed to create reader: %w", err)
	}
	unpacked, err := io.ReadAll(rd)
	if err != nil {
		return nil, fmt.Errorf("failed to read data: %w", err)
	}
	return unpacked, nil
}

func parseURL(u string) (string, string, string, error) {
	parsed, err := url.Parse(u)
	if err != nil {
		return "", "", "", fmt.Errorf("failed to parse URL: %w", err)
	}

	clientID := parsed.User.Username()
	authKey, _ := parsed.User.Password()
	parsed.User = nil

	return parsed.String(), clientID, authKey, nil
}
