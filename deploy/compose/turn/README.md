# Optional: external TURN server (coturn) for Calls v2

Most clients connect to LiveKit directly over UDP (7882) or TCP (7881). Clients behind a firewall that blocks both can still reach LiveKit through a TURN server listening on TCP 443 with TLS, which looks like ordinary TLS to the firewall. This directory runs [coturn](https://github.com/coturn/coturn) for that purpose. It is optional: skip it unless you have users on such networks.

Status legend: **[validated]** was run end to end on AWS; **[untested]** is written but not yet run.

## How it fits together

- coturn runs on a **separate host with its own public IP**, because it needs port 443 and the LiveKit host's Caddy already owns 443. A second hostname pointing at the same IP does not help: only one process can bind an IP and port.
- LiveKit is told about it with an `rtc.turn_servers` entry (`livekit.yaml`). It then hands the TURN address and short-lived credentials to each client when it joins. No Calls plugin setting is needed. **[validated]**
- Credentials are generated from a secret shared between coturn and LiveKit and expire after 4 hours.
- coturn only relays to the LiveKit host, so it cannot be used as an open relay.

```
client --TLS 443--> coturn --UDP 50000-50100 / 7882--> LiveKit (7882/udp)
```

## Prerequisites

- A Linux host with a public IP, Docker and Compose, and `certbot` (tested: Ubuntu 24.04, 2 vCPU / 2 GB).
- A DNS name for it (for example `turn.example.com`), with an A record pointing at that IP, created before you request the certificate.
- The public IP of your LiveKit host.
- Firewall / security group on the **TURN host**:

  | Port | Protocol | Source | Purpose |
  |---|---|---|---|
  | 443 | TCP | anywhere | TURN over TLS |
  | 80 | TCP | anywhere | certificate issuance and renewal (HTTP challenge) |
  | 50000-50100 | UDP | LiveKit host only | relay ports (widen the range for more concurrent relayed users) |

- On the **LiveKit host**, `7882/udp` must accept traffic from the TURN host. It already does if it is open to clients.

## 1. Install Docker and certbot **[validated]**

Install Docker as in the main README. On Ubuntu: `sudo apt-get install -y certbot`.

## 2. Get the files and generate the config **[validated]**

Copy this directory to the host as `/opt/coturn`; the renewal hook expects that path. To use another directory, change the `COTURN_DIR` default at the top of the installed hook (`/etc/letsencrypt/renewal-hooks/deploy/coturn.sh`): certbot's scheduled renewal does not see environment variables from your shell, so exporting `COTURN_DIR` only works for a manual run. For example, from your workstation, in this repository's `deploy/compose` directory:

```bash
scp -r turn ubuntu@turn.example.com:/tmp/coturn
ssh ubuntu@turn.example.com 'sudo cp -r /tmp/coturn /opt/coturn && sudo chmod 755 /opt/coturn'
```

Then, on the host:

```bash
cd /opt/coturn
sudo ./setup.sh turn.example.com <livekit-public-ip>
```

This writes `turnserver.conf` (mode 600, owned by uid 65534, because the container runs as `nobody`) and a random shared secret in `./secret`. It detects the host's private and public addresses; pass `--private-ip` / `--public-ip` if detection fails. Re-running keeps the existing secret.

## 3. Get a certificate and install the renewal hook **[validated]**

```bash
cd /opt/coturn
sudo mkdir -p /etc/letsencrypt/renewal-hooks/deploy
sudo install -m 755 renew-hook.sh /etc/letsencrypt/renewal-hooks/deploy/coturn.sh
sudo certbot certonly --standalone -d turn.example.com -m you@example.com --agree-tos --non-interactive
sudo /etc/letsencrypt/renewal-hooks/deploy/coturn.sh /etc/letsencrypt/live/turn.example.com
```

Notes:

- Use a real address for `-m`; Let's Encrypt sends expiry notices to it. Without `-m`, `--agree-tos` and `--non-interactive`, certbot stops to ask for an email address and agreement to the terms.
- The `mkdir` is needed: the hooks directory does not exist until you create it.
- certbot runs the hook after each **renewal**, but **not** after the first `certonly`, hence the manual run in the last line. It copies the certificate to `/opt/coturn/certs` where the container can read it.
- certbot installs a systemd timer that renews automatically. Non-interactive renewals wait a random delay of up to about 8 minutes, so a renewed certificate reaches coturn a few minutes after the timer fires.

## 4. Start coturn **[validated]**

```bash
cd /opt/coturn
docker compose up -d
docker compose logs --tail 30 coturn
echo | openssl s_client -connect turn.example.com:443 -servername turn.example.com 2>/dev/null | openssl x509 -noout -subject -serial
```

The log should show no `WARNING` about configuration format. The `openssl` command should print your certificate.

## 5. Point LiveKit at it **[validated]**

Copy `/opt/coturn/secret` to the LiveKit host (for example to `~/livekit/turn-secret`, mode 600), then run the LiveKit `setup.sh` again with the same options as before plus:

```bash
./setup.sh lk.example.com https://mattermost.example.com \
    --turn-host turn.example.com --turn-secret-file ./turn-secret
docker compose up -d --force-recreate
docker compose logs --tail 20 livekit
```

`setup.sh` refuses to continue if the secret is empty or too short. That matters: LiveKit will not start if a TURN entry has no credentials, so a bad value takes the whole deployment down until fixed. Always check the LiveKit log after restarting.

## 6. Verify the relay path **[validated: two users, audio and screen share, including an independent run with these exact files]**

1. On the LiveKit host's firewall, temporarily limit `7882/udp` to the TURN host's IP only and remove `7881/tcp`, so TURN is the only way in. Leave 443 open for signaling.
2. Start a fresh call and join with audio.
3. In the LiveKit log, the selected remote candidate for each participant should be `udp relay <turn-host-ip>:<port in your relay range>`. The log abbreviates addresses (for example `203.0.113....:50007`), so check the first octets and that the port is inside your relay range, rather than searching for the full IP. To print just the selected candidates:
   ```bash
   docker compose logs livekit | grep 'participant active' | grep -oE '\[(local|remote)\]\[selected:1\][^"]*'
   ```
4. Restore the firewall rules.

## Certificate renewal **[validated]**

A forced renewal (`sudo certbot renew --force-renewal --no-random-sleep-on-renew --cert-name turn.example.com`) issued a new certificate and ran `renew-hook.sh` installed as in step 3; coturn logged `Reloading TLS certificates and keys` without restarting, and new connections were served the new certificate. This was confirmed twice, including by an independent run that followed these instructions. In the author's test an idle connection opened before the reload also stayed open. coturn keeps the old certificate if the new one fails to load.

- `certbot renew --dry-run` does **not** run deploy hooks, so use a real forced renewal to test. Let's Encrypt limits duplicate certificates to 5 per week.
- A live relayed media session across a reload has not been tested.

## Troubleshooting

- **LiveKit crash-loops after step 5 with `turn server has no usable credentials`:** the secret is empty. Fix the secret file and re-run `setup.sh`.
- **`Bad configuration format` warnings in the coturn log:** this coturn version rejects options such as `no-dtls`, `no-tlsv1` and `no-tlsv1_1`, and `no-cli` is deprecated. Do not add them; the defaults are fine.
- **coturn cannot read the certificate or key:** the container runs as uid 65534. Re-run the renewal hook, which sets the owner.
- **Connection resets from unknown addresses in the log:** internet scanners probing port 443. Harmless.
- **Clients never pick the relay:** check that the TURN host allows 443/tcp from the client's network, that the relay UDP range is open from the LiveKit host, and that the LiveKit host accepts 7882/udp from the TURN host.
