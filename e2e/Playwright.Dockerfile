FROM mcr.microsoft.com/playwright:v1.51.1-jammy

ENV CI=1

# Replace the base image's Node 22 with Node 24 to satisfy the plugin's
# engines.node ^24.14 declaration in e2e/package.json and webapp/package.json.
# No official Playwright image ships Node 24 yet (checked through v1.58), so we
# install from NodeSource.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl gnupg \
 && curl -fsSL https://deb.nodesource.com/setup_24.x | bash - \
 && apt-get install -y --no-install-recommends nodejs \
 && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/calls-e2e
COPY . .
