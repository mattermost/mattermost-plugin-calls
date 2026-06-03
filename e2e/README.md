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

CI runs every test tagged `@livekit-smoke` or `@livekit` (see
`e2e/scripts/run.sh`). The wider test migration from RTCD to LiveKit is
tracked under MM-68570.

- `@livekit-smoke` — the original framework smoke test from MM-68789. Always
  expected green.
- `@livekit` — the broader MM-68570 suite. Every test in `e2e/tests/*.spec.ts`
  (except `livekit_smoke.spec.ts`) carries this tag. Tests are added to the
  green set incrementally as the MM-68570 PR series progresses; the rest are
  `test.fixme` or `test.skip` and contribute no failures.

### Tagging + quarantine convention

- New tests for LiveKit-era features: tag the enclosing `test.describe` with
  `{tag: '@livekit'}`.
- Tests that exercise a feature still being migrated and that we expect to
  re-enable shortly: leave as `test.fixme('…', …)`. fixme'd tests are
  reported as expected-to-fail; flipping to `test()` once they pass is the
  final step in their owning PR.
- Tests blocked by deferred features (popout, recording, transcription,
  desktop, notifications-suite on v2): use `test.skip('…', …)`. Add a
  top-of-file comment referencing MM-68570 and naming the gating reason.

### `_e2eForceWebsocketClose()` test hook

`CallClient` exposes a hidden helper, `_e2eForceWebsocketClose()`, that
closes the underlying plugin WebSocket without flagging it as a clean
shutdown — so the reconnect logic fires as it would on a real network
drop. Use it from Playwright via
`await page.evaluate(() => window.callsClient._e2eForceWebsocketClose())`
to exercise WS-reconnect paths (e.g. the "unmute after WS reconnect" media
test). The hook is a no-op when there is no active call.
