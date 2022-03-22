package main

import (
	"bytes"
	"compress/zlib"
	"context"
	"fmt"
	"io"
	"net"
	"strings"
	"time"

	"github.com/pion/stun"
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

func getPublicIP(conn net.PacketConn, iceServers []string) (string, error) {
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

func resolveHost(host string, timeout time.Duration) (string, error) {
	var ip string
	r := net.Resolver{}
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	addrs, err := r.LookupIP(ctx, "ip4", host)
	if err != nil {
		return ip, fmt.Errorf("failed to resolve host %q: %w", host, err)
	}
	if len(addrs) > 0 {
		ip = addrs[0].String()
	}
	return ip, err
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
