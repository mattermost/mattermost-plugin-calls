# Calls v2: Docker Compose deployment (single host)

Runs LiveKit and a TLS proxy (Caddy) on one Linux host, for use with the Mattermost Calls v2 plugin. Optionally adds a SIP bridge (and the Redis it needs) for outbound phone dialing.

Status legend: **[validated]** was run end to end on AWS; **[untested]** is written but not yet run.

## Prerequisites

- A Linux host with a public IP address (tested: Ubuntu 24.04, 4 vCPU / 8 GB). Docker Engine with the Compose plugin.
- A DNS name for LiveKit (for example `lk.example.com`) with an **A record pointing at the host's public IP**. Create it before starting the stack: Caddy requests its certificate on first start.
- A Mattermost server running the Calls v2 plugin, reachable over HTTPS from the LiveKit host (LiveKit posts call events to it), and system admin access to it.
- Firewall / security group rules for the host:

  | Port | Protocol | Purpose |
  |---|---|---|
  | 443 | TCP | LiveKit signaling over TLS, certificate issuance |
  | 80 | TCP | Optional. Fallback certificate challenge and HTTP redirect |
  | 7881 | TCP | Media over TCP (fallback when UDP is blocked) |
  | 7882 | UDP | Media over UDP (preferred) |
  | 10000-10100 | UDP | Only if the SIP bridge is enabled (RTP media) |
  | 5060 | UDP | Only for inbound SIP; not needed for outbound dialing |

  Clients connect to the media ports directly, so they must be reachable from the internet (or from your users' networks). TURN is not required; see [External TURN](#external-turn-for-restrictive-firewalls-optional) for users behind restrictive firewalls.

## 1. Install Docker **[validated]**

On Ubuntu, from Docker's apt repository:

```bash
sudo apt-get update && sudo apt-get install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" | sudo tee /etc/apt/sources.list.d/docker.list
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
sudo usermod -aG docker "$USER"   # log out and back in to apply
```

## 2. Get the files **[validated]**

Copy `docker-compose.yaml`, `Caddyfile` and `setup.sh` from this directory to the host, for example into `~/livekit`.

## 3. Generate configuration **[validated]**

```bash
cd ~/livekit
./setup.sh lk.example.com https://mattermost.example.com
```

This writes `.env`, `livekit.yaml` and `sip.yaml` (mode 600) with a randomly generated API secret, and prints the plugin settings. Re-running keeps the existing secret. To rotate it, delete `livekit.yaml` first and update the plugin.

Pass `--sip` as a third argument to also enable the SIP bridge and Redis (see [SIP outbound](#sip-outbound-optional)). Without it, LiveKit runs standalone and Redis is not started.

## 4. Start the stack **[validated]**

```bash
docker compose up -d
docker compose ps          # livekit and caddy should be running
docker compose logs caddy | grep "certificate obtained"
curl https://lk.example.com/   # prints: OK
```

The first start pulls images and obtains a Let's Encrypt certificate (a few seconds once DNS resolves). LiveKit discovers its public IP via STUN (`use_external_ip: true`), so no node IP needs to be configured.

## 5. Configure the Calls plugin **[validated]**

In System Console > Plugins > Calls, set:

| Setting | Value |
|---|---|
| LiveKit URL | `wss://lk.example.com` |
| LiveKit API key | `calls-plugin` |
| LiveKit API secret | the value under `keys:` in `livekit.yaml` |

Leave LiveKit Private URL empty unless the Mattermost server must reach LiveKit by a different address than clients do (for example an internal URL).

## 6. Verify

**[validated: audio, screen share, reactions, TCP fallback and a second network. Audio, screen share and reactions with two users were also confirmed by an independent run of these instructions. Recording and upgrades are untested.]**

1. Start a call in a channel and join from a client outside the host's network. **[validated: audio, two users]**
2. Confirm LiveKit saw the room and delivered webhooks:
   ```bash
   docker compose logs livekit | grep -E "room_started|participant_joined|sent webhook"
   ```
   There should be no webhook errors. **[validated]**
3. Share a screen from one participant and confirm the other sees it. **[validated]**
4. A participant on a different network from the first (tested with a laptop on a phone hotspot). **[validated: audio and screen share, UDP direct]**
5. UDP blocked (remove the `7882/udp` rule), start a fresh call, and confirm both participants connect with a `tcp4 ... :7881` selected candidate in the LiveKit logs. **[validated: two users, audio]**

For steps 4 and 5, the LiveKit log shows each participant's selected candidates. It abbreviates addresses (for example `198.51.100....`). To print just the selected candidates:

```bash
docker compose logs livekit | grep 'participant active' | grep -oE '\[(local|remote)\]\[selected:1\][^"]*'
```

## SIP outbound (optional)

**[validated: managed trunk and an outbound call to a phone with two-way audio, including an independent run of these instructions]**

SIP outbound lets users dial phone numbers from a call. It adds the SIP bridge and a Redis instance, and puts LiveKit into distributed mode, which requires Redis.

1. Open `10000-10100/udp` on the host firewall (RTP media, both directions). Outbound-only dialing does not need 5060 open to the internet. Limit the range to your SIP provider's addresses if they publish them.
2. Regenerate the config with SIP enabled and **recreate** the containers. Do this, and confirm Redis is running, **before** you enable SIP outbound in the plugin (step 3):
   ```bash
   ./setup.sh lk.example.com https://mattermost.example.com --sip
   docker compose up -d --force-recreate
   ```
   `--sip` writes the Redis block into `livekit.yaml` and sets `COMPOSE_PROFILES=sip` in `.env`, so Redis and `livekit-sip` start with the normal command. LiveKit reads `livekit.yaml` only at startup and Compose does not notice file changes, so `--force-recreate` (or `docker compose restart livekit`) is required. Without it LiveKit keeps running without Redis and SIP trunk calls fail with `sip not connected (redis required)`. Re-running `setup.sh` without `--sip` turns SIP back off (recreate again).
3. In the Calls plugin settings (System Console > Plugins > Calls > SIP Outbound), enable outbound phone dialing, set the trunk mode to **managed**, and enter your provider's trunk address, caller ID number, and credentials. The plugin creates the trunk in LiveKit; the status should show `ready` with a trunk ID.
   - The plugin tries to create the trunk when a SIP setting changes or the plugin starts, not on every Save. If the status shows an error (for example `sip not connected (redis required)` because Redis was not running yet), fix the cause, then trigger a new attempt by turning **Enable outbound phone dialing** off and on again, saving each time. In testing, plain re-saves did not retry and the System Console kept showing the old error. Disabling and re-enabling the Calls plugin should also trigger it.
   - You can check the state without the System Console. With a system admin access token: `curl -H "Authorization: Bearer <token>" https://mattermost.example.com/plugins/com.mattermost.calls/sip/trunk-status` returns `"state":"ready"` and the trunk ID when it worked, or an `error` message.
   - Alternative: use mode **existing** and create the trunk yourself with `lk sip outbound create`, then enter the trunk ID.
4. Place a call to a phone number in E.164 format (`+1...`). **[validated with a Twilio Elastic SIP trunk]** In the bridge logs (`docker compose logs livekit-sip`) a healthy call shows `Outbound SIP call established`, then `call statistics` with `audio_packets` counts in both directions, and ends with `BYE from remote` or `SIP call ended`. These log lines also appear in healthy calls and are harmless: `failed to get server reflexive address udp6 ... network is unreachable` (the host has no IPv6 route), `Failed to ping without candidate pairs` during call setup, and `error closing media port: opus: invalid argument` at hangup.

## External TURN for restrictive firewalls (optional)

**[validated: relay path with direct media blocked, and certificate renewal, including an independent run of the turn/ instructions]**

Clients on networks that block UDP and plain TCP (7881) cannot reach LiveKit directly. A TURN server on TCP 443 with TLS lets them in. LiveKit's built-in TURN would need port 443, which Caddy already uses on this host, so run coturn on a separate host with its own public IP. See [turn/README.md](turn/README.md) for the full procedure. On this host the only change is one option when you generate the config:

```bash
./setup.sh lk.example.com https://mattermost.example.com \
    --turn-host turn.example.com --turn-secret-file ./turn-secret
docker compose up -d --force-recreate
docker compose logs --tail 20 livekit    # confirm LiveKit started
```

Options are not remembered, so include `--sip` as well if you use SIP. No Calls plugin setting is needed; LiveKit gives clients the TURN address and short-lived credentials automatically.

## Operations

- Logs: `docker compose logs -f livekit`
- Upgrade: change the image tags in `docker-compose.yaml`, then `docker compose pull && docker compose up -d`. **[untested]**
- Stop: `docker compose down` (add `-v` to also delete the certificate and Redis volumes). If SIP is enabled, Redis and the bridge stop too.

## Troubleshooting

- **Certificate not issued:** confirm the DNS A record resolves to this host and that 443/tcp is reachable from the internet (`docker compose logs caddy`).
- **Calls start but no audio/video:** check that 7882/udp and 7881/tcp are open in every firewall and security group between clients and the host.
- **SIP trunk status shows an error:** see SIP step 3 for how to retry and how to check the state.
- **No call events in Mattermost:** LiveKit must be able to reach `<site-url>/plugins/com.mattermost.calls/livekit-webhook`. Look for webhook errors in the LiveKit logs.

_Validated by the author and by a separate agent session that followed these READMEs and the files in this directory end to end for the base stack, SIP and TURN, with a human at the call-test checkpoints. Image upgrades, recording and transcription are untested._
