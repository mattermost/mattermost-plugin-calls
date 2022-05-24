package main

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestGetHostForNewCall(t *testing.T) {
	t.Run("no host available", func(t *testing.T) {
		m := &rtcdClientManager{
			hosts: map[string]*rtcdHost{},
		}
		host, err := m.GetHostForNewCall()
		require.Error(t, err)
		require.EqualError(t, err, "no host available")
		require.Empty(t, host)
	})

	t.Run("all flagged", func(t *testing.T) {
		m := &rtcdClientManager{
			hosts: map[string]*rtcdHost{
				"127.0.0.1": {
					ip:           "127.0.0.1",
					callsCounter: 10,
					flagged:      true,
				},
				"127.0.0.2": {
					ip:           "127.0.0.2",
					callsCounter: 1,
					flagged:      true,
				},
				"127.0.0.3": {
					ip:           "127.0.0.3",
					callsCounter: 5,
					flagged:      true,
				},
			},
		}

		host, err := m.GetHostForNewCall()
		require.Error(t, err)
		require.EqualError(t, err, "no host available")
		require.Empty(t, host)
	})

	t.Run("none flagged", func(t *testing.T) {
		m := &rtcdClientManager{
			hosts: map[string]*rtcdHost{
				"127.0.0.1": {
					ip:           "127.0.0.1",
					callsCounter: 10,
				},
				"127.0.0.2": {
					ip:           "127.0.0.2",
					callsCounter: 9,
				},
				"127.0.0.3": {
					ip:           "127.0.0.3",
					callsCounter: 11,
				},
			},
		}

		host, err := m.GetHostForNewCall()
		require.NoError(t, err)
		require.Equal(t, "127.0.0.2", host)
		require.Equal(t, uint64(10), m.hosts[host].callsCounter)
	})

	t.Run("non-flagged host with minimum calls counter", func(t *testing.T) {
		m := &rtcdClientManager{
			hosts: map[string]*rtcdHost{
				"127.0.0.1": {
					ip:           "127.0.0.1",
					callsCounter: 10,
					flagged:      false,
				},
				"127.0.0.2": {
					ip:           "127.0.0.2",
					callsCounter: 1,
					flagged:      true,
				},
				"127.0.0.3": {
					ip:           "127.0.0.3",
					callsCounter: 5,
					flagged:      false,
				},
				"127.0.0.4": {
					ip:           "127.0.0.4",
					callsCounter: 15,
					flagged:      false,
				},
			},
		}

		host, err := m.GetHostForNewCall()
		require.NoError(t, err)
		require.Equal(t, "127.0.0.3", host)
		require.Equal(t, uint64(6), m.hosts[host].callsCounter)
	})

	t.Run("load balancing", func(t *testing.T) {
		m := &rtcdClientManager{
			hosts: map[string]*rtcdHost{
				"127.0.0.1": {
					ip:           "127.0.0.1",
					callsCounter: 0,
					flagged:      false,
				},
				"127.0.0.2": {
					ip:           "127.0.0.2",
					callsCounter: 0,
					flagged:      false,
				},
				"127.0.0.3": {
					ip:           "127.0.0.2",
					callsCounter: 0,
					flagged:      false,
				},
			},
		}

		for i := 0; i < 99; i++ {
			_, err := m.GetHostForNewCall()
			require.NoError(t, err)
		}

		for _, host := range m.hosts {
			require.Equal(t, uint64(33), host.callsCounter)
		}
	})

	t.Run("load balancing - one flagged", func(t *testing.T) {
		m := &rtcdClientManager{
			hosts: map[string]*rtcdHost{
				"127.0.0.1": {
					ip:           "127.0.0.1",
					callsCounter: 0,
					flagged:      true,
				},
				"127.0.0.2": {
					ip:           "127.0.0.2",
					callsCounter: 0,
					flagged:      false,
				},
			},
		}

		for i := 0; i < 100; i++ {
			_, err := m.GetHostForNewCall()
			require.NoError(t, err)
		}

		require.Equal(t, uint64(100), m.hosts["127.0.0.2"].callsCounter)
		require.Equal(t, uint64(0), m.hosts["127.0.0.1"].callsCounter)
	})
}

func TestResolveURL(t *testing.T) {
	ips, port, err := resolveURL("https://localhost:8045", time.Second)
	require.NoError(t, err)
	require.NotEmpty(t, ips)
	require.Equal(t, "127.0.0.1", ips[0].String())
	require.Equal(t, "8045", port)

	ips, port, err = resolveURL("http://127.0.0.1:8055", time.Second)
	require.NoError(t, err)
	require.NotEmpty(t, ips)
	require.Equal(t, "127.0.0.1", ips[0].String())
	require.Equal(t, "8055", port)
}
