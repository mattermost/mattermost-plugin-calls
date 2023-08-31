package cluster

import (
	"context"
	"fmt"
	"math/rand"
	"sync"
	"time"

	"github.com/mattermost/mattermost/server/public/model"
)

const (
	// mutexPrefix is used to namespace key values created for a mutex from other key values
	// created by a plugin.
	mutexPrefix = "mutex_"
)

const (
	defaultTTL             = 10 * time.Second
	defaultRefreshInterval = defaultTTL / 2
	defaultPollInterval    = 500 * time.Millisecond
	maxPollInterval        = 1 * time.Second
)

// MutexPluginAPI is the plugin API interface required to manage mutexes.
type MutexPluginAPI interface {
	KVSetWithOptions(key string, value []byte, options model.PluginKVSetOptions) (bool, *model.AppError)
	KVDelete(key string) *model.AppError
	LogError(msg string, keyValuePairs ...interface{})
	LogWarn(msg string, keyValuePairs ...interface{})
	LogDebug(msg string, keyValuePairs ...interface{})
}

// MutexMetricsAPI is an interface to manage cluster mutex metrics.
type MutexMetricsAPI interface {
	ObserveClusterMutexGrabTime(key string, elapsed float64)
	ObserveClusterMutexLockedTime(key string, elapsed float64)
	IncClusterMutexLockRetries(group string)
}

// Mutex is similar to sync.Mutex, except usable by multiple plugin instances across a cluster.
//
// Internally, a mutex relies on an atomic key-value set operation as exposed by the Mattermost
// plugin API.
//
// Mutexes with different names are unrelated. Mutexes with the same name from different plugins
// are unrelated. Pick a unique name for each mutex your plugin requires.
//
// A Mutex must not be copied after first use.
type Mutex struct {
	pluginAPI  MutexPluginAPI
	metricsAPI MutexMetricsAPI

	key    string
	config MutexConfig

	stopCh       chan struct{}
	doneCh       chan struct{}
	lastLockedAt time.Time
	mut          sync.Mutex
}

type MutexConfig struct {
	// TTL is the interval after which a locked mutex will expire unless
	// refreshed.
	TTL time.Duration
	// RefreshInterval is the interval on which the mutex will be refreshed when
	// locked.
	RefreshInterval time.Duration
	// PollInterval is the interval to wait between locking attempts.
	PollInterval time.Duration
	// MetricsGroup is an optional group name to use for mutex related metrics.
	MetricsGroup string
}

func (c *MutexConfig) SetDefaults() {
	if c.TTL == 0 {
		c.TTL = defaultTTL
	}

	if c.RefreshInterval == 0 {
		c.RefreshInterval = defaultRefreshInterval
	}

	if c.PollInterval == 0 {
		c.PollInterval = defaultPollInterval
	}
}

func (c *MutexConfig) IsValid() error {
	if c.TTL <= 0 {
		return fmt.Errorf("TTL should be positive")
	}

	if c.RefreshInterval <= 0 {
		return fmt.Errorf("RefreshInterval should be positive")
	}

	if c.PollInterval <= 0 {
		return fmt.Errorf("PollInterval should be positive")
	} else if c.PollInterval > maxPollInterval {
		return fmt.Errorf("PollInterval should not be higher than %s", maxPollInterval)
	}

	if c.RefreshInterval > (c.TTL / 2) {
		return fmt.Errorf("RefreshInterval should not be higher than half the TTL")
	}

	return nil
}

// NewMutex creates a mutex with the given key name.
func NewMutex(pluginAPI MutexPluginAPI, metricsAPI MutexMetricsAPI, key string, cfg MutexConfig) (*Mutex, error) {
	if key == "" {
		return nil, fmt.Errorf("key should not be empty")
	}

	cfg.SetDefaults()
	if err := cfg.IsValid(); err != nil {
		return nil, err
	}

	return &Mutex{
		pluginAPI:  pluginAPI,
		metricsAPI: metricsAPI,
		key:        mutexPrefix + key,
		config:     cfg,
	}, nil
}

// tryLock makes a single attempt to atomically lock the mutex, returning true only if successful.
func (m *Mutex) tryLock() (bool, error) {
	ok, err := m.pluginAPI.KVSetWithOptions(m.key, []byte{1}, model.PluginKVSetOptions{
		Atomic:          true,
		OldValue:        nil, // No existing key value.
		ExpireInSeconds: int64(m.config.TTL / time.Second),
	})
	if err != nil {
		return false, fmt.Errorf("failed to set mutex kv: %w", err)
	}

	return ok, nil
}

// refreshLock rewrites the lock key value with a new expiry, returning true only if successful.
func (m *Mutex) refreshLock() error {
	ok, err := m.pluginAPI.KVSetWithOptions(m.key, []byte{1}, model.PluginKVSetOptions{
		Atomic:          true,
		OldValue:        []byte{1},
		ExpireInSeconds: int64(m.config.TTL / time.Second),
	})
	if err != nil {
		return fmt.Errorf("failed to refresh mutex kv: %w", err)
	} else if !ok {
		return fmt.Errorf("unexpectedly failed to refresh mutex kv")
	}

	return nil
}

// Lock locks m unless the context is canceled. If the mutex is already locked by any plugin
// instance, including the current one, the calling goroutine blocks until the mutex can be locked,
// or the context is canceled.
//
// The mutex is locked only if a nil error is returned.
func (m *Mutex) Lock(ctx context.Context) error {
	// We lock to synchronize access from a single process.
	// This avoids having to hit the database in case of concurrent access to
	// a shared mutex from the same plugin instance.
	start := time.Now()
	m.mut.Lock()

	var nRetries int

	for {
		locked, err := m.tryLock()
		if err != nil {
			m.pluginAPI.LogError("failed to lock mutex", "err", err, "lock_key", m.key)
		}

		if locked {
			m.lastLockedAt = time.Now()

			m.metricsAPI.ObserveClusterMutexGrabTime(m.getMetricsGroup(), time.Since(start).Seconds())

			m.stopCh = make(chan struct{})
			m.doneCh = make(chan struct{})

			go func() {
				defer close(m.doneCh)
				t := time.NewTicker(m.config.RefreshInterval)
				for {
					select {
					case <-t.C:
						if err := m.refreshLock(); err != nil {
							m.pluginAPI.LogError("failed to refresh mutex", "err", err, "lock_key", m.key)
							return
						}
					case <-m.stopCh:
						return
					}
				}
			}()

			return nil
		}

		m.metricsAPI.IncClusterMutexLockRetries(m.getMetricsGroup())
		nRetries++

		pollTime := m.config.PollInterval * time.Duration(nRetries)
		if pollTime > maxPollInterval {
			pollTime = maxPollInterval
		}
		jitter := time.Duration(rand.Int63n(pollTime.Nanoseconds()))

		select {
		case <-ctx.Done():
			m.mut.Unlock()
			return ctx.Err()
		case <-time.After(pollTime + jitter):
		}
	}
}

// Unlock unlocks m.
func (m *Mutex) Unlock() {
	defer m.mut.Unlock()

	if m.mut.TryLock() {
		// We allow unlocking a mutex multiple times and log a simple warning
		// since it's generally safe and can simplify some complex flows that
		// would require extra checks otherwise.
		m.pluginAPI.LogWarn("unlock of unlocked mutex", "key", m.key)
		return
	}

	close(m.stopCh)
	<-m.doneCh
	m.stopCh = nil
	m.doneCh = nil

	// If an error occurs deleting, the mutex kv will still expire, allowing later retry.
	if err := m.pluginAPI.KVDelete(m.key); err != nil {
		m.pluginAPI.LogError("failed to delete mutex key", "err", err.Error())
	}

	m.metricsAPI.ObserveClusterMutexLockedTime(m.getMetricsGroup(), time.Since(m.lastLockedAt).Seconds())
}

func (m *Mutex) getMetricsGroup() string {
	if m.config.MetricsGroup != "" {
		return m.config.MetricsGroup
	}

	return m.key
}
