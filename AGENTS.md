# Agents

## Build commands

- `make apply` — Propagate plugin manifest into server/ and webapp/
- `MM_DEBUG= MM_SERVICESETTINGS_ENABLEDEVELOPER=true make dist` — Build a browser-compatible plugin bundle for the native architecture
- `make check-style` — Run all linters (Go + webapp + standalone + e2e)
- `make test` — Run unit tests (Go + webapp)
- `make test-e2e` — Playwright e2e (needs running Mattermost)
- `MM_DEBUG= make dist` — Build all platform assets without eval-based source maps

## Cursor Cloud Agents

- Cloud-agent environment files live in `.cursor/`.
- `.cursor/cursor.md` has cloud-only instructions for starting Mattermost with Docker and deploying Calls.
- `.cursor/AGENTS.md` is generated from `.cursor/cursor.md` during cloud-agent startup and should not be committed.
- Sibling repos: `mattermost/mattermost` and `mattermost/rtcd` (see `environment.json` `repositoryDependencies`).
