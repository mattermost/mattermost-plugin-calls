package simplehttp

import (
	"net"
	"net/http"
	"time"
)

type SimpleClient interface {
	Do(req *http.Request) (*http.Response, error)
}

// NewClient creates a SimpleClient intended for one-off requests, like getPushProxyVersion.
// If we end up needing something more long term, we should consider storing it.
func NewClient() (*http.Client, error) {
	dialFn := (&net.Dialer{
		Timeout:   5 * time.Second,
		KeepAlive: 30 * time.Second,
	}).DialContext

	transport := &http.Transport{
		Proxy:                 http.ProxyFromEnvironment,
		DialContext:           dialFn,
		MaxConnsPerHost:       10,
		MaxIdleConns:          10,
		MaxIdleConnsPerHost:   10,
		ResponseHeaderTimeout: 1 * time.Minute,
		IdleConnTimeout:       30 * time.Second,
		TLSHandshakeTimeout:   1 * time.Second,
		ExpectContinueTimeout: 1 * time.Second,
	}

	return &http.Client{Transport: transport}, nil
}
