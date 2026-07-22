// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"net"
	"os"
	"strings"
)

// rfc1918Networks is the set of address ranges that hosts running inside a
// container or behind a NAT typically bind to. If the plugin advertises one of
// these as an ICE host candidate while running inside a container and with no
// `ICEHostOverride` set, clients outside the container cannot route media to
// it — see issue #1143.
var rfc1918Networks = func() []*net.IPNet {
	cidrs := []string{
		"10.0.0.0/8",
		"172.16.0.0/12",
		"192.168.0.0/16",
		"100.64.0.0/10", // RFC 6598 CGNAT — also unreachable from the public side
		"fc00::/7",       // IPv6 ULA
	}
	out := make([]*net.IPNet, 0, len(cidrs))
	for _, c := range cidrs {
		_, n, err := net.ParseCIDR(c)
		if err == nil {
			out = append(out, n)
		}
	}
	return out
}()

// isPrivateIP reports whether ip is unreachable from the public internet.
func isPrivateIP(ip net.IP) bool {
	if ip == nil || ip.IsLoopback() || ip.IsLinkLocalUnicast() || ip.IsMulticast() {
		return true
	}
	for _, n := range rfc1918Networks {
		if n.Contains(ip) {
			return true
		}
	}
	return false
}

// listRoutableHostIPs returns the unicast IPv4/IPv6 addresses bound to local
// interfaces, excluding loopback and link-local. The slice is empty if every
// detected address is private. (Caller decides what to do with that fact.)
func listRoutableHostIPs() (routable []string, private []string) {
	ifaces, err := net.Interfaces()
	if err != nil {
		return nil, nil
	}
	for _, iface := range ifaces {
		if iface.Flags&net.FlagUp == 0 || iface.Flags&net.FlagLoopback != 0 {
			continue
		}
		addrs, err := iface.Addrs()
		if err != nil {
			continue
		}
		for _, addr := range addrs {
			var ip net.IP
			switch v := addr.(type) {
			case *net.IPNet:
				ip = v.IP
			case *net.IPAddr:
				ip = v.IP
			}
			if ip == nil || ip.IsLoopback() || ip.IsLinkLocalUnicast() {
				continue
			}
			if isPrivateIP(ip) {
				private = append(private, ip.String())
			} else {
				routable = append(routable, ip.String())
			}
		}
	}
	return routable, private
}

// detectInsideContainer returns true when the process appears to be running
// inside a Docker / containerd / podman container. Uses both the canonical
// `/.dockerenv` marker file and a cgroup-string check so it also catches
// recent containerd-only setups that don't ship the Docker marker.
func detectInsideContainer() bool {
	if _, err := os.Stat("/.dockerenv"); err == nil {
		return true
	}
	if data, err := os.ReadFile("/proc/1/cgroup"); err == nil {
		s := string(data)
		if strings.Contains(s, "docker") || strings.Contains(s, "containerd") || strings.Contains(s, "kubepods") {
			return true
		}
	}
	// /proc/self/mountinfo also shows overlayfs in containers, but the two
	// checks above are sufficient for the misconfiguration we want to flag.
	return false
}

// checkICEDockerMisconfiguration emits a loud LogError when the plugin is
// about to advertise only private/RFC1918 ICE host candidates from inside a
// container and the administrator has not set `ICEHostOverride`. This is the
// shape of the failure reported in issue #1143: coturn observes peer
// 172.21.0.3 (a Docker bridge address), rejects it with "403 Forbidden IP",
// and the call drops.
//
// We intentionally do NOT refuse to start: a LAN-only deployment where every
// participant is on the same Docker network is a legitimate setup. The check
// is purely diagnostic and gives the operator one actionable line of guidance
// in the logs.
func (p *Plugin) checkICEDockerMisconfiguration(iceHostOverride string) {
	if strings.TrimSpace(iceHostOverride) != "" {
		return
	}
	inContainer := detectInsideContainer()
	if !inContainer {
		return
	}
	routable, private := listRoutableHostIPs()
	if len(routable) > 0 {
		// We have at least one public-routable IP; ICE gathering will pick it
		// up by default. Nothing to warn about.
		return
	}
	if len(private) == 0 {
		return
	}
	p.LogError(
		"Calls is running inside a container with only private (RFC1918/RFC6598) "+
			"IP addresses available and ICEHostOverride is empty. ICE host "+
			"candidates advertised to clients will be unreachable from outside "+
			"the container, which typically manifests as the call dropping after "+
			"connecting (issue #1143). Set the ICEHostOverride plugin setting "+
			"to the public IP (or DNS name) that clients use to reach this host.",
		"private_interface_ips", strings.Join(private, ","),
	)
}
