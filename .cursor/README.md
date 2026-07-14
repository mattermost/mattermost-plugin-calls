# Cursor Cloud Agent Environment

This directory defines the checked-in environment for Cursor Cloud Agents working on **mattermost-plugin-calls**.

- `environment.json` — Dockerfile build, sibling repos (`mattermost`, `rtcd`), Mattermost port `8065`
- `Dockerfile` — Ubuntu 24.04 + DinD + Go 1.26.4 + Node 24.14.1 + AWS CLI + golangci-lint + Playwright Chromium libs + libopus + prepulled Mattermost EE / Postgres 14
- `scripts/cloud-agent-install.sh` — hydrates Go modules (root, `build/`, `lt/`, `server/public/`), `make apply`, webapp + standalone npm deps, Playwright browsers
- `scripts/cloud-agent-start.sh` — starts `dockerd`, Docker Hub login, loads cached images, materializes `.cursor/AGENTS.md`
- `cursor.md` — cloud-only runbook for Mattermost + Calls deploy / e2e

`.cursor/AGENTS.md` is generated at cloud-agent startup from `cursor.md` and should not be committed.

## Calls-specific additions

Beyond the generic Mattermost plugin preset:

| Addition | Why |
|----------|-----|
| `repositoryDependencies`: mattermost, rtcd | Webapp types / e2e config; RTCD e2e image |
| `standalone/` npm ci | Popout + recording bundles |
| Go modules in `build/`, `lt/`, `server/public/` | Separate `go.mod` trees |
| `libopus-dev` / `libopusfile-dev` | Load-test client (`lt/`) |
| Playwright chromium + webkit | `e2e/` suite (CI uses both) |
| Postgres 14 prepull | Matches `e2e/docker/docker-compose.yaml` |
| Publish RTC port 8443 | Embedded Calls media from host |

## Validation

From the repository root:

```bash
python3 -m json.tool .cursor/environment.json >/dev/null
bash -n .cursor/scripts/cloud-agent-install.sh && bash -n .cursor/scripts/cloud-agent-start.sh
docker build --check -f .cursor/Dockerfile .cursor
docker build -f .cursor/Dockerfile .cursor/
```

The Dockerfile fetches `mattermostdevelopment/mattermost-enterprise-edition:master` (linux/amd64) and `postgres:14` during image build so startup can `docker load` them without a live pull. The Mattermost development `master` tag does not publish arm64.

## Expected Secrets

Configure in the [Cursor Cloud Agents dashboard](https://cursor.com/dashboard/cloud-agents) for this environment:

| Secret | Required | Notes |
|--------|----------|-------|
| `MM_TEST_LICENSE` | Already available | Pass to Mattermost as `MM_LICENSE` with `MM_SERVICEENVIRONMENT=test` |
| `DOCKERHUB_USERNAME` | Recommended | Same name as CI; avoids anonymous pull rate limits |
| `DOCKERHUB_TOKEN` | Recommended | Mark **redacted** |
| `AWS_ACCESS_KEY_ID` | For artifact uploads | Standard AWS CLI |
| `AWS_SECRET_ACCESS_KEY` | For artifact uploads | Mark **redacted** |
