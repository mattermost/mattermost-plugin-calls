# Caddy with the layer4 module, used to share 443 between LiveKit signaling and TURN/TLS.
FROM caddy:2.11.9-builder AS builder
RUN xcaddy build --with github.com/mholt/caddy-l4@v0.1.2

FROM caddy:2.11.9-alpine
COPY --from=builder /usr/bin/caddy /usr/bin/caddy
