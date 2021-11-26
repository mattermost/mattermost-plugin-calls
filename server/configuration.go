package main

import (
	"errors"
	"fmt"
	"reflect"
	"strconv"
	"strings"

	"github.com/mattermost/mattermost-server/v6/model"
)

// configuration captures the plugin's external configuration as exposed in the Mattermost server
// configuration, as well as values computed from the configuration. Any public fields will be
// deserialized from the Mattermost server configuration in OnConfigurationChange.
//
// As plugins are inherently concurrent (hooks being called asynchronously), and the plugin
// configuration can change at any time, access to the configuration must be synchronized. The
// strategy used in this plugin is to guard a pointer to the configuration, and clone the entire
// struct whenever it changes. You may replace this with whatever strategy you choose.
//
// If you add non-reference types to your configuration struct, be sure to rewrite Clone as a deep
// copy appropriate for your types.
type configuration struct {
	// UDP port used by the RTC server to listen to.
	UDPServerPort *int
	clientConfig
}

type clientConfig struct {
	// When set to true, it allows channel admins to enable calls in their channels.
	// It also allows participants of DMs/GMs to enable calls.
	AllowEnableCalls *bool
}

type PortsRange string

func (pr PortsRange) MinPort() uint16 {
	parts := strings.Split(string(pr), "-")
	if len(parts) != 2 {
		return 0
	}
	val, err := strconv.Atoi(parts[0])
	if err != nil || val < 0 || val > 65536 {
		return 0
	}
	return uint16(val)
}

func (pr PortsRange) MaxPort() uint16 {
	parts := strings.Split(string(pr), "-")
	if len(parts) != 2 {
		return 0
	}
	val, err := strconv.Atoi(parts[1])
	if err != nil || val < 0 || val > 65536 {
		return 0
	}
	return uint16(val)
}

func (pr PortsRange) IsValid() error {
	if pr == "" {
		return errors.New("invalid empty input")
	}
	minPort := pr.MinPort()
	maxPort := pr.MaxPort()
	if minPort == 0 || maxPort == 0 {
		return errors.New("port range is not valid")
	}
	if minPort >= maxPort {
		return errors.New("min port must be less than max port")
	}
	return nil
}

func (c *configuration) getClientConfig() clientConfig {
	return clientConfig{
		AllowEnableCalls: model.NewBool(*c.AllowEnableCalls),
	}
}

func (c *configuration) SetDefaults() {
	if c.UDPServerPort == nil {
		c.UDPServerPort = model.NewInt(8443)
	}
	if c.AllowEnableCalls == nil {
		c.AllowEnableCalls = new(bool)
	}
}

func (c *configuration) IsValid() error {
	if c.UDPServerPort == nil {
		return fmt.Errorf("UDPServerPort should not be nil")
	}

	if *c.UDPServerPort < 1024 || *c.UDPServerPort > 49151 {
		return fmt.Errorf("UDPServerPort is not valid: %d is not in allowed range [1024, 49151]", *c.UDPServerPort)
	}

	return nil
}

// Clone copies the configuration.
func (c *configuration) Clone() *configuration {
	var cfg configuration

	if c.UDPServerPort != nil {
		cfg.UDPServerPort = new(int)
		*cfg.UDPServerPort = *c.UDPServerPort
	}

	if c.AllowEnableCalls != nil {
		cfg.AllowEnableCalls = model.NewBool(*c.AllowEnableCalls)
	}

	return &cfg
}

func (p *Plugin) setConfigDefaults() {
	p.configurationLock.Lock()
	defer p.configurationLock.Unlock()
	if p.configuration == nil {
		p.configuration = new(configuration)
	}
	p.configuration.SetDefaults()
}

// getConfiguration retrieves the active configuration under lock, making it safe to use
// concurrently. The active configuration may change underneath the client of this method, but
// the struct returned by this API call is considered immutable.
func (p *Plugin) getConfiguration() *configuration {
	p.configurationLock.RLock()
	defer p.configurationLock.RUnlock()

	if p.configuration == nil {
		return &configuration{}
	}

	return p.configuration
}

// setConfiguration replaces the active configuration under lock.
//
// Do not call setConfiguration while holding the configurationLock, as sync.Mutex is not
// reentrant. In particular, avoid using the plugin API entirely, as this may in turn trigger a
// hook back into the plugin. If that hook attempts to acquire this lock, a deadlock may occur.
//
// This method panics if setConfiguration is called with the existing configuration. This almost
// certainly means that the configuration was modified without being cloned and may result in
// an unsafe access.
func (p *Plugin) setConfiguration(configuration *configuration) error {
	p.configurationLock.Lock()
	defer p.configurationLock.Unlock()

	if configuration != nil && p.configuration == configuration {
		// Ignore assignment if the configuration struct is empty. Go will optimize the
		// allocation for same to point at the same memory address, breaking the check
		// above.
		if reflect.ValueOf(*configuration).NumField() == 0 {
			return nil
		}

		return errors.New("setConfiguration called with the existing configuration")
	}

	if err := configuration.IsValid(); err != nil {
		return fmt.Errorf("setConfiguration: configuration is not valid: %w", err)
	}

	p.configuration = configuration

	return nil
}

// OnConfigurationChange is invoked when configuration changes may have been made.
func (p *Plugin) OnConfigurationChange() error {
	var configuration = new(configuration)

	// Load the public configuration fields from the Mattermost server configuration.
	if err := p.API.LoadPluginConfiguration(configuration); err != nil {
		return fmt.Errorf("OnConfigurationChange: failed to load plugin configuration: %w", err)
	}

	return p.setConfiguration(configuration)
}
