package main

import (
	"sync"
)

type call struct {
	mut           sync.RWMutex
	channelID     string
	sessions      map[string]*session
	screenSession *session
}

func (p *Plugin) getCall(channelID string) *call {
	p.mut.RLock()
	defer p.mut.RUnlock()
	return p.calls[channelID]
}

func (c *call) getScreenSession() *session {
	c.mut.RLock()
	defer c.mut.RUnlock()
	return c.screenSession
}

func (c *call) setScreenSession(s *session) {
	c.mut.Lock()
	defer c.mut.Unlock()
	c.screenSession = s
}
