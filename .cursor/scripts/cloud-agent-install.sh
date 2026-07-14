#!/usr/bin/env bash
# Cursor Cloud Agent install ("update") script for mattermost-plugin-calls.
# Runs from project root on every boot. MUST be idempotent.

set -Eeuo pipefail

log() { printf '[cloud-agent-install] %s\n' "$*" >&2; }

is_true() {
  case "${1:-}" in
    1|true|TRUE|yes|YES) return 0 ;;
    *) return 1 ;;
  esac
}

cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
ROOT="$PWD"

export GOPATH="${GOPATH:-$HOME/go}"
export PATH="/usr/local/go/bin:$GOPATH/bin:/usr/local/node/bin:/usr/local/bin:$PATH"

ensure_tool() {
  local tool="$1"
  if ! command -v "$tool" >/dev/null 2>&1; then
    log "Required tool '$tool' is not on PATH (Dockerfile should provide it)"
    return 1
  fi
}

# Probe sibling checkouts declared in repositoryDependencies.
# Usage: find_sibling_checkout <repo_dir_name> <env_override_var_name>
find_sibling_checkout() {
  local repo_name="$1"
  local override_var="$2"
  local candidates=()
  if [ -n "${!override_var:-}" ]; then
    candidates+=("${!override_var}")
  fi
  candidates+=(
    "$ROOT/../$repo_name"
    "$ROOT/../../$repo_name"
    "$HOME/$repo_name"
  )
  local candidate
  for candidate in "${candidates[@]}"; do
    if git -C "$candidate" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
      realpath -m "$candidate"
      return 0
    fi
  done
  return 1
}

probe_sibling() {
  local repo_name="$1"
  local override_var="$2"
  local path
  if path="$(find_sibling_checkout "$repo_name" "$override_var")"; then
    log "Found sibling $repo_name at $path"
  else
    log "Sibling $repo_name not found (override via $override_var); e2e/rtcd workflows may need it"
  fi
}

ensure_playwright() {
  if is_true "${CLOUD_AGENT_SKIP_PLAYWRIGHT:-}"; then
    log "Skipping Playwright install (CLOUD_AGENT_SKIP_PLAYWRIGHT set)"
    return 0
  fi
  if [ ! -f "$ROOT/e2e/package.json" ]; then
    return 0
  fi
  log "Installing Playwright browsers for e2e/"
  if [ -f "$ROOT/e2e/package-lock.json" ]; then
    npm ci --prefix "$ROOT/e2e"
  else
    npm install --prefix "$ROOT/e2e"
  fi
  # Chromium for default local runs; WebKit used in CI — install both when available.
  npx --prefix "$ROOT/e2e" playwright install chromium webkit --with-deps \
    || log "Playwright browser install failed; will retry next boot"
}

ensure_tool go
ensure_tool node
ensure_tool npm
ensure_tool docker
ensure_tool aws

probe_sibling mattermost MATTERMOST_DIR
probe_sibling rtcd RTCD_DIR

if ! is_true "${CLOUD_AGENT_SKIP_GO_MOD:-}"; then
  log "Hydrating Go modules"
  go mod download
  for moddir in build lt server/public; do
    if [ -f "$ROOT/$moddir/go.mod" ]; then
      log "Hydrating Go modules in $moddir/"
      (cd "$ROOT/$moddir" && go mod download)
    fi
  done
fi

if ! is_true "${CLOUD_AGENT_SKIP_BUILD_TOOLS:-}"; then
  if [ -f "$ROOT/Makefile" ] && grep -q '^apply:' "$ROOT/Makefile" 2>/dev/null; then
    log "Running make apply"
    make apply
  fi
fi

if ! is_true "${CLOUD_AGENT_SKIP_WEBAPP_DEPS:-}"; then
  # webapp preinstall clones mattermost/mattermost at a pinned commit into webapp/mattermost-webapp/
  if [ -f "$ROOT/webapp/package-lock.json" ]; then
    log "Hydrating webapp dependencies (npm ci --prefix webapp)"
    npm ci --prefix "$ROOT/webapp"
  fi
  # standalone links into webapp/mattermost-webapp; install after webapp
  if [ -f "$ROOT/standalone/package-lock.json" ]; then
    log "Hydrating standalone dependencies (npm ci --prefix standalone)"
    npm ci --prefix "$ROOT/standalone"
  fi
fi

ensure_playwright

log "Tool versions:"
node --version 2>&1 | sed 's/^/  node /' >&2 || true
go version 2>&1 | sed 's/^/  /' >&2 || true
docker --version 2>&1 | sed 's/^/  /' >&2 || true
aws --version 2>&1 | sed 's/^/  /' >&2 || true
golangci-lint --version 2>&1 | sed 's/^/  /' >&2 || true

log "Install complete"
