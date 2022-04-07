package main

import (
	"bytes"
	"compress/zlib"
	"fmt"
	"io"
	"net"
	"strings"
	"time"

	"github.com/pion/stun"
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
			continue
		}

		return nil
	}
}

func getPublicIP(port int, iceServers []string) (string, error) {
	conn, err := net.ListenUDP("udp4", &net.UDPAddr{
		Port: port,
	})
	if err != nil {
		return "", err
	}
	defer conn.Close()

	var stunURL string
	for _, u := range iceServers {
		if strings.HasPrefix(u, "stun:") {
			stunURL = u
		}
	}
	if stunURL == "" {
		return "", fmt.Errorf("no STUN server URL was found")
	}
	serverURL := stunURL[strings.Index(stunURL, ":")+1:]
	serverAddr, err := net.ResolveUDPAddr("udp", serverURL)
	if err != nil {
		return "", fmt.Errorf("failed to resolve stun host: %w", err)
	}

	xoraddr, err := getXORMappedAddr(conn, serverAddr, 5*time.Second)
	if err != nil {
		return "", fmt.Errorf("failed to get public address: %w", err)
	}

	return xoraddr.IP.String(), nil
}

func getXORMappedAddr(conn net.PacketConn, serverAddr net.Addr, deadline time.Duration) (*stun.XORMappedAddress, error) {
	if deadline > 0 {
		if err := conn.SetReadDeadline(time.Now().Add(deadline)); err != nil {
			return nil, err
		}
	}
	defer func() {
		if deadline > 0 {
			_ = conn.SetReadDeadline(time.Time{})
		}
	}()
	resp, err := stunRequest(
		func(p []byte) (int, error) {
			n, _, errr := conn.ReadFrom(p)
			return n, errr
		},
		func(b []byte) (int, error) {
			return conn.WriteTo(b, serverAddr)
		},
	)
	if err != nil {
		return nil, err
	}
	var addr stun.XORMappedAddress
	if err = addr.GetFrom(resp); err != nil {
		return nil, err
	}
	return &addr, nil
}

func stunRequest(read func([]byte) (int, error), write func([]byte) (int, error)) (*stun.Message, error) {
	req, err := stun.Build(stun.BindingRequest, stun.TransactionID)
	if err != nil {
		return nil, err
	}
	if _, err = write(req.Raw); err != nil {
		return nil, err
	}
	const maxMessageSize = 1280
	bs := make([]byte, maxMessageSize)
	n, err := read(bs)
	if err != nil {
		return nil, err
	}
	res := &stun.Message{Raw: bs[:n]}
	if err := res.Decode(); err != nil {
		return nil, err
	}
	return res, nil
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
