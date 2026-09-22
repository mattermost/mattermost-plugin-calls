# AGENTS.md

Mattermost Calls plugin: SIP, voice/video calling, and screen sharing, powered by LiveKit.

## Layout

- `server/` — Go plugin server (API, websocket, cluster, db migrations)
- `webapp/` — React plugin UI loaded by the Mattermost webapp
- `standalone/` — self-contained app for the Desktop call widget and the recorder
- `e2e/` — End-to-end Playwright tests
- `lt/` — load-testing tool

## Commands

Run from the repo root:

- `make check-style` — golangci-lint, eslint, tsc, i18n and go.mod consistency checks
- `make test` — Go and Jest unit tests
- `make dist` — build the plugin bundle
- `make deploy` — build and install to a running server (see `README.md` for env setup). For Cloud instances the multi-arch bundle is usually too large to upload; use `make dist-[platform_name_goes_here]` for a single-platform slim bundle and upload it manually.
- `make test-e2e` — Playwright tests

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
- Run `make i18n-extract` after changing user-facing strings. Only `i18n/en.json` files are edited by hand; other locales come from translation sync.
- Regenerate server mocks with `make server-mocks` after changing an interface in `server/interfaces`.
- After adding a db migration, run `make migrations-extract`.
- Prefer self-explanatory code over comments; comment only where intent isn't obvious from the code.
- Use the `npm run` script defined in the package's `package.json` when one exists; fall back to `npx` only when there is no script for the tool.

## Git

Leave changes uncommitted in the working tree for the engineer to review. Do not run `git commit` or `git push` unless explicitly asked to. Read-only commands such as `git status`, `git diff`, `git log`, etc. are fine.
