#!/usr/bin/env bash
# Generates the site-specific files used by the LiveKit Helm deployment:
#   secrets.yaml      Secrets: livekit-keys (API key/secret) and, with --sip, livekit-sip
#   values-site.yaml  Helm values: webhook target and Redis address
#   ingress.yaml      Ingress for the signaling hostname
#   issuer.yaml       cert-manager ClusterIssuer (only with --acme-email)
#
# Usage: ./setup.sh <livekit-domain> <mattermost-site-url> [options]
#   --acme-email <email>     obtain the TLS certificate with cert-manager + Let's Encrypt
#   --tls-secret <name>      use an existing kubernetes.io/tls Secret in the livekit
#                            namespace instead (bring your own certificate)
#   --redis <host:port>      use an external Redis instead of redis.yaml
#   --sip                    also generate the SIP bridge Secret
# One of --acme-email or --tls-secret is required.
#
# Re-running reuses the existing API secret (read from secrets.yaml); delete
# secrets.yaml to rotate it.
set -euo pipefail

usage() {
  echo "Usage: $0 <livekit-domain> <mattermost-site-url> (--acme-email <email> | --tls-secret <name>) [--redis <host:port>] [--sip]" >&2
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
while [ $# -gt 0 ]; do
  case "$1" in
    --acme-email) ACME_EMAIL="${2:?--acme-email needs a value}"; shift 2 ;;
    --tls-secret) TLS_SECRET="${2:?--tls-secret needs a value}"; shift 2 ;;
    --redis) REDIS="${2:?--redis needs a value}"; shift 2 ;;
    --sip) SIP=true; shift ;;
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

Wrote secrets.yaml (mode 600), values-site.yaml, ingress.yaml$([ -n "$ACME_EMAIL" ] && echo ", issuer.yaml").

Calls plugin settings (System Console > Plugins > Calls):
  LiveKit URL         wss://${DOMAIN}
  LiveKit API key     ${KEY_NAME}
  LiveKit API secret  (the value in secrets.yaml under livekit-keys)
EOF
