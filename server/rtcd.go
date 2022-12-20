// Copyright (c) 2022-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"net/url"
	"os"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	rtcd "github.com/mattermost/rtcd/service"
	"github.com/mattermost/rtcd/service/random"
	"github.com/mattermost/rtcd/service/rtc"

	"github.com/mattermost/mattermost-plugin-api/cluster"
	"github.com/mattermost/mattermost-server/v6/model"
)

const (
	rtcdConfigKey        = "rtcd_config"
	maxReconnectAttempts = 8
	lockTimeout          = 5 * time.Second
	resolveTimeout       = 2 * time.Second
	dialingTimeout       = 4 * time.Second
	hostCheckInterval    = 10 * time.Second
)

type rtcdHost struct {
	ip           string
	client       *rtcd.Client
	callsCounter uint64
	flagged      bool
	mut          sync.RWMutex
}

type rtcdClientManager struct {
	ctx *Plugin

	rtcdURL  string
	rtcdPort string

	hosts map[string]*rtcdHost

	mut     sync.RWMutex
	closeCh chan (struct{})
}

func (p *Plugin) newRTCDClientManager(rtcdURL string) (m *rtcdClientManager, err error) {
	m = &rtcdClientManager{
		ctx:     p,
		rtcdURL: rtcdURL,
		closeCh: make(chan struct{}),
		hosts:   map[string]*rtcdHost{},
	}

	ips, port, err := resolveURL(rtcdURL, resolveTimeout)
	if err != nil {
		return nil, fmt.Errorf("failed to resolve URL: %w", err)
	}
	m.rtcdPort = port

	hosts := m.hosts

	defer func() {
		// closing all clients in case of error
		if m == nil {
			for _, host := range hosts {
				host.client.Close()
			}
		}
	}()

	for _, ip := range ips {
		client, err := m.newRTCDClient(rtcdURL, ip.String(), getDialFn(ip.String(), port))
		if err != nil {
			return nil, err
		}
		if err := m.addHost(ip.String(), client); err != nil {
			return nil, fmt.Errorf("failed to add host: %w", err)
		}
		m.ctx.LogDebug("rtcd client created successfully", "host", ip.String())
	}

	go m.hostsChecker()

	return m, nil
}

// hostsChecker runs in a dedicated goroutine that routinely resolves all
// the available hosts (ip addresses) pointed by the rtcd URL that are advertised through DNS.
// When new hosts are found a client for them is created. Hosts that are missing
// from the returned set are flagged and won't be used for new calls.
func (m *rtcdClientManager) hostsChecker() {
	ticker := time.NewTicker(hostCheckInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			ips, _, err := resolveURL(m.rtcdURL, resolveTimeout)
			if err != nil {
				m.ctx.LogError(fmt.Sprintf("failed to resolve URL: %s", err.Error()))
				continue
			}

			ipsMap := map[string]bool{}
			for _, ip := range ips {
				ipsMap[ip.String()] = true
			}

			// we look for hosts that may not be advertised anymore.
			m.mut.RLock()
			for ip, host := range m.hosts {
				host.mut.Lock()
				if _, ok := ipsMap[ip]; !ok && !host.flagged {
					// flag host
					m.ctx.LogDebug("flagging host", "host", ip)
					host.flagged = true
				} else if ok && host.flagged {
					// unflag host in the rare case a new host came up with the same ip.
					m.ctx.LogDebug("unflagging host", "host", ip)
					host.flagged = false
				}
				host.mut.Unlock()
			}
			m.mut.RUnlock()

			// we look for newly advertised hosts we may not have a client for yet.
			for ip := range ipsMap {
				m.mut.RLock()
				_, ok := m.hosts[ip]
				m.mut.RUnlock()
				if !ok {
					// create new client
					m.ctx.LogDebug("creating client for missing host", "host", ip)
					client, err := m.newRTCDClient(m.rtcdURL, ip, getDialFn(ip, m.rtcdPort))
					if err != nil {
						m.ctx.LogError(fmt.Sprintf("failed to create new client: %s", err.Error()), "host", ip)
						continue
					}

					if err := m.addHost(ip, client); err != nil {
						m.ctx.LogError(fmt.Sprintf("failed to add host: %s", err.Error()), "host", ip)
						continue
					}
				}
			}
		case <-m.closeCh:
			return
		}
	}
}

func (m *rtcdClientManager) removeHost(host string) error {
	m.mut.Lock()
	defer m.mut.Unlock()

	m.ctx.LogDebug("removing rtcd host", "host", host)

	h, ok := m.hosts[host]
	if !ok {
		return fmt.Errorf("missing rtcd host")
	}

	_ = h.client.Close()
	delete(m.hosts, host)

	return nil
}

func (m *rtcdClientManager) addHost(host string, client *rtcd.Client) (err error) {
	m.mut.Lock()
	defer m.mut.Unlock()

	defer func() {
		if err != nil {
			_ = client.Close()
		}
	}()

	m.ctx.LogDebug("adding rtcd host", "host", host)

	if _, ok := m.hosts[host]; ok {
		return fmt.Errorf("rtcd host was added already")
	}

	m.hosts[host] = &rtcdHost{
		ip:     host,
		client: client,
	}

	go m.clientReader(client)

	return nil
}

// GetHostForNewCall returns the host to which a new call should be routed.
// It performs a simple round-robin strategy based on number of calls.
// New calls are routed to the non-flagged host with the smaller count.
func (m *rtcdClientManager) GetHostForNewCall() (string, error) {
	m.mut.RLock()
	defer m.mut.RUnlock()

	var h *rtcdHost
	var minCounter uint64
	for _, host := range m.hosts {
		host.mut.RLock()
		// TODO: this only takes into consideration the calls started from this
		// instance. A better strategy would be to ask rtcd for a global count (coming soon).
		// TODO: consider also checking if the client is currently connected.
		if !host.flagged && (h == nil || host.callsCounter < minCounter) {
			h = host
			minCounter = host.callsCounter
		}
		host.mut.RUnlock()
	}

	if h == nil {
		return "", fmt.Errorf("no host available")
	}

	h.mut.Lock()
	h.callsCounter++
	h.mut.Unlock()

	return h.ip, nil
}

// Send routes the message to the appropriate host that's handling the given
// call. If this is missing a new client is created and added to the mapping.
func (m *rtcdClientManager) Send(msg rtcd.ClientMessage, callID string) error {
	state, err := m.ctx.kvGetChannelState(callID)
	if err != nil {
		return fmt.Errorf("failed to get channel state: %w", err)
	}
	if state.Call == nil {
		return fmt.Errorf("state.Call should not be nil")
	}
	host := state.Call.RTCDHost

	m.mut.RLock()
	h := m.hosts[host]
	m.mut.RUnlock()

	var client *rtcd.Client
	if h == nil {
		client, err = m.newRTCDClient(m.rtcdURL, host, getDialFn(host, m.rtcdPort))
		if err != nil {
			return fmt.Errorf("failed to create new client: %w", err)
		}
		if err := m.addHost(state.Call.RTCDHost, client); err != nil {
			return fmt.Errorf("failed to add host: %w", err)
		}
	} else {
		client = h.client
	}

	return client.Send(msg)
}

func (m *rtcdClientManager) Close() error {
	m.mut.RLock()
	defer m.mut.RUnlock()

	close(m.closeCh)

	var err error
	for _, host := range m.hosts {
		err = host.client.Close()
	}
	return err
}

func resolveURL(u string, timeout time.Duration) ([]net.IP, string, error) {
	parsed, err := url.Parse(u)
	if err != nil {
		return nil, "", fmt.Errorf("failed to parse url: %w", err)
	}

	host, port, err := net.SplitHostPort(parsed.Host)
	if err != nil {
		return nil, "", fmt.Errorf("failed to split host/port: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	ips, err := net.DefaultResolver.LookupIP(ctx, "ip4", host)
	if err != nil {
		return nil, "", fmt.Errorf("failed to lookup ips: %w", err)
	}

	return ips, port, nil
}

func (m *rtcdClientManager) newRTCDClient(rtcdURL, host string, dialFn rtcd.DialContextFn) (*rtcd.Client, error) {
	// Remove trailing slash if present.
	rtcdURL = strings.TrimSuffix(rtcdURL, "/")

	clientCfg, err := m.getRTCDClientConfig(rtcdURL, dialFn)
	if err != nil {
		return nil, fmt.Errorf("failed to get rtcd client config: %w", err)
	}

	registerClient := func() error {
		mutex, err := cluster.NewMutex(m.ctx.API, "rtcd_registration")
		if err != nil {
			return fmt.Errorf("failed to create cluster mutex: %w", err)
		}

		lockCtx, cancelCtx := context.WithTimeout(context.Background(), lockTimeout)
		defer cancelCtx()
		if err := mutex.LockWithContext(lockCtx); err != nil {
			return fmt.Errorf("failed to acquire cluster lock: %w", err)
		}
		defer mutex.Unlock()

		if err := m.registerRTCDClient(clientCfg, dialFn); err != nil {
			return fmt.Errorf("failed to register rtcd client: %w", err)
		}

		return nil
	}

	reconnectCb := func(c *rtcd.Client, attempt int) error {
		if attempt >= maxReconnectAttempts {
			if err := m.removeHost(host); err != nil {
				m.ctx.LogError("failed to remove rtcd client: %w", err)
			}
			return fmt.Errorf("max reconnection attempts reached, removing client")
		}
		if err := registerClient(); err != nil {
			m.ctx.LogError(fmt.Sprintf("failed to register client: %s", err.Error()))
			return nil
		}
		return nil
	}

	client, err := rtcd.NewClient(clientCfg, rtcd.WithClientReconnectCb(reconnectCb), rtcd.WithDialFunc(dialFn))
	if err != nil {
		return nil, fmt.Errorf("failed to create rtcd client: %w", err)
	}

	err = client.Connect()
	if err == nil {
		return client, nil
	}
	defer client.Close()

	// If connecting fails we attempt to re-register once as the rtcd instance may
	// have restarted, potentially losing stored credentials.

	m.ctx.LogError(fmt.Sprintf("failed to connect rtcd client: %s", err.Error()))
	m.ctx.LogDebug("attempting to re-register the rtcd client")

	if err := registerClient(); err != nil {
		return nil, err
	}

	newClient, err := rtcd.NewClient(clientCfg, rtcd.WithClientReconnectCb(reconnectCb), rtcd.WithDialFunc(dialFn))
	if err != nil {
		return nil, fmt.Errorf("failed to create rtcd client: %w", err)
	}

	if err := newClient.Connect(); err != nil {
		return nil, fmt.Errorf("failed to connect rtcd client: %w", err)
	}

	return newClient, nil
}

func (m *rtcdClientManager) getStoredRTCDConfig() (rtcd.ClientConfig, error) {
	var cfg rtcd.ClientConfig
	m.ctx.metrics.IncStoreOp("KVGet")
	data, appErr := m.ctx.API.KVGet(rtcdConfigKey)
	if appErr != nil {
		return cfg, fmt.Errorf("failed to get rtcd config: %w", appErr)
	}
	if len(data) == 0 {
		return cfg, nil
	}
	if err := json.Unmarshal(data, &cfg); err != nil {
		return cfg, fmt.Errorf("failed to unmarshal rtcd config: %w", err)
	}
	return cfg, nil
}

func (m *rtcdClientManager) getRTCDClientConfig(rtcdURL string, dialFn rtcd.DialContextFn) (rtcd.ClientConfig, error) {
	var cfg rtcd.ClientConfig

	// Give precedence to environment to override everything else.
	cfg.ClientID = os.Getenv("MM_CLOUD_INSTALLATION_ID")
	if cfg.ClientID == "" {
		if isCloud(m.ctx.pluginAPI.System.GetLicense()) {
			m.ctx.LogError("installation id is missing")
		}
		cfg.ClientID = os.Getenv("MM_CALLS_RTCD_CLIENT_ID")
	} else {
		m.ctx.LogDebug("installation id is set", "id", cfg.ClientID)
	}
	cfg.AuthKey = os.Getenv("MM_CALLS_RTCD_AUTH_KEY")
	cfg.URL = rtcdURL

	// Parsing the URL in case it's already containing credentials.
	u, clientID, authKey, err := parseURL(cfg.URL)
	if err != nil {
		return cfg, fmt.Errorf("failed to parse URL: %w", err)
	}
	if cfg.ClientID == "" && cfg.AuthKey == "" {
		cfg.ClientID = clientID
		cfg.AuthKey = authKey
	}
	// Updating to the clean URL (with credentials stripped if present).
	cfg.URL = u

	// if no URL has been provided until now we fail with error.
	if cfg.URL == "" {
		return cfg, fmt.Errorf("rtcd URL is missing")
	}

	// Use the telemetry ID if none is explicitly given.
	if cfg.ClientID == "" {
		cfg.ClientID = m.ctx.API.GetDiagnosticId()
	}

	// If no client id has been provided until now we fail with error.
	if cfg.ClientID == "" {
		return cfg, fmt.Errorf("client id is missing")
	}

	// If the auth key is set we proceed and return the config.
	// Otherwise we need to either fetch the config from the k/v store
	// or register the client.
	if cfg.AuthKey != "" {
		return cfg, nil
	}

	// Here we need some coordination to avoid multiple plugin instances to
	// register at the same time (at most one would succeed).
	mutex, err := cluster.NewMutex(m.ctx.API, "rtcd_registration")
	if err != nil {
		return cfg, fmt.Errorf("failed to create cluster mutex: %w", err)
	}

	lockCtx, cancelCtx := context.WithTimeout(context.Background(), lockTimeout)
	defer cancelCtx()
	if err := mutex.LockWithContext(lockCtx); err != nil {
		return cfg, fmt.Errorf("failed to acquire cluster lock: %w", err)
	}
	defer mutex.Unlock()

	if storedCfg, err := m.getStoredRTCDConfig(); err != nil {
		return cfg, fmt.Errorf("failed to get rtcd credentials: %w", err)
	} else if storedCfg.URL == cfg.URL && storedCfg.ClientID == cfg.ClientID {
		return storedCfg, nil
	}

	if cfg.AuthKey == "" {
		m.ctx.LogDebug("auth key missing from rtcd config, generating a new one")
		cfg.AuthKey, err = random.NewSecureString(32)
		if err != nil {
			return cfg, fmt.Errorf("failed to generate auth key: %w", err)
		}
	}

	if err := m.registerRTCDClient(cfg, dialFn); err != nil {
		return cfg, fmt.Errorf("failed to register rtcd client: %w", err)
	}

	return cfg, nil
}

func (m *rtcdClientManager) registerRTCDClient(cfg rtcd.ClientConfig, dialFn rtcd.DialContextFn) error {
	client, err := rtcd.NewClient(cfg, rtcd.WithDialFunc(dialFn))
	if err != nil {
		return fmt.Errorf("failed to create rtcd client: %w", err)
	}
	defer client.Close()

	cfgData, err := json.Marshal(&cfg)
	if err != nil {
		return fmt.Errorf("failed to marshal rtcd client config: %w", err)
	}

	if err := client.Register(cfg.ClientID, cfg.AuthKey); err != nil {
		return fmt.Errorf("failed to register rtcd client: %w", err)
	}

	// TODO: guard against the "locked out" corner case that the server/plugin process exits
	// before being able to store the credentials but after a successful
	// registration.
	m.ctx.metrics.IncStoreOp("KVSet")
	if err := m.ctx.API.KVSet(rtcdConfigKey, cfgData); err != nil {
		return fmt.Errorf("failed to store rtcd client config: %w", err)
	}

	m.ctx.LogDebug("rtcd client registered successfully", "clientID", cfg.ClientID)

	return nil
}

func (m *rtcdClientManager) handleClientMsg(msg rtcd.ClientMessage) error {
	if msg.Type == rtcd.ClientMessageHello {
		msgData, ok := msg.Data.(map[string]string)
		if !ok {
			return fmt.Errorf("unexpected data type %T", msg.Data)
		}
		m.ctx.LogDebug("received hello message from rtcd", "connID", msgData["connID"])
		return nil
	} else if msg.Type == rtcd.ClientMessageClose {
		msgData, ok := msg.Data.(map[string]string)
		if !ok {
			return fmt.Errorf("unexpected data type %T", msg.Data)
		}
		sessionID := msgData["sessionID"]
		if sessionID == "" {
			return fmt.Errorf("missing sessionID")
		}
		m.ctx.LogDebug("received close message from rtcd", "sessionID", sessionID)
		m.ctx.mut.RLock()
		us := m.ctx.sessions[sessionID]
		m.ctx.mut.RUnlock()
		if us != nil && atomic.CompareAndSwapInt32(&us.rtcClosed, 0, 1) {
			m.ctx.LogDebug("closing rtc close channel", "sessionID", sessionID)
			close(us.rtcCloseCh)
			return m.ctx.removeSession(us)
		}
		return nil
	}

	rtcMsg, ok := msg.Data.(rtc.Message)
	if !ok {
		return fmt.Errorf("unexpected data type %T", msg.Data)
	}

	if rtcMsg.Type == rtc.VoiceOnMessage || rtcMsg.Type == rtc.VoiceOffMessage {
		evType := wsEventUserVoiceOff
		if rtcMsg.Type == rtc.VoiceOnMessage {
			evType = wsEventUserVoiceOn
		}
		m.ctx.publishWebSocketEvent(evType, map[string]interface{}{
			"userID": rtcMsg.UserID,
		}, &model.WebsocketBroadcast{ChannelId: rtcMsg.CallID})
		return nil
	}

	m.ctx.LogDebug("relaying ws message", "sessionID", rtcMsg.SessionID, "userID", rtcMsg.UserID)
	m.ctx.publishWebSocketEvent(wsEventSignal, map[string]interface{}{
		"data":   string(rtcMsg.Data),
		"connID": rtcMsg.SessionID,
	}, &model.WebsocketBroadcast{UserId: rtcMsg.UserID, ReliableClusterSend: true})

	return nil
}

func getDialFn(host, port string) rtcd.DialContextFn {
	return func(ctx context.Context, network, addr string) (net.Conn, error) {
		dialer := &net.Dialer{
			Timeout: dialingTimeout,
		}
		return dialer.DialContext(ctx, "tcp", fmt.Sprintf("%s:%s", host, port))
	}
}

func (m *rtcdClientManager) clientReader(client *rtcd.Client) {
	for {
		select {
		case err, ok := <-client.ErrorCh():
			if !ok {
				return
			}
			m.ctx.LogError(err.Error())
		case msg, ok := <-client.ReceiveCh():
			if !ok {
				return
			}
			if err := m.handleClientMsg(msg); err != nil {
				m.ctx.LogError(err.Error())
			}
		}
	}
}
