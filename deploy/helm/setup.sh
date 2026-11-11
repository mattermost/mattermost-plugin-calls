#!/usr/bin/env bash
# Generates the site-specific files used by the LiveKit Helm deployment:
#   secrets.yaml      Secrets: livekit-keys (API key/secret) and, with --sip, livekit-sip
#   values-site.yaml  Helm values: webhook target, Redis address and, with --turn-host, TURN
#   sip-site.yaml     SIP bridge ConfigMap, with the Redis address (only with --sip)
#   ingress.yaml      Ingress for the signaling hostname
#   issuer.yaml       cert-manager ClusterIssuer (only with --acme-email)
#
# Usage: ./setup.sh <livekit-domain> <mattermost-site-url> [options]
#   --acme-email <email>     obtain the TLS certificate with cert-manager + Let's Encrypt
#   --tls-secret <name>      use an existing kubernetes.io/tls Secret in the livekit
#                            namespace instead (bring your own certificate)
#   --redis <host:port>      use an external Redis instead of redis.yaml
#   --sip                    also generate the SIP bridge Secret and ConfigMap
#   --turn-host <domain>     advertise an external coturn server (see README, "External TURN")
#   --turn-secret-file <f>   file holding coturn's shared secret (used with --turn-host)
# One of --acme-email or --tls-secret is required.
#
# Options are not remembered: re-run with the same options you used before.
# Re-running reuses the existing API secret (read from secrets.yaml); delete
# secrets.yaml to rotate it.
set -euo pipefail

usage() {
  echo "Usage: $0 <livekit-domain> <mattermost-site-url> (--acme-email <email> | --tls-secret <name>) [--redis <host:port>] [--sip] [--turn-host <domain> --turn-secret-file <file>]" >&2
  exit 1
}
[ $# -ge 2 ] || usage
DOMAIN="$1"
MM_URL="${2%/}"
shift 2

ACME_EMAIL=""
TLS_SECRET=""
REDIS="livekit-redis.livekit.svc.cluster.local:6379"
SIP=false
TURN_HOST=""
TURN_SECRET_FILE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --acme-email) ACME_EMAIL="${2:?--acme-email needs a value}"; shift 2 ;;
    --tls-secret) TLS_SECRET="${2:?--tls-secret needs a value}"; shift 2 ;;
    --redis) REDIS="${2:?--redis needs a value}"; shift 2 ;;
    --sip) SIP=true; shift ;;
    --turn-host) TURN_HOST="${2:?--turn-host needs a value}"; shift 2 ;;
    --turn-secret-file) TURN_SECRET_FILE="${2:?--turn-secret-file needs a value}"; shift 2 ;;
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
if [ -n "$ACME_EMAIL" ] && [ -n "$TLS_SECRET" ]; then
  echo "Use either --acme-email or --tls-secret, not both" >&2; exit 1
fi
if [ -z "$ACME_EMAIL" ] && [ -z "$TLS_SECRET" ]; then
  echo "One of --acme-email or --tls-secret is required" >&2; exit 1
fi

# TURN: both options or neither. LiveKit refuses to start if a TURN entry has no
# credentials, so an empty or missing secret must stop us before anything is written.
TURN_SECRET=""
if [ -n "$TURN_HOST" ] || [ -n "$TURN_SECRET_FILE" ]; then
  if [ -z "$TURN_HOST" ] || [ -z "$TURN_SECRET_FILE" ]; then
    echo "--turn-host and --turn-secret-file must be used together" >&2; exit 1
  fi
  case "$TURN_HOST" in
    http*|*/*|*:*) echo "--turn-host must be a bare hostname, e.g. turn.example.com" >&2; exit 1 ;;
  esac
  [ -r "$TURN_SECRET_FILE" ] || { echo "Cannot read --turn-secret-file: $TURN_SECRET_FILE" >&2; exit 1; }
  TURN_SECRET="$(tr -d '[:space:]' < "$TURN_SECRET_FILE")"
  if [ "${#TURN_SECRET}" -lt 32 ]; then
    echo "TURN secret in $TURN_SECRET_FILE is empty or shorter than 32 characters; refusing to write any files." >&2
    exit 1
  fi
fi

cd "$(dirname "$0")"
umask 077

KEY_NAME="calls-plugin"
if [ -f secrets.yaml ]; then
  API_SECRET="$(sed -n 's/^    calls-plugin: //p' secrets.yaml | head -1)"
  [ -n "$API_SECRET" ] || { echo "Could not read existing secret from secrets.yaml; remove the file to regenerate." >&2; exit 1; }
else
  API_SECRET="$(openssl rand -base64 48 | tr -d '/+=\n' | cut -c1-48)"
fi

cat > secrets.yaml <<EOF
apiVersion: v1
kind: Secret
metadata:
  name: livekit-keys
  namespace: livekit
type: Opaque
stringData:
  keys.yaml: |
    ${KEY_NAME}: ${API_SECRET}
EOF
if $SIP; then
  cat >> secrets.yaml <<EOF
---
apiVersion: v1
kind: Secret
metadata:
  name: livekit-sip
  namespace: livekit
type: Opaque
stringData:
  LIVEKIT_API_KEY: ${KEY_NAME}
  LIVEKIT_API_SECRET: ${API_SECRET}
EOF
fi

cat > values-site.yaml <<EOF
livekit:
  redis:
    address: ${REDIS}
  webhook:
    api_key: ${KEY_NAME}
    urls:
      - ${MM_URL}/plugins/com.mattermost.calls/livekit-webhook
EOF
if [ -n "$TURN_HOST" ]; then
  # Credentials are generated per client from the shared secret and expire after ttl seconds.
  cat >> values-site.yaml <<EOF
  rtc:
    turn_servers:
      - host: ${TURN_HOST}
        port: 443
        protocol: tls
        secret: ${TURN_SECRET}
        ttl: 14400
EOF
fi

if [ -n "$ACME_EMAIL" ]; then
  TLS_SECRET="livekit-tls"
  ISSUER_ANNOTATION="    cert-manager.io/cluster-issuer: letsencrypt
"
  cat > issuer.yaml <<EOF
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: ${ACME_EMAIL}
    privateKeySecretRef:
      name: letsencrypt-account-key
    solvers:
      - http01:
          ingress:
            ingressClassName: nginx
EOF
else
  ISSUER_ANNOTATION=""
  rm -f issuer.yaml
fi

if $SIP; then
  cat > sip-site.yaml <<EOF
apiVersion: v1
kind: ConfigMap
metadata:
  name: livekit-sip
  namespace: livekit
data:
  config.yaml: |
    log_level: info
    ws_url: ws://livekit-server.livekit.svc.cluster.local:80
    redis:
      address: ${REDIS}
    sip_port: 5060
    rtp_port: 10000-10100
    use_external_ip: true
    health_port: 8080
    prometheus_port: 6789
EOF
else
  rm -f sip-site.yaml
fi

cat > ingress.yaml <<EOF
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: livekit-server
  namespace: livekit
  annotations:
${ISSUER_ANNOTATION}    # LiveKit signaling is a long-lived WebSocket.
    nginx.ingress.kubernetes.io/proxy-connect-timeout: "90"
    nginx.ingress.kubernetes.io/proxy-send-timeout: "3600"
    nginx.ingress.kubernetes.io/proxy-read-timeout: "3600"
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
spec:
  ingressClassName: nginx
  tls:
    - hosts: [${DOMAIN}]
      secretName: ${TLS_SECRET}
  rules:
    - host: ${DOMAIN}
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: livekit-server
                port:
                  number: 80
EOF

cat <<EOF

Wrote secrets.yaml (mode 600), values-site.yaml, ingress.yaml$([ -n "$ACME_EMAIL" ] && echo ", issuer.yaml")$($SIP && echo ", sip-site.yaml").

Calls plugin settings (System Console > Plugins > Calls):
  LiveKit URL         wss://${DOMAIN}
  LiveKit API key     ${KEY_NAME}
  LiveKit API secret  (the value in secrets.yaml under livekit-keys)
EOF
