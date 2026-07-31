# Cursor Cloud Agent Guide

This repository uses a Dockerfile-backed Cursor Cloud Agent environment with Docker-in-Docker. The image includes Go 1.26.4, Node 24.14.1, Docker, Docker Compose, AWS CLI, golangci-lint, Chromium runtime libs (for Playwright), libopus (for `lt/`), and preloaded Mattermost Enterprise + Postgres images.

Sibling repos declared in `environment.json` are cloned by Cursor (do not `git clone` them yourself):

- `github.com/mattermost/mattermost` — webapp type deps + e2e config generation
- `github.com/mattermost/rtcd` — build `rtcd:e2e` for full e2e stack

## Skip Flags

- `CLOUD_AGENT_SKIP_GO_MOD=1` — skip `go mod download`
- `CLOUD_AGENT_SKIP_BUILD_TOOLS=1` — skip `make apply`
- `CLOUD_AGENT_SKIP_WEBAPP_DEPS=1` — skip `npm ci` for webapp/ and standalone/
- `CLOUD_AGENT_SKIP_PLAYWRIGHT=1` — skip Playwright browser install
- `CLOUD_AGENT_SKIP_IMAGE_LOAD=1` — skip loading preloaded Docker image archives

When `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN` are configured as Cloud Agent secrets, `cloud-agent-start.sh` logs in to Docker Hub so fallback pulls avoid anonymous rate limits. Mark `DOCKERHUB_TOKEN` as **redacted**.

## Overview

**Mattermost Calls** (`com.mattermost.calls`) enables voice/video calls with screensharing:

- **Go server plugin** (`server/`) — embedded RTC or external RTCD
- **React webapp** (`webapp/`) — channel UI; `preinstall` clones mattermost at a pinned commit
- **Standalone** (`standalone/`) — popout widget + recording view
- **E2E** (`e2e/`) — Playwright against a Dockerized Mattermost stack
- **Load tests** (`lt/`) — separate Go module needing libopus

Plugin bundles land at `dist/com.mattermost.calls-<version>.tar.gz`.

## Start Mattermost

After cloud-agent startup, Docker should be ready and Mattermost/Postgres images loaded:

```bash
# Pin to latest 11.7.* ESR for stability (override MATTERMOST_IMAGE[_TAG] for master/server work).
export MM_IMAGE="${MATTERMOST_IMAGE:-mattermost/mattermost-enterprise-edition}:${MATTERMOST_IMAGE_TAG:-11.7.6}"
export MM_PLATFORM="${MATTERMOST_PLATFORM:-linux/amd64}"
export POSTGRES_IMAGE="${POSTGRES_IMAGE:-postgres}:${POSTGRES_IMAGE_TAG:-14}"
export MM_DB_USER=mmuser
export MM_DB_PASSWORD=mostest
export MM_DB_NAME=mattermost_test
export MM_ADMIN_USERNAME=admin
export MM_ADMIN_PASSWORD=Password123

docker network create mattermost-dev || true
docker rm -f mattermost mm-postgres 2>/dev/null || true
docker volume create mm-postgres-data

docker run -d \
  --name mm-postgres \
  --network mattermost-dev \
  -e POSTGRES_USER="$MM_DB_USER" \
  -e POSTGRES_PASSWORD="$MM_DB_PASSWORD" \
  -e POSTGRES_DB="$MM_DB_NAME" \
  --health-cmd='pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
  --health-interval=5s \
  --health-timeout=5s \
  --health-retries=24 \
  -v mm-postgres-data:/var/lib/postgresql/data \
  "$POSTGRES_IMAGE"

for _ in $(seq 1 60); do
  if [ "$(docker inspect -f '{{.State.Health.Status}}' mm-postgres)" = "healthy" ]; then
    break
  fi
  sleep 2
done
if [ "$(docker inspect -f '{{.State.Health.Status}}' mm-postgres)" != "healthy" ]; then
  echo "Postgres did not become healthy within 120s" >&2
  docker logs mm-postgres >&2 || true
  exit 1
fi

mkdir -p /tmp/mattermost/{config,data,logs,plugins,client-plugins,bleve-indexes}
chmod -R 777 /tmp/mattermost

# Publish 8443 UDP/TCP so embedded RTC (default Calls mode) is reachable from the host.
# MM_TEST_LICENSE is provided by the Cloud Agent environment; MM_SERVICEENVIRONMENT=test
# lets the server accept it via MM_LICENSE at startup (same pattern as e2e/scripts/prepare-server.sh).
docker run -d \
  --name mattermost \
  --platform "$MM_PLATFORM" \
  --network mattermost-dev \
  -p 8065:8065 \
  -p 8443:8443/udp \
  -p 8443:8443/tcp \
  -e MM_SQLSETTINGS_DRIVERNAME=postgres \
  -e "MM_SQLSETTINGS_DATASOURCE=postgres://$MM_DB_USER:$MM_DB_PASSWORD@mm-postgres:5432/$MM_DB_NAME?sslmode=disable&connect_timeout=10" \
  -e MM_SERVICESETTINGS_SITEURL=http://localhost:8065 \
  -e MM_SERVICESETTINGS_ENABLEDEVELOPER=true \
  -e MM_SERVICESETTINGS_ENABLELOCALMODE=true \
  -e MM_PLUGINSETTINGS_ENABLEUPLOADS=true \
  -e MM_PLUGINSETTINGS_ENABLEMARKETPLACE=false \
  -e MM_FILESETTINGS_MAXFILESIZE=256000000 \
  -e MM_SERVICESETTINGS_ENABLEONBOARDINGFLOW=false \
  -e MM_SERVICEENVIRONMENT=test \
  -e "MM_LICENSE=${MM_TEST_LICENSE:?MM_TEST_LICENSE must be set}" \
  -v /tmp/mattermost/config:/mattermost/config \
  -v /tmp/mattermost/data:/mattermost/data \
  -v /tmp/mattermost/logs:/mattermost/logs \
  -v /tmp/mattermost/plugins:/mattermost/plugins \
  -v /tmp/mattermost/client-plugins:/mattermost/client/plugins \
  -v /tmp/mattermost/bleve-indexes:/mattermost/bleve-indexes \
  "$MM_IMAGE"
```

Wait for Mattermost, then create a system admin:

```bash
for _ in $(seq 1 90); do
  if curl -fsS http://localhost:8065/api/v4/system/ping | jq -e '.status == "OK"' >/dev/null 2>&1; then
    break
  fi
  sleep 2
done
if ! curl -fsS http://localhost:8065/api/v4/system/ping | jq -e '.status == "OK"' >/dev/null 2>&1; then
  echo "Mattermost did not become ready within 180s" >&2
  docker logs mattermost >&2 || true
  exit 1
fi

docker exec mattermost mmctl --local user search "$MM_ADMIN_USERNAME" | grep -q "$MM_ADMIN_USERNAME" || \
  docker exec mattermost mmctl --local user create \
    --email admin@example.com \
    --username "$MM_ADMIN_USERNAME" \
    --password "$MM_ADMIN_PASSWORD" \
    --system-admin
```

Mattermost is on port `8065`. The Enterprise license comes from the Cloud Agent secret `MM_TEST_LICENSE` (passed as `MM_LICENSE` with `MM_SERVICEENVIRONMENT=test`).

## Deploy The Plugin

Build without `MM_DEBUG` for browser testing. Debug webapp bundles use eval-based source maps that Mattermost's CSP blocks.

```bash
export MM_SERVICESETTINGS_SITEURL=http://localhost:8065
export MM_ADMIN_USERNAME=admin
export MM_ADMIN_PASSWORD=Password123

MM_DEBUG= MM_SERVICESETTINGS_ENABLEDEVELOPER=true make deploy
```

Or build then deploy explicitly:

```bash
MM_DEBUG= MM_SERVICESETTINGS_ENABLEDEVELOPER=true make dist
./build/bin/pluginctl deploy com.mattermost.calls dist/com.mattermost.calls-*.tar.gz
```

For iterative webapp work:

```bash
MM_DEBUG= MM_SERVICESETTINGS_ENABLEDEVELOPER=true make watch
```

## Lint, Test, and Type Check

| Task | Command |
|------|---------|
| Full style check | `make check-style` |
| Unit tests (Go + webapp) | `make test` |
| Plugin bundle | `MM_DEBUG= MM_SERVICESETTINGS_ENABLEDEVELOPER=true make dist` |
| Playwright e2e (needs running MM) | `make test-e2e` |
| Go workspace (optional) | `make setup-go-work` |

## Sibling Repos

Cursor clones `repositoryDependencies` as siblings. Probe with:

```bash
# Typical locations: ../mattermost, ../../mattermost, or $MATTERMOST_DIR / $RTCD_DIR
ls ../mattermost ../rtcd 2>/dev/null || true
```

`webapp/install_mattermost_webapp.sh` still shallow-clones a pinned mattermost commit into `webapp/mattermost-webapp/` during `npm ci --prefix webapp` — that path is independent of the sibling checkout.

For full e2e with RTCD (`e2e/scripts/run.sh`):

1. Build RTCD image from the sibling: `docker build -t rtcd:e2e ../rtcd` (or the path from the probe)
2. Follow `e2e/scripts/prepare-server.sh` / `e2e/scripts/run.sh`
3. Core-only e2e (embedded RTC, no RTCD): `e2e/scripts/run-core.sh`

Optional recording stack images (pulled on demand, not preloaded):

- `mattermost/calls-offloader:v0.9.6`
- `mattermost/calls-recorder:v0.8.13`
- `mattermost/calls-transcriber:v0.7.2`

## Drive The Mattermost UI

Use Cursor's `computerUse` subagent (Chrome desktop) against the local instance — no browser install is required in this image for that path.

After Mattermost is running and the plugin is deployed, open `http://localhost:8065/login` and verify Calls UI (channel header call button, join flow, etc.).

For headless Playwright e2e (separate from computer use):

```bash
make test-e2e
# or: cd e2e && npx playwright test
```

## Upload Screenshot Artifacts

```bash
mkdir -p /tmp/artifacts
# capture via computerUse or Playwright, then:
aws sts get-caller-identity
aws s3 cp /tmp/artifacts/calls-screenshot.png <artifact-s3-uri>/calls-screenshot.png
```

Do not print AWS credentials. If `aws sts get-caller-identity` fails, report missing config instead of working around it.

## Gotchas

- **Enterprise license** — use `MM_TEST_LICENSE` (Cloud Agent secret) as `MM_LICENSE` with `MM_SERVICEENVIRONMENT=test`. Do not upload via mmctl unless that env is missing.
- **Debug webapp CSP** — `MM_DEBUG=true` uses eval-based source maps that current Mattermost CSP blocks. Use production-mode builds for browser testing.
- **Embedded RTC ports** — default UDP/TCP `8443` must be published on the Mattermost container for media from the host/browser. Nested Docker/ICE can still fail in cloud VMs; UI-only checks do not need media.
- **Cloud desktop audio** — the browser may have no audio input device. Calls UI and signaling can still be tested, but microphone capture needs a real or virtual input device.
- **RTCD vs embedded** — local plugin iteration usually uses embedded RTC (no RTCD). Set `RTCDServiceURL` only when running an external RTCD.
- **standalone depends on webapp** — always `npm ci --prefix webapp` before standalone; `make dist` orders this correctly.
- **Plugin upload size** — `MM_FILESETTINGS_MAXFILESIZE=256000000` avoids `Uploaded plugin size exceeds limit`. Raise later with: `docker exec mattermost mmctl --local config set FileSettings.MaxFileSize 256000000 && docker exec mattermost mmctl --local config reload`.
- **E2E sysadmin** — full e2e docs expect `sysadmin` / `Sys@dmin-sample1` from mattermost-server `make test-data`; the simple stack above uses `admin` / `Password123`.
- **App Bar** — e2e snapshots assume App Bar enabled.
- **`lt/` load tests** — need `libopus-dev` / `libopusfile-dev` (already in the Dockerfile).

## Troubleshooting

- Docker Hub rate limits → set `DOCKERHUB_USERNAME` / `DOCKERHUB_TOKEN` secrets and restart.
- Docker not ready → inspect `/tmp/docker-service-start.log` and `/tmp/dockerd.log`.
- Sibling missing → confirm `repositoryDependencies` and probe `../mattermost`, `../rtcd`.
- Plugin upload fails → confirm uploads enabled, max file size, and admin credentials.
- Mattermost unhealthy → `docker logs mattermost` and `docker logs mm-postgres`.
- Reset stack → `docker rm -f mattermost mm-postgres` and remove `/tmp/mattermost` / `mm-postgres-data` if needed.
