#!/usr/bin/env bash
# Generates turnserver.conf and the shared secret for the coturn host.
#
# Usage: sudo ./setup.sh <turn-domain> <livekit-public-ip> [options]
#   --public-ip <ip>     this host's public IP (default: detected)
#   --private-ip <ip>    this host's private IP (default: detected from the default route)
#   --relay-min <port>   first UDP relay port (default 50000)
#   --relay-max <port>   last UDP relay port (default 50100)
#
#   sudo ./setup.sh turn.example.com 203.0.113.10
#
# <livekit-public-ip> is the public IP of the LiveKit host. coturn only relays to
# that address, so it cannot be used as a general-purpose relay.
#
# Must run as root: the coturn container runs as user "nobody" (uid 65534) and the
# config holds the shared secret, so the file is owned by that user with mode 600.
# Re-running keeps the existing secret (file "secret"); delete it to rotate.
set -euo pipefail

usage() {
  echo "Usage: sudo $0 <turn-domain> <livekit-public-ip> [--public-ip IP] [--private-ip IP] [--relay-min PORT] [--relay-max PORT]" >&2
  exit 1
}
[ "$(id -u)" -eq 0 ] || { echo "Run as root (sudo): the config must be owned by uid 65534." >&2; exit 1; }
[ $# -ge 2 ] || usage
DOMAIN="$1"; LK_IP="$2"; shift 2

PUBLIC_IP=""; PRIVATE_IP=""; RELAY_MIN=50000; RELAY_MAX=50100
while [ $# -gt 0 ]; do
  case "$1" in
    --public-ip)  PUBLIC_IP="${2:?--public-ip needs a value}"; shift 2 ;;
    --private-ip) PRIVATE_IP="${2:?--private-ip needs a value}"; shift 2 ;;
    --relay-min)  RELAY_MIN="${2:?--relay-min needs a value}"; shift 2 ;;
    --relay-max)  RELAY_MAX="${2:?--relay-max needs a value}"; shift 2 ;;
    *) usage ;;
  esac
done

ipv4() { [[ "$1" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]]; }
case "$DOMAIN" in http*|*/*|*:*) echo "turn-domain must be a bare hostname, e.g. turn.example.com" >&2; exit 1 ;; esac
ipv4 "$LK_IP" || { echo "livekit-public-ip must be an IPv4 address" >&2; exit 1; }
[[ "$RELAY_MIN" =~ ^[0-9]+$ && "$RELAY_MAX" =~ ^[0-9]+$ && "$RELAY_MIN" -lt "$RELAY_MAX" ]] || { echo "invalid relay port range" >&2; exit 1; }

if [ -z "$PRIVATE_IP" ]; then
  PRIVATE_IP="$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src") {print $(i+1); exit}}')"
fi
if [ -z "$PUBLIC_IP" ]; then
  PUBLIC_IP="$(curl -fsS -m 5 https://checkip.amazonaws.com 2>/dev/null | tr -d '[:space:]' || true)"
fi
ipv4 "${PRIVATE_IP:-}" || { echo "Could not detect the private IP; pass --private-ip" >&2; exit 1; }
ipv4 "${PUBLIC_IP:-}"  || { echo "Could not detect the public IP; pass --public-ip" >&2; exit 1; }

cd "$(dirname "$0")"
umask 077

if [ -s secret ]; then
  SECRET="$(tr -d '[:space:]' < secret)"
else
  SECRET="$(openssl rand -base64 48 | tr -d '/+=\n' | cut -c1-48)"
  printf '%s\n' "$SECRET" > secret
fi
[ "${#SECRET}" -ge 32 ] || { echo "secret file is shorter than 32 characters; delete it to regenerate" >&2; exit 1; }

# When the host sits behind 1:1 NAT (AWS and similar), tell coturn the public
# address that maps to its private one.
EXTERNAL_LINE=""
[ "$PUBLIC_IP" != "$PRIVATE_IP" ] && EXTERNAL_LINE="external-ip=${PUBLIC_IP}/${PRIVATE_IP}"

cat > turnserver.conf <<EOF
# coturn for LiveKit: TURN over TLS on 443 only, shared-secret (REST) credentials.
realm=${DOMAIN}
server-name=${DOMAIN}
fingerprint
use-auth-secret
static-auth-secret=${SECRET}

# TLS only: no plain UDP/TCP listeners.
no-udp
no-tcp
listening-ip=${PRIVATE_IP}
tls-listening-port=443
cert=/certs/fullchain.pem
pkey=/certs/privkey.pem

# UDP relay ports; open this range in the firewall to the LiveKit host only.
min-port=${RELAY_MIN}
max-port=${RELAY_MAX}
relay-ip=${PRIVATE_IP}
${EXTERNAL_LINE}

# Relay only to the LiveKit host, never to private or special ranges.
allowed-peer-ip=${LK_IP}
denied-peer-ip=0.0.0.0-0.255.255.255
denied-peer-ip=10.0.0.0-10.255.255.255
denied-peer-ip=100.64.0.0-100.127.255.255
denied-peer-ip=127.0.0.0-127.255.255.255
denied-peer-ip=169.254.0.0-169.254.255.255
denied-peer-ip=172.16.0.0-172.31.255.255
denied-peer-ip=192.168.0.0-192.168.255.255
no-multicast-peers
no-software-attribute
log-file=stdout
simple-log
EOF

mkdir -p certs
chown 65534:65534 turnserver.conf certs
chmod 600 turnserver.conf secret
chmod 750 certs

cat <<EOF

Wrote turnserver.conf (mode 600, owner 65534) and the shared secret in ./secret.
  Domain         ${DOMAIN}
  Relay to       ${LK_IP} only
  Relay ports    ${RELAY_MIN}-${RELAY_MAX}/udp
  Addresses      private ${PRIVATE_IP}, public ${PUBLIC_IP}

Next:
  1. Get a certificate and install the renewal hook (see README.md).
  2. docker compose up -d
  3. Copy ./secret to the LiveKit host and run its setup.sh with
     --turn-host ${DOMAIN} --turn-secret-file <that file>.
EOF
