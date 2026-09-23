# AGENTS.md

Mattermost Calls plugin: SIP, voice/video calling, and screen sharing, powered by LiveKit.

## Layout

- `server/` — Go plugin server (API, websocket, cluster, db migrations)
- `webapp/` — React plugin UI loaded by the Mattermost webapp
- `standalone/` — self-contained app for the Desktop call widget and the recorder
- `e2e/` — End-to-end Playwright tests
- `lt/` — load-testing tool

## Architecture

Call media never flows through the plugin. The server issues LiveKit tokens and drives the LiveKit server through its admin API (`server/livekit_admin.go`); clients connect to LiveKit directly using `livekit-client` (`webapp/src/clients/call/`). A change to call media usually belongs in the client or in LiveKit config, not in the plugin server.

Recording and transcription run as separate job containers launched by `server/job_service.go`. The recorder joins a call by loading the standalone recording page in a headless browser, which is why that page authenticates from a URL token rather than a session.

## Commands

Run from the repo root:

- `make check-style` — golangci-lint, eslint, tsc, i18n and go.mod consistency checks
- `make test` — Go and Jest unit tests
- `make dist` — build the plugin bundle
- `make deploy` — build and install to a running server (see `README.md` for env setup). For Cloud instances the multi-arch bundle is usually too large to upload; use `make dist-[platform_name_goes_here]` for a single-platform slim bundle and upload it manually.
- `make test-e2e` — Playwright tests

## Testing

`make test` runs everything — the full Go suite under `-race` plus all of Jest — which is too slow for an edit-and-check loop. Narrow it while iterating, then run `make test` once before handing back:

- Go: `go test -run TestName ./server/...` (run `make apply` first on a fresh checkout)
- Jest: `npm run test -- -t "test name"` from inside `webapp/`

Go tests sit beside the code as `*_test.go`; Jest tests as `*.test.ts(x)`.

## Local environment

Calls needs a LiveKit server. The `Makefile` has several targets because the right one depends on how clients reach your Mattermost:

- `make livekit-docker-start` — plaintext `ws://`, for local dev on `http://localhost`
- `make livekit-tls-docker-start` — adds a Caddy TLS proxy for `wss://`, needed when other machines on the LAN connect over HTTPS. Requires `LIVEKIT_TLS_CERT` and `LIVEKIT_TLS_KEY`
- `make livekit-sip-docker-start` — adds Redis and the SIP bridge for outbound SIP
- `make livekit-sip-sink-docker-start` — the SIP stack plus a bundled Asterisk auto-answer sink for media testing

Each has a matching `-stop` target.

## Toolchain

Go and Node versions are pinned in `.go-version` and `.nvmrc`; read them rather than assuming a version. `goenv install` and `nvm use` in the repo root pick up the right ones.

## Conventions

- Every new Go and TypeScript source file starts with the license header:

  ```
  // Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
  // See LICENSE.txt for license information.
  ```

  Generated files such as `server/mocks/**` are exempt, as are non-source files like SCSS, JSON and YAML.
- Run `make apply` before the first build, lint or test command in a session, and again after editing `plugin.json`. It generates the gitignored `server/manifest.go` and `webapp/src/manifest.ts` from `plugin.json`; without them a direct `go build` or npm script fails on an unresolved `manifest` symbol. The `check-style`, `test`, `dist` and `watch` targets already run it.
- Regenerate derived files after the change that invalidates them: user-facing strings need `make i18n-extract`, a changed interface in `server/interfaces` needs `make server-mocks`, and a new db migration needs `make migrations-extract`. See Boundaries.
- Prefer self-explanatory code over comments; comment only where intent isn't obvious from the code.
- Use the `npm run` script defined in the package's `package.json` when one exists; fall back to `npx` only when there is no script for the tool.

## Licensed features

Several features are gated behind a licence. `server/enterprise/license.go` exposes the checks — `RecordingsAllowed`, `TranscriptionsAllowed`, `HostControlsAllowed`, `GroupCallsAllowed` — backed by the SKU helpers in `server/license/license.go`. When adding to a gated area, keep the check in place and mirror it on the client so the UI doesn't offer something the server will refuse. A server with `EnableDeveloper` and `EnableTesting` set passes these checks without any licence, so a feature working on your dev server doesn't mean it is ungated.

## Boundaries

Never hand-edit generated files; run the command that produces them instead:

| File | Regenerate with |
| --- | --- |
| `server/manifest.go`, `webapp/src/manifest.ts` | `make apply` |
| `server/mocks/**` | `make server-mocks` |
| `server/db/migrations/migrations.list` | `make migrations-extract` |
| `i18n/en.json` | `make i18n-extract` |

Translation files other than `en.json` come from translation sync and are never edited here, by hand or otherwise.

Ask before adding a Go or npm dependency, making a cross-cutting refactor, or changing anything under `server/db/migrations` that has already shipped.

## Git

Leave changes uncommitted in the working tree for the engineer to review. Do not run `git commit` or `git push` unless explicitly asked to. Read-only commands such as `git status`, `git diff`, `git log`, etc. are fine.
