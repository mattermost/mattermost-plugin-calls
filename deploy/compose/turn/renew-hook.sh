#!/bin/sh
# certbot deploy hook for coturn.
#
# Copies the issued or renewed certificate where the coturn container (user
# "nobody", uid 65534) can read it, then signals coturn (SIGUSR2) to reload its TLS
# certificates. New connections get the new certificate; existing connections are
# kept, and a certificate that fails to load leaves the old one in place.
#
# Install:
#   sudo mkdir -p /etc/letsencrypt/renewal-hooks/deploy
#   sudo install -m 755 renew-hook.sh /etc/letsencrypt/renewal-hooks/deploy/coturn.sh
#
# certbot runs it after each successful RENEWAL, but not after the first
# `certbot certonly`, so run it by hand once:
#   sudo /etc/letsencrypt/renewal-hooks/deploy/coturn.sh /etc/letsencrypt/live/<turn-domain>
set -eu

COTURN_DIR="${COTURN_DIR:-/opt/coturn}"
LINEAGE="${RENEWED_LINEAGE:-${1:-}}"
[ -n "$LINEAGE" ] || { echo "usage: $0 /etc/letsencrypt/live/<turn-domain>" >&2; exit 1; }
[ -d "$COTURN_DIR/certs" ] || { echo "$COTURN_DIR/certs not found; set COTURN_DIR" >&2; exit 1; }

install -o 65534 -g 65534 -m 0644 "$LINEAGE/fullchain.pem" "$COTURN_DIR/certs/fullchain.pem"
install -o 65534 -g 65534 -m 0600 "$LINEAGE/privkey.pem" "$COTURN_DIR/certs/privkey.pem"

if docker ps --format '{{.Names}}' | grep -qx coturn; then
  docker kill -s USR2 coturn >/dev/null
  logger -t coturn-cert "reloaded coturn certificate from $LINEAGE"
  echo "coturn certificate reloaded"
else
  logger -t coturn-cert "coturn not running; certificate copied only"
  echo "coturn not running; certificate copied"
fi
