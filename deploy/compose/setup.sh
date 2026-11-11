#!/usr/bin/env bash
# Generates the files that contain site-specific values and secrets:
#   .env         LIVEKIT_DOMAIN, used by docker-compose.yaml
#   livekit.yaml LiveKit server config (API key/secret, webhook target)
#   sip.yaml     SIP bridge config (same API key/secret)
#
# Usage: ./setup.sh <livekit-domain> <mattermost-site-url> [options]
#   --sip                       also enable Redis and the SIP bridge
#   --turn-host <domain>        advertise an external TURN server (see turn/README.md)
#   --turn-secret-file <file>   file holding the TURN server's shared secret
#   --turn-domain <domain>      use LiveKit's built-in TURN on this host (docker-compose.builtin-turn.yaml)
#
# Examples:
#   ./setup.sh lk.example.com https://mattermost.example.com
#   ./setup.sh lk.example.com https://mattermost.example.com --sip
#   ./setup.sh lk.example.com https://mattermost.example.com \
#       --turn-host turn.example.com --turn-secret-file ./turn-secret
#
# Options are not remembered: re-run with the same options you used before.
# After any change, recreate LiveKit so it re-reads livekit.yaml:
#   docker compose up -d --force-recreate
#
# Re-running reuses the existing API key/secret so deployed clients are not
# broken; delete livekit.yaml to rotate them.
set -euo pipefail

usage() {
  echo "Usage: $0 <livekit-domain> <mattermost-site-url> [--sip] [--turn-host <domain> --turn-secret-file <file> | --turn-domain <domain>]" >&2
  exit 1
}
[ $# -ge 2 ] || usage
DOMAIN="$1"
MM_URL="${2%/}"
shift 2

SIP=false
TURN_HOST=""
TURN_SECRET_FILE=""
TURN_DOMAIN=""
while [ $# -gt 0 ]; do
  case "$1" in
    --sip) SIP=true; shift ;;
    --turn-host) TURN_HOST="${2:?--turn-host needs a value}"; shift 2 ;;
    --turn-secret-file) TURN_SECRET_FILE="${2:?--turn-secret-file needs a value}"; shift 2 ;;
    --turn-domain) TURN_DOMAIN="${2:?--turn-domain needs a value}"; shift 2 ;;
    *) usage ;;
  esac
done

case "$DOMAIN" in
  http*|*/*) echo "livekit-domain must be a bare hostname, e.g. lk.example.com" >&2; exit 1 ;;
esac
case "$MM_URL" in
  https://*|http://*) ;;
  *) echo "mattermost-site-url must start with https:// (or http://)" >&2; exit 1 ;;
esac

# Built-in TURN and an external TURN server are alternatives.
if [ -n "$TURN_DOMAIN" ]; then
  [ -z "$TURN_HOST" ] || { echo "--turn-domain cannot be combined with --turn-host" >&2; exit 1; }
  case "$TURN_DOMAIN" in
    http*|*/*|*:*) echo "--turn-domain must be a bare hostname, e.g. turn.example.com" >&2; exit 1 ;;
  esac
  [ "$TURN_DOMAIN" != "$DOMAIN" ] || { echo "--turn-domain must differ from livekit-domain" >&2; exit 1; }
fi

# TURN: both options or neither. LiveKit refuses to start if a TURN entry has no
# credentials, so an empty or missing secret must stop us before anything is written.
TURN_SECRET=""
if [ -n "$TURN_HOST" ] || [ -n "$TURN_SECRET_FILE" ]; then
  if [ -z "$TURN_HOST" ] || [ -z "$TURN_SECRET_FILE" ]; then
    echo "--turn-host and --turn-secret-file must be used together" >&2
    exit 1
  fi
  case "$TURN_HOST" in
    http*|*/*|*:*) echo "--turn-host must be a bare hostname, e.g. turn.example.com" >&2; exit 1 ;;
  esac
  [ -r "$TURN_SECRET_FILE" ] || { echo "Cannot read --turn-secret-file: $TURN_SECRET_FILE" >&2; exit 1; }
  TURN_SECRET="$(tr -d '[:space:]' < "$TURN_SECRET_FILE")"
  if [ "${#TURN_SECRET}" -lt 32 ]; then
    echo "TURN secret in $TURN_SECRET_FILE is empty or shorter than 32 characters; refusing to write livekit.yaml." >&2
    exit 1
  fi
fi

cd "$(dirname "$0")"
umask 077

KEY_NAME="calls-plugin"
if [ -f livekit.yaml ]; then
  API_SECRET="$(sed -n 's/^  calls-plugin: //p' livekit.yaml)"
  [ -n "$API_SECRET" ] || { echo "Could not read existing secret from livekit.yaml; remove the file to regenerate." >&2; exit 1; }
else
  API_SECRET="$(openssl rand -base64 48 | tr -d '/+=\n' | cut -c1-48)"
fi

{
  echo "LIVEKIT_DOMAIN=${DOMAIN}"
  # Enables the Redis + SIP bridge services for a plain `docker compose up -d`.
  $SIP && echo "COMPOSE_PROFILES=sip"
  if [ -n "$TURN_DOMAIN" ]; then
    echo "TURN_DOMAIN=${TURN_DOMAIN}"
    echo "COMPOSE_FILE=docker-compose.yaml:docker-compose.builtin-turn.yaml"
  fi
  true
} > .env

# LiveKit only needs Redis (distributed mode) when the SIP bridge is used.
REDIS_BLOCK=""
if $SIP; then
  REDIS_BLOCK="redis:
  address: redis:6379
"
fi

# Built-in TURN over TLS only: Caddy terminates TLS on 443 (by SNI) and forwards plaintext to LiveKit.
BUILTIN_TURN_BLOCK=""
if [ -n "$TURN_DOMAIN" ]; then
  BUILTIN_TURN_BLOCK="turn:
  enabled: true
  domain: ${TURN_DOMAIN}
  external_tls: true
  tls_port: 5349
"
fi

# External TURN (coturn) advertised to clients; credentials are generated from
# the shared secret and expire after ttl seconds.
TURN_BLOCK=""
if [ -n "$TURN_HOST" ]; then
  TURN_BLOCK="  turn_servers:
    - host: ${TURN_HOST}
      port: 443
      protocol: tls
      secret: ${TURN_SECRET}
      ttl: 14400
"
fi

cat > livekit.yaml <<EOF
port: 7880
bind_addresses:
  - "0.0.0.0"
rtc:
  tcp_port: 7881
  udp_port: 7882
  use_ice_lite: true
  use_external_ip: true
${TURN_BLOCK}${BUILTIN_TURN_BLOCK}${REDIS_BLOCK}keys:
  ${KEY_NAME}: ${API_SECRET}
webhook:
  api_key: ${KEY_NAME}
  urls:
    - ${MM_URL}/plugins/com.mattermost.calls/livekit-webhook
logging:
  level: info
EOF

cat > sip.yaml <<EOF
api_key: ${KEY_NAME}
api_secret: ${API_SECRET}
ws_url: ws://livekit:7880
redis:
  address: redis:6379
sip_port: 5060
rtp_port: 10000-10100
use_external_ip: ${SIP}
logging:
  level: info
EOF

SIP_STATE="disabled"; $SIP && SIP_STATE="enabled"
TURN_STATE="disabled"; [ -n "$TURN_HOST" ] && TURN_STATE="external (${TURN_HOST})"
[ -n "$TURN_DOMAIN" ] && TURN_STATE="built-in (${TURN_DOMAIN})"

cat <<EOF

Wrote .env, livekit.yaml and sip.yaml (mode 600).
  SIP bridge:     ${SIP_STATE}
  TURN:           ${TURN_STATE}

Calls plugin settings (System Console > Plugins > Calls):
  LiveKit URL         wss://${DOMAIN}
  LiveKit API key     ${KEY_NAME}
  LiveKit API secret  (the value under "keys:" in livekit.yaml)

Next: docker compose up -d --force-recreate, then check that LiveKit started:
  docker compose logs --tail 20 livekit
EOF
