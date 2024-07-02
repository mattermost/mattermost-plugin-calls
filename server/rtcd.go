// Copyright (c) 2022-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math/rand"
	"net"
	"net/url"
	"os"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/mattermost/mattermost-plugin-calls/server/cluster"
	"github.com/mattermost/mattermost-plugin-calls/server/db"
	"github.com/mattermost/mattermost-plugin-calls/server/interfaces"
	"github.com/mattermost/mattermost-plugin-calls/server/license"

	rtcd "github.com/mattermost/rtcd/service"
	"github.com/mattermost/rtcd/service/random"
	"github.com/mattermost/rtcd/service/rtc"
)

const (
	rtcdConfigKey           = "rtcd_config"
	maxReconnectAttempts    = 8
	resolveTimeout          = 2 * time.Second
	dialingTimeout          = 4 * time.Second
	hostCheckInterval       = 10 * time.Second
	baseReconnectIntervalMs = 5000
)

var errClientReplaced = errors.New("client replaced")

type rtcdHost struct {
	ip      string
	client  interfaces.RTCDClient
	flagged bool
	mut     sync.RWMutex
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
				m.ctx.LogWarn(fmt.Sprintf("failed to resolve URL: %s", err.Error()))
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
				if h := m.getHost(ip); h == nil {
					// create new client

					// We add some jitter to try and avoid multiple clients to attempt
					// authentication/registration all at the same exact time.
					time.Sleep(time.Duration(rand.Intn(baseReconnectIntervalMs)) * time.Millisecond)

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

func (m *rtcdClientManager) getHost(ip string) *rtcdHost {
	m.mut.RLock()
	defer m.mut.RUnlock()
	return m.hosts[ip]
}

// GetHostForNewCall returns the host to which a new call should be routed to.
// It requests system load information from all the host available (not flagged and connected)
// and selects the one with the lower load which is assigned for the call.
func (m *rtcdClientManager) GetHostForNewCall() (string, error) {
	m.mut.RLock()
	defer m.mut.RUnlock()

	var hostsAvailable []*rtcdHost
	for ip, host := range m.hosts {
		host.mut.RLock()
		flagged := host.flagged
		host.mut.RUnlock()

		offline := !host.client.Connected()

		// Can't assign flagged (e.g in draining process) nor offline hosts.
		if flagged || offline {
			m.ctx.LogDebug("skipping host from selection",
				"host", host.ip,
				"flagged", fmt.Sprintf("%t", flagged),
				"offline", fmt.Sprintf("%t", offline))
			continue
		}

		hostsAvailable = append(hostsAvailable, m.hosts[ip])
	}

	if len(hostsAvailable) == 0 {
		return "", fmt.Errorf("no host available")
	}

	// Now we want to select the instance with the lowest system load.
	var minLoad float64
	var hostWithMinLoad *rtcdHost
	for i, host := range hostsAvailable {
		info, err := host.client.GetSystemInfo()
		if err != nil {
			m.ctx.LogError("failed to get rtcd system info", "host", host.ip, "err", err.Error())
			continue
		}

		m.ctx.LogDebug("got system info for rtcd host", "host", host.ip, "info", fmt.Sprintf("%+v", info))

		if hostWithMinLoad == nil {
			minLoad = info.CPULoad
			hostWithMinLoad = hostsAvailable[i]
		} else if info.CPULoad < minLoad {
			minLoad = info.CPULoad
			hostWithMinLoad = hostsAvailable[i]
		}
	}

	// Fallback to random choice if we couldn't get system info.
	if hostWithMinLoad == nil {
		hostWithMinLoad = hostsAvailable[rand.Intn(len(hostsAvailable))]
	}

	return hostWithMinLoad.ip, nil
}

// Send routes the message to the appropriate host that's handling the given
// call. If this is missing a new client is created and added to the mapping.
func (m *rtcdClientManager) Send(msg rtcd.ClientMessage, host string) error {
	var client interfaces.RTCDClient

	if host == "" {
		return fmt.Errorf("host should not be empty")
	}

	if h := m.getHost(host); h == nil {
		m.ctx.LogDebug("creating client for missing host on send", "host", host)
		client, err := m.newRTCDClient(m.rtcdURL, host, getDialFn(host, m.rtcdPort))
		if err != nil {
			return fmt.Errorf("failed to create new client: %w", err)
		}
		if err := m.addHost(host, client); err != nil {
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

func (m *rtcdClientManager) versionCheck(client *rtcd.Client) error {
	// Version compatibility check.
	info, err := client.GetVersionInfo()
	if err != nil {
		return fmt.Errorf("failed to get rtcd version info: %w", err)
	}

	minRTCDVersion, ok := manifest.Props["min_rtcd_version"].(string)
	if !ok {
		return fmt.Errorf("failed to get min_rtcd_version from manifest")
	}

	// Always support dev builds.
	if info.BuildVersion == "" || info.BuildVersion == "master" || strings.HasPrefix(info.BuildVersion, "dev") {
		m.ctx.LogInfo("skipping version compatibility check", "buildVersion", info.BuildVersion)
		return nil
	}

	if err := checkMinVersion(minRTCDVersion, info.BuildVersion); err != nil {
		return fmt.Errorf("minimum version check failed: %w", err)
	}

	m.ctx.LogDebug("rtcd version compatibility check succeeded",
		"min_rtcd_version", minRTCDVersion,
		"curr_rtcd_version", info.BuildVersion)

	return nil
}

func (m *rtcdClientManager) newRTCDClient(rtcdURL, host string, dialFn rtcd.DialContextFn) (*rtcd.Client, error) {
	// Remove trailing slash if present.
	rtcdURL = strings.TrimSuffix(rtcdURL, "/")

	clientCfg, err := m.getRTCDClientConfig(rtcdURL)
	if err != nil {
		return nil, fmt.Errorf("failed to get rtcd client config: %w", err)
	}

	var reconnectCb rtcd.ClientReconnectCb
	reconnectCb = func(_ *rtcd.Client, attempt int) error {
		if attempt >= maxReconnectAttempts {
			if err := m.removeHost(host); err != nil {
				m.ctx.LogError("failed to remove rtcd client: %w", err)
			}
			return fmt.Errorf("max reconnection attempts reached, removing client")
		}

		h := m.getHost(host)
		if h == nil {
			return fmt.Errorf("host is missing")
		}

		if h.isFlagged() {
			if err := m.removeHost(host); err != nil {
				m.ctx.LogError("failed to remove rtcd client: %w", err)
			}
			return fmt.Errorf("host was flagged")
		}

		// On disconnect, it's possible the rtcd server restarted
		// and cleared its stored credentials, so we attempt to connect and
		// register again if that fails.
		m.ctx.LogDebug("reconnect callback, reconnection attempt")

		_, client, err := m.registerRTCDClient(clientCfg, reconnectCb, dialFn)
		if err != nil {
			m.ctx.LogWarn(fmt.Sprintf("failed to register client: %s", err.Error()))
			return nil
		}

		m.ctx.LogDebug("reconnection successful, replacing client")

		if err = m.removeHost(host); err != nil {
			m.ctx.LogError("failed to remove rtcd client: %w", err)
		}

		if err = m.addHost(host, client); err != nil {
			m.ctx.LogError("failed to add rtcd client: %w", err)
		}

		if err != nil {
			client.Close()
			return nil
		}

		return errClientReplaced
	}

	clientCfg, client, err := m.registerRTCDClient(clientCfg, reconnectCb, dialFn)
	if err != nil {
		return nil, err
	}

	if err := m.versionCheck(client); err != nil {
		if err := client.Close(); err != nil {
			m.ctx.LogError(fmt.Sprintf("failed to close client: %s", err.Error()))
		}
		return nil, fmt.Errorf("version compatibility check failed: %w", err)
	}

	return client, nil
}

func (m *rtcdClientManager) getStoredRTCDConfig() (rtcd.ClientConfig, error) {
	var cfg rtcd.ClientConfig
	data, appErr := m.ctx.KVGet(rtcdConfigKey, false)
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

func (m *rtcdClientManager) getRTCDClientConfig(rtcdURL string) (rtcd.ClientConfig, error) {
	var cfg rtcd.ClientConfig

	// We add some jitter to try and avoid multiple clients to attempt
	// authentication/registration all at the same exact time.
	cfg.ReconnectInterval = time.Duration(rand.Intn(baseReconnectIntervalMs)) * time.Millisecond

	// Give precedence to environment to override everything else.
	cfg.ClientID = os.Getenv("MM_CLOUD_INSTALLATION_ID")
	if cfg.ClientID == "" {
		if license.IsCloud(m.ctx.API.GetLicense()) {
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
	// Otherwise we fetch the config from the k/v store.
	if cfg.AuthKey != "" {
		return cfg, nil
	}

	storedCfg, err := m.getStoredRTCDConfig()
	if err != nil {
		return cfg, fmt.Errorf("failed to get stored rtcd config: %w", err)
	}

	cfg.AuthKey = storedCfg.AuthKey

	if cfg.AuthKey == "" {
		m.ctx.LogDebug("auth key missing from rtcd config, generating a new one")
		cfg.AuthKey, err = random.NewSecureString(32)
		if err != nil {
			return cfg, fmt.Errorf("failed to generate auth key: %w", err)
		}
	}

	return cfg, nil
}

func (m *rtcdClientManager) storeConfig(cfg rtcd.ClientConfig) error {
	cfgData, err := json.Marshal(&cfg)
	if err != nil {
		return fmt.Errorf("failed to marshal rtcd client config: %w", err)
	}
	m.ctx.metrics.IncStoreOp("KVSet")
	if err := m.ctx.API.KVSet(rtcdConfigKey, cfgData); err != nil {
		return fmt.Errorf("failed to store rtcd client config: %w", err)
	}
	return nil
}

// registerRTCDClient attempts to register a new client.
// Returns a newly connected client on success.
func (m *rtcdClientManager) registerRTCDClient(cfg rtcd.ClientConfig, reconnectCb rtcd.ClientReconnectCb, dialFn rtcd.DialContextFn) (rtcd.ClientConfig, *rtcd.Client, error) {
	// Here we need some coordination to avoid multiple plugin instances to
	// register at the same time (at most one would succeed).
	mutex, err := cluster.NewMutex(m.ctx.API, m.ctx.metrics, "rtcd_registration", cluster.MutexConfig{})
	if err != nil {
		return cfg, nil, fmt.Errorf("failed to create cluster mutex: %w", err)
	}

	lockCtx, cancelCtx := context.WithTimeout(context.Background(), lockTimeout)
	defer cancelCtx()
	if err := mutex.Lock(lockCtx); err != nil {
		return cfg, nil, fmt.Errorf("failed to acquire cluster lock: %w", err)
	}
	defer mutex.Unlock()

	client, err := rtcd.NewClient(cfg, rtcd.WithClientReconnectCb(reconnectCb), rtcd.WithDialFunc(dialFn))
	if err != nil {
		return cfg, nil, fmt.Errorf("failed to create rtcd client: %w", err)
	}

	// If we are able to connect likely some other node registered for us.
	err = client.Connect()
	if err == nil {
		return cfg, client, nil
	}

	// If connecting fails we attempt to re-register once as the rtcd instance may
	// have restarted, potentially losing stored credentials.

	m.ctx.LogWarn(fmt.Sprintf("failed to connect rtcd client: %s", err.Error()))
	m.ctx.LogDebug("attempting to re-register the rtcd client")

	if err := client.Register(cfg.ClientID, cfg.AuthKey); err != nil {
		client.Close()
		return cfg, nil, fmt.Errorf("failed to register rtcd client: %w", err)
	}

	// TODO: guard against the "locked out" corner case that the server/plugin process exits
	// before being able to store the credentials but after a successful
	// registration.
	if err := m.storeConfig(cfg); err != nil {
		client.Close()
		return cfg, nil, err
	}

	m.ctx.LogDebug("rtcd client registered successfully", "clientID", cfg.ClientID)

	return cfg, client, client.Connect()
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
		us := m.ctx.getSessionByOriginalID(sessionID)
		if us != nil && atomic.CompareAndSwapInt32(&us.rtcClosed, 0, 1) {
			m.ctx.LogDebug("closing rtc close channel", "sessionID", sessionID)
			close(us.rtcCloseCh)
			return m.ctx.removeSession(us)
		}

		m.ctx.LogDebug("session not found or rtc conn already closed", "sessionID", sessionID)

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

		// TODO: this could be optimized a bit. The only reason we fetch
		// the call here is to find the respective channelID which is needed in
		// case the websocket event needs to be sent to the bot client.
		call, err := m.ctx.store.GetCall(rtcMsg.CallID, db.GetCallOpts{})
		if err != nil {
			return fmt.Errorf("failed to get call: %w", err)
		}

		// TODO: consider if it's worth fetching the unique userIDs list instead of
		// the whole sessions objects.
		sessions, err := m.ctx.store.GetCallSessions(rtcMsg.CallID, db.GetCallSessionOpts{})
		if err != nil {
			return fmt.Errorf("failed to get call sessions: %w", err)
		}

		m.ctx.publishWebSocketEvent(evType, map[string]interface{}{
			"userID":     rtcMsg.UserID,
			"session_id": rtcMsg.SessionID,
		}, &WebSocketBroadcast{ChannelID: call.ChannelID, UserIDs: getUserIDsFromSessions(sessions)})

		return nil
	}

	m.ctx.LogDebug("relaying ws message", "sessionID", rtcMsg.SessionID, "userID", rtcMsg.UserID)
	m.ctx.publishWebSocketEvent(wsEventSignal, map[string]interface{}{
		"data":   string(rtcMsg.Data),
		"connID": rtcMsg.SessionID,
	}, &WebSocketBroadcast{UserID: rtcMsg.UserID, ReliableClusterSend: true})

	return nil
}

func getDialFn(host, port string) rtcd.DialContextFn {
	return func(ctx context.Context, network, _ string) (net.Conn, error) {
		dialer := &net.Dialer{
			Timeout: dialingTimeout,
		}
		return dialer.DialContext(ctx, network, fmt.Sprintf("%s:%s", host, port))
	}
}

func (m *rtcdClientManager) clientReader(client *rtcd.Client) {
	for {
		select {
		case err, ok := <-client.ErrorCh():
			if !ok || err == nil {
				return
			}

			if errors.Is(err, errClientReplaced) {
				m.ctx.LogDebug(err.Error())
			} else if strings.Contains(err.Error(), "EOF") {
				m.ctx.LogWarn(err.Error())
			} else {
				m.ctx.LogError(err.Error())
			}
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

func (h *rtcdHost) isFlagged() bool {
	h.mut.RLock()
	defer h.mut.RUnlock()
	return h.flagged
}
