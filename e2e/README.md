# e2e caveats

- `make test-data` in `mattermost-server` to create the standard test sysadmin (u: sysadmin, pw: Sys@dmin-sample1) prior to running tests

- snapshots were updated with the new App Bar (`config.ExperimentalSettings.EnableAppBar: true`) enabled, tests likely will fail if you have it disabled

- server should have an enterprise license applied

## LiveKit configuration

The plugin reads LiveKit settings from these environment variables (consumed by
the generic env-override mechanism in `server/environment.go`, which maps the
`LiveKit*` Go fields on `configuration` to underscored env-var names):

- `MM_CALLS_LIVE_KIT_URL` — WebSocket URL of the LiveKit server (e.g. `ws://livekit:7880`)
- `MM_CALLS_LIVE_KIT_API_KEY` — LiveKit API key
- `MM_CALLS_LIVE_KIT_API_SECRET` — LiveKit API secret (≥ 32 chars)

The CI workflow (`.github/workflows/e2e.yml`) sets these to point at the
`livekit` service started by `e2e/docker/docker-compose.yaml`, configured by
`e2e/docker/livekit.yaml`. The same values must be reachable from inside the
Playwright browser (which shares the proxy container's network namespace, so
docker-network DNS names like `livekit` resolve directly).

## Test scope

Only the `@livekit-smoke` tagged test currently runs in CI (see `e2e/scripts/run.sh`).
The wider test migration from RTCD to LiveKit is tracked under MM-68570.
