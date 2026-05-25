# Fix for mattermost-plugin-calls issue #1143 — Docker IP 172.x leaking as ICE candidate

**Author:** Francesco Pernice Botta (`999purple999`)
**Branch:** `fix/1143-warn-rfc1918-docker-ice`
**Issue:** [mattermost/mattermost-plugin-calls#1143](https://github.com/mattermost/mattermost-plugin-calls/issues/1143)
**Touched files:**
- `server/ice_diagnostics.go` (new, 110 lines)
- `server/ice_diagnostics_test.go` (new, 3 tests)
- `server/activate.go` (4-line wire-up)

---

## Scope and honest framing

The actual ICE candidate gathering happens in [`mattermost/rtcd/service/rtc`](https://github.com/mattermost/rtcd) (`rtc.NewServer`), which is a different upstream repo. A proper fix that *suppresses* RFC1918 candidates by default belongs there.

This PR addresses the part that is visible from the plugin layer: a **loud, actionable startup diagnostic** that tells the operator their setup is the misconfiguration shape that produces #1143, **before** the first call drops. It is intentionally non-behaviour-changing — a legitimate LAN-only Docker setup still works exactly as before.

The proper rtcd-side fix is a follow-up I'm happy to send as a second PR.

---

## The bug shape (from #1143)

> When using Mattermost Calls with a self-hosted TURN server, calls initially
> connect successfully but drop after some time. The TURN server logs show
> internal Docker network IPs (172.21.0.3) being used as peers, leading to
> 403 Forbidden IP errors and allocation timeout.

User configuration excerpt:
```json
"icehostoverride": "",
"serversideturn": true,
"iceserversconfigs": "[{\"urls\":[\"turn:{Public IP}:3478\"...]"
```

The plugin runs inside Docker on `172.21.0.0/16`. With `ICEHostOverride` empty, the embedded RTC server enumerates local interfaces, finds `172.21.0.3`, and advertises it as an ICE host candidate. coturn rejects that peer with 403 because it's not in its allowed-peer set, and the call eventually dies on allocation timeout.

The operator currently has zero feedback that this is what's happening: the call connects, media flows for a while, and only later silently drops. They are left grepping coturn logs to diagnose a configuration setting they didn't know about.

---

## The fix

A new file `server/ice_diagnostics.go` adds three small pieces:

1. **`isPrivateIP(ip)`** — returns true for RFC1918 (10/8, 172.16/12, 192.168/16), RFC6598 carrier-grade NAT (100.64/10), IPv6 ULA (fc00::/7), loopback, and link-local. The exact set of address families that are *unreachable from the public internet* and therefore not safe to advertise to a remote ICE peer.

2. **`listRoutableHostIPs()`** — enumerates non-loopback unicast addresses on the host's interfaces and splits them into routable vs private. No external deps; pure `net.Interfaces()`.

3. **`detectInsideContainer()`** — checks `/.dockerenv` AND `/proc/1/cgroup` for `docker` / `containerd` / `kubepods`. Covers Docker, containerd, and Kubernetes pod environments. Returns false on host installations.

`(*Plugin).checkICEDockerMisconfiguration(iceHostOverride)` composes these. It logs **one** `LogError` line, only if **all** of these are true:

- `ICEHostOverride` is empty
- Process is inside a container
- No routable (public) IPs are bound to any interface
- At least one private IP is bound

In every other case the function returns silently. The message names the offending IPs and tells the operator exactly which setting to change:

> Calls is running inside a container with only private (RFC1918/RFC6598) IP addresses available and ICEHostOverride is empty. ICE host candidates advertised to clients will be unreachable from outside the container, which typically manifests as the call dropping after connecting (issue #1143). Set the ICEHostOverride plugin setting to the public IP (or DNS name) that clients use to reach this host.

The wire-up in `activate.go` is one line, placed before either the RTCD-client or embedded-RTC branch is chosen, so it covers both deployment modes:

```go
// One-shot diagnostic: warn the operator if we're about to advertise only
// private ICE host candidates from inside a container with no override
// configured. Pre-flight check, no behavioural change. See issue #1143.
p.checkICEDockerMisconfiguration(cfg.ICEHostOverride)
```

---

## Why a diagnostic rather than a behaviour change

- A LAN-only deployment where every participant is on the same Docker network is a legitimate setup (HALCYON ships this exact topology). Silently dropping RFC1918 candidates would break that.
- The plugin alone cannot fix what `rtcd` advertises — it only passes config through. A real candidate filter belongs in `rtcd`.
- A loud LogError costs nothing and saves the operator hours of log-grepping when they hit the misconfiguration shape this issue describes.
- I'm happy to send the rtcd-side patch as a follow-up if you want to discuss the design first (a `ICEDisableHostRFC1918` knob, or auto-detect on by default with an opt-out).

---

## Tests

```
go test ./server -run 'TestIsPrivateIP|TestIsPrivateIPNil|TestRFC1918NetworksParsed' -v
```

`TestIsPrivateIP` exercises the predicate against 13 representative addresses — the four major Docker / RFC1918 ranges, RFC6598 (100.64/10) which is also commonly leaked, IPv6 ULA, loopback, link-local, and several public examples just outside the boundaries (172.15/8 must NOT be flagged; 172.16/12 must). `TestIsPrivateIPNil` documents that `nil` is treated as private (a refuse-to-advertise default). `TestRFC1918NetworksParsed` is a sanity check that the package-level CIDR slice parsed correctly.

I have NOT exercised `detectInsideContainer` or `checkICEDockerMisconfiguration` end-to-end because both reach out to the filesystem / live network interfaces and resist clean unit tests without a fake-filesystem indirection. I can add an interface-and-fake test if you want it for merge — let me know.

---

## How to verify locally

```bash
git clone -b fix/1143-warn-rfc1918-docker-ice <your-fork>
cd mattermost-plugin-calls
make deploy   # standard plugin build
# In a Docker-deployed Mattermost with calls plugin: start the server, watch
# the plugin logs. With ICEHostOverride empty and the host only on 172.x,
# you'll see the new LogError line once at activate.
```

---

## Push instructions (run when ready)

```bash
cd workrepo/mattermost-plugin-calls
gh repo fork mattermost/mattermost-plugin-calls --clone=false --remote=true
git push -u origin fix/1143-warn-rfc1918-docker-ice
gh pr create \
  --base main \
  --repo mattermost/mattermost-plugin-calls \
  --title "Diagnostic: warn when Calls runs in a container with only RFC1918 IPs and no ICEHostOverride (#1143)" \
  --body "$(cat FIX_ISSUE_1143_README.md)"
```

---

## Trade-offs and open questions

- **Why not a refusal-to-start?** Would break legitimate LAN-only deployments.
- **Why log once, not on every call?** Activation-time is sufficient: configuration is static; one loud line at startup is the right cadence.
- **Should we surface this in `/diagnostics`?** Probably yes — happy to add it as a second commit on this branch if you'd like.
- **Should we PR `mattermost/rtcd` too?** Yes — the candidate-filter knob belongs there. Separate PR, separate review.
