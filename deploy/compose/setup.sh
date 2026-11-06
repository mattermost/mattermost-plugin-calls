#!/usr/bin/env bash
# Generates the files that contain site-specific values and secrets:
#   .env         LIVEKIT_DOMAIN, used by docker-compose.yaml
#   livekit.yaml LiveKit server config (API key/secret, webhook target)
#   sip.yaml     SIP bridge config (same API key/secret)
#
# Usage: ./setup.sh <livekit-domain> <mattermost-site-url> [--sip]
#   ./setup.sh lk.example.com https://mattermost.example.com
#   ./setup.sh lk.example.com https://mattermost.example.com --sip   # + Redis and SIP bridge
#
# After changing --sip on/off, recreate LiveKit so it re-reads livekit.yaml:
#   docker compose up -d --force-recreate
#
# Re-running reuses the existing API key/secret so deployed clients are not
# broken; delete livekit.yaml to rotate them.
set -euo pipefail

usage() { echo "Usage: $0 <livekit-domain> <mattermost-site-url> [--sip]" >&2; exit 1; }
[ $# -ge 2 ] || usage
DOMAIN="$1"
MM_URL="${2%/}"
SIP=false
[ "${3:-}" = "--sip" ] && SIP=true

case "$DOMAIN" in
  http*|*/*) echo "livekit-domain must be a bare hostname, e.g. lk.example.com" >&2; exit 1 ;;
esac
case "$MM_URL" in
  https://*|http://*) ;;
  *) echo "mattermost-site-url must start with https:// (or http://)" >&2; exit 1 ;;
esac

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
  true
} > .env

# LiveKit only needs Redis (distributed mode) when the SIP bridge is used.
REDIS_BLOCK=""
if $SIP; then
  REDIS_BLOCK="redis:
  address: redis:6379
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
${REDIS_BLOCK}keys:
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

cat <<EOF

Wrote .env, livekit.yaml and sip.yaml (mode 600).

Calls plugin settings (System Console > Plugins > Calls):
  LiveKit URL         wss://${DOMAIN}
  LiveKit API key     ${KEY_NAME}
  LiveKit API secret  (the value under "keys:" in livekit.yaml)

Next: docker compose up -d --force-recreate$($SIP && echo '  (also starts Redis and the SIP bridge)')
EOF
