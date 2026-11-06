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
  | 5060/udp, 10000-10100/udp | UDP | Only if the SIP bridge is enabled |

  Clients connect to the media ports directly, so they must be reachable from the internet (or from your users' networks). TURN is not required.

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

Pass `--sip` as a third argument to also enable the SIP bridge and Redis (see [SIP outbound](#sip-outbound-optional-untested)). Without it, LiveKit runs standalone and Redis is not started.

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

## 6. Verify **[validated for audio, screen share, reactions, TCP fallback and a second network; SIP, recording and upgrade untested]**

1. Start a call in a channel and join from a client outside the host's network. **[validated: audio, two users]**
2. Confirm LiveKit saw the room and delivered webhooks:
   ```bash
   docker compose logs livekit | grep -E "room_started|participant_joined|sent webhook"
   ```
   There should be no webhook errors. **[validated]**
3. Share a screen from one participant and confirm the other sees it. **[validated]**
4. A participant on a different network from the first (tested with a laptop on a phone hotspot). **[validated: audio and screen share, UDP direct]**
5. UDP blocked (remove the `7882/udp` rule), start a fresh call, and confirm both participants connect with a `tcp4 ... :7881` selected candidate in the LiveKit logs. **[validated: two users, audio]**

## SIP outbound (optional) **[validated: managed trunk, outbound call to a phone with two-way audio]**

SIP outbound lets users dial phone numbers from a call. It adds the SIP bridge and a Redis instance, and puts LiveKit into distributed mode, which requires Redis.

1. Open `10000-10100/udp` on the host firewall (RTP media, both directions). Outbound-only dialing does not need 5060 open to the internet. Limit the range to your SIP provider's addresses if they publish them.
2. Regenerate the config with SIP enabled and **recreate** the containers:
   ```bash
   ./setup.sh lk.example.com https://mattermost.example.com --sip
   docker compose up -d --force-recreate
   ```
   `--sip` writes the Redis block into `livekit.yaml` and sets `COMPOSE_PROFILES=sip` in `.env`, so Redis and `livekit-sip` start with the normal command. LiveKit reads `livekit.yaml` only at startup and Compose does not notice file changes, so `--force-recreate` (or `docker compose restart livekit`) is required. Without it LiveKit keeps running without Redis and SIP trunk calls fail with `sip not connected (redis required)`. Re-running `setup.sh` without `--sip` turns SIP back off (recreate again).
3. In the Calls plugin settings (System Console > Plugins > Calls > SIP Outbound), enable outbound phone dialing, set the trunk mode to **managed**, and enter your provider's trunk address, caller ID number, and credentials. The plugin creates the trunk in LiveKit; the status should show `ready` with a trunk ID. If it shows an error, fix the cause and save the settings again to retry.
   - Alternative: use mode **existing** and create the trunk yourself with `lk sip outbound create`, then enter the trunk ID.
4. Place a call to a phone number in E.164 format (`+1...`). **[validated with a Twilio Elastic SIP trunk]** In the bridge logs (`docker compose logs livekit-sip`) a healthy call shows `Outbound SIP call established`, then `call statistics` with `audio_packets` counts in both directions, and ends with `BYE from remote` or `SIP call ended`. `failed to get server reflexive address udp6 ... network is unreachable` warnings only mean the host has no IPv6 route and are harmless.

## Operations

- Logs: `docker compose logs -f livekit`
- Upgrade: change the image tags in `docker-compose.yaml`, then `docker compose pull && docker compose up -d`. **[untested]**
- Stop: `docker compose down` (add `-v` to also delete the certificate and Redis volumes). If SIP is enabled, Redis and the bridge stop too.

## Troubleshooting

- **Certificate not issued:** confirm the DNS A record resolves to this host and that 443/tcp is reachable from the internet (`docker compose logs caddy`).
- **Calls start but no audio/video:** check that 7882/udp and 7881/tcp are open in every firewall and security group between clients and the host.
- **No call events in Mattermost:** LiveKit must be able to reach `<site-url>/plugins/com.mattermost.calls/livekit-webhook`. Look for webhook errors in the LiveKit logs.

_Draft. Not yet validated by a second person._
