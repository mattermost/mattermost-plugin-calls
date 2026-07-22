// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"net"
	"testing"
)

func TestIsPrivateIP(t *testing.T) {
	cases := []struct {
		ip   string
		want bool
	}{
		// Docker bridge / standard RFC1918 — must be flagged.
		{"172.21.0.3", true},
		{"172.17.0.1", true},
		{"10.0.0.5", true},
		{"192.168.1.1", true},
		// RFC6598 carrier-grade NAT — also unreachable from public.
		{"100.64.1.2", true},
		// IPv6 ULA.
		{"fd00::1", true},
		// Loopback / link-local — always treated as private.
		{"127.0.0.1", true},
		{"169.254.1.1", true},
		{"::1", true},
		// Public IPs — must not be flagged.
		{"8.8.8.8", false},
		{"1.1.1.1", false},
		{"172.15.0.1", false}, // just outside 172.16/12
		{"192.167.255.1", false},
		{"2606:4700:4700::1111", false},
	}
	for _, c := range cases {
		ip := net.ParseIP(c.ip)
		if got := isPrivateIP(ip); got != c.want {
			t.Errorf("isPrivateIP(%q) = %v, want %v", c.ip, got, c.want)
		}
	}
}

func TestIsPrivateIPNil(t *testing.T) {
	if !isPrivateIP(nil) {
		t.Errorf("isPrivateIP(nil) should be treated as private (refuse to advertise)")
	}
}

func TestRFC1918NetworksParsed(t *testing.T) {
	// Sanity: every CIDR in the package-level slice parsed.
	if len(rfc1918Networks) == 0 {
		t.Fatal("rfc1918Networks is empty — CIDR parse must have failed")
	}
	wantCount := 5 // 10/8, 172.16/12, 192.168/16, 100.64/10, fc00::/7
	if len(rfc1918Networks) != wantCount {
		t.Errorf("rfc1918Networks len = %d, want %d", len(rfc1918Networks), wantCount)
	}
}
