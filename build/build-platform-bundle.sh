#!/usr/bin/env bash
#
# Build a lightweight plugin bundle for Mattermost Cloud instance.
#
# Invoked via Make: `make dist-linux-amd64` (or any of the dist-<platform>
# targets). The Make target is the canonical entry point.
# Direct invocation also works: `./build/build-platform-bundle.sh <platform>`
# Supported platforms: linux-amd64, linux-arm64, freebsd-amd64, openbsd-amd64.

set -euo pipefail
shopt -s nullglob

if [[ $# -lt 1 ]]; then
    echo "error: platform argument is required" >&2
    echo "Usage: $0 <platform>" >&2
    echo "  platform: linux-amd64, linux-arm64, freebsd-amd64, openbsd-amd64" >&2
    exit 1
fi

PLATFORM="$1"

case "$PLATFORM" in
    linux-amd64|linux-arm64|freebsd-amd64|openbsd-amd64) ;;
    -h|--help)
        echo "Usage: $0 <platform>"
        echo "  platform: linux-amd64, linux-arm64, freebsd-amd64, openbsd-amd64"
        exit 0
        ;;
    *)
        echo "error: unsupported platform '$PLATFORM'" >&2
        echo "supported: linux-amd64, linux-arm64, freebsd-amd64, openbsd-amd64" >&2
        exit 1
        ;;
esac

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

if ! command -v jq >/dev/null; then
    echo "error: jq is required" >&2
    exit 1
fi

# Ensure the dev-mode branch (host-only build) is not active.
unset MM_SERVICESETTINGS_ENABLEDEVELOPER

echo "Running make dist"
make dist

DIST_DIR="$REPO_ROOT/dist"
PLUGIN_DIR="$DIST_DIR/com.mattermost.calls"
SERVER_DIST="$PLUGIN_DIR/server/dist"
MANIFEST="$PLUGIN_DIR/plugin.json"
BINARY="plugin-${PLATFORM}"

echo "Pruning server binaries to ${PLATFORM} only..."
for f in "$SERVER_DIST"/plugin-*; do
    [[ "$(basename "$f")" == "$BINARY" ]] && continue
    rm "$f"
done

echo "Trimming staged plugin.json executables map..."
tmp=$(mktemp)
jq --arg platform "$PLATFORM" --arg path "server/dist/${BINARY}" \
    '.server.executables = {($platform): $path} | .server.executable = ""' \
    "$MANIFEST" > "$tmp"
mv "$tmp" "$MANIFEST"

VERSION=$(jq -r '.version' "$MANIFEST")
BUNDLE_NAME="com.mattermost.calls-${VERSION/+/-}-${PLATFORM}-slim.tar.gz"
BUNDLE="$DIST_DIR/$BUNDLE_NAME"

echo "Repackaging as ${BUNDLE_NAME}..."
cd "$DIST_DIR"
if [[ "$(uname)" == "Darwin" ]]; then
    tar --disable-copyfile -czf "$BUNDLE_NAME" com.mattermost.calls/
else
    tar -czf "$BUNDLE_NAME" com.mattermost.calls/
fi

BUNDLE_SIZE=$(ls -lh "$BUNDLE" | awk '{print $5}')
ORIGINAL_BUNDLE="$DIST_DIR/com.mattermost.calls-${VERSION}.tar.gz"

if [[ "$(uname)" == "Darwin" ]]; then
    BUNDLE_CREATED=$(stat -f "%Sm" -t "%Y-%m-%d %H:%M:%S" "$BUNDLE")
    stat_bytes() { stat -f%z "$1"; }
else
    BUNDLE_CREATED=$(stat -c "%y" "$BUNDLE" | cut -d'.' -f1)
    stat_bytes() { stat -c%s "$1"; }
fi

if [[ -f "$ORIGINAL_BUNDLE" ]]; then
    ORIGINAL_SIZE=$(ls -lh "$ORIGINAL_BUNDLE" | awk '{print $5}')
    slim_bytes=$(stat_bytes "$BUNDLE")
    orig_bytes=$(stat_bytes "$ORIGINAL_BUNDLE")
    reduction_pct=$(( 100 - (slim_bytes * 100 / orig_bytes) ))
    SIZE_LINE="$BUNDLE_SIZE  (-${reduction_pct}%)"
    FULL_LINE="$ORIGINAL_SIZE (multi-arch)"
else
    SIZE_LINE="$BUNDLE_SIZE"
    FULL_LINE="(not found)"
fi

echo
echo "=========================================="
echo "Bundle:       $BUNDLE_NAME"
echo "Path:         $BUNDLE"
echo "Size:         $SIZE_LINE"
echo "Full Bundle:  $FULL_LINE"
echo "Platform:     $PLATFORM"
echo "Created:      $BUNDLE_CREATED"
echo "=========================================="
