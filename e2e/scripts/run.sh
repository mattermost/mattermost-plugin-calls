#!/bin/bash
set -eu
set -o pipefail

function print_logs {
	exit_code=$?
	if [[ ${exit_code} -ne 0 ]]; then
		echo "Script exited with failure code ${exit_code}, printing logs..."
		docker logs ${CONTAINER_SERVER}1
		docker logs ${CONTAINER_SERVER}2
		docker logs ${CONTAINER_PROXY}
		docker logs ${CONTAINER_LIVEKIT}

		# Log all containers
		docker ps -a
	fi
}

trap print_logs EXIT

mkdir -p "${WORKSPACE}/results"

# Generate sysadmin
echo "Generating sysadmin ..."
docker exec \
	${CONTAINER_SERVER}1 \
	/mattermost/bin/mmctl user create --email-verified --email sysadmin@sample.mattermost.com --username sysadmin --password Sys@dmin-sample1 --system-admin --local

# Copy admin password file
docker cp e2e/scripts/pwd.txt ${CONTAINER_SERVER}1:/mattermost

# Auth mmctl
echo "Authenticating mmctl ..."
docker exec --env="XDG_CONFIG_HOME=/mattermost/config" \
	${CONTAINER_SERVER}1 \
	/mattermost/bin/mmctl auth login http://localhost:8065 --username sysadmin --name local --password-file /mattermost/pwd.txt

# Install Playbooks
echo "Installing playbooks ..."
docker exec --env="XDG_CONFIG_HOME=/mattermost/config" \
	${CONTAINER_SERVER}1 \
	/mattermost/bin/mmctl plugin marketplace install playbooks

# Enable Playbooks
echo "Enabling playbooks ..."
docker exec --env="XDG_CONFIG_HOME=/mattermost/config" \
	${CONTAINER_SERVER}1 \
	/mattermost/bin/mmctl plugin enable playbooks

# Copy built plugin into server
echo "Copying calls plugin into ${CONTAINER_SERVER}1 server container ..."
docker cp dist/*.tar.gz ${CONTAINER_SERVER}1:/mattermost/bin/calls

# Install Calls
echo "Installing calls ..."
docker exec --env="XDG_CONFIG_HOME=/mattermost/config" \
	${CONTAINER_SERVER}1 \
	/mattermost/bin/mmctl plugin add bin/calls
sleep 5

# Enable Calls — LiveKit config arrives via MM_CALLS_LIVE_KIT_* env vars set in
# prepare-server.sh, applied by server/environment.go.
echo "Enabling calls ..."
docker exec --env="XDG_CONFIG_HOME=/mattermost/config" \
	${CONTAINER_SERVER}1 \
	/mattermost/bin/mmctl plugin enable com.mattermost.calls

echo "Spawning playwright image ..."
# run e2e
# `--network=container` tells this container to share a network stack
# with the proxy container. This means that `localhost` is the same
# interface for both. That's relevant because some browser APIs
# that Calls uses require a 'secure context', which is either HTTPS
# or localhost.
# https://docs.docker.com/engine/reference/run/#network-settings
# https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts
#
# Scope of this run: just the LiveKit smoke test that validates the framework.
# Constrained to chromium because that's the browser the smoke test was authored
# against; broader cross-browser + cross-feature coverage lands under MM-68570.
docker run -d --name playwright-e2e \
	--network=container:${CONTAINER_PROXY} \
	--entrypoint "" \
	mm-playwright \
	bash -c "npm ci && npx playwright install && npx playwright test --project=chromium --grep @livekit-smoke --shard=${CI_NODE_INDEX}/${CI_NODE_TOTAL}"

docker logs -f playwright-e2e

docker cp playwright-e2e:/usr/src/calls-e2e/test-results results/test-results-${CI_NODE_INDEX}
docker cp playwright-e2e:/usr/src/calls-e2e/playwright-report results/playwright-report-${CI_NODE_INDEX}
docker cp playwright-e2e:/usr/src/calls-e2e/pw-results.json results/pw-results-${CI_NODE_INDEX}.json

## Dumping services logs to be uploaded as artifacts in case of failures.
docker logs ${CONTAINER_SERVER}1 >"${WORKSPACE}/logs/server1.log"
docker logs ${CONTAINER_SERVER}2 >"${WORKSPACE}/logs/server2.log"
docker logs ${CONTAINER_PROXY} >"${WORKSPACE}/logs/proxy.log"
docker logs ${CONTAINER_LIVEKIT} >"${WORKSPACE}/logs/livekit.log"

## Count failures. The recursive descent (`..`) walks arbitrary `test.describe`
## nesting; a shallow `.suites[].suites[].specs[]` filter would miss specs nested
## deeper and silently report zero failures.
NUM_FAILURES=$(jq '[.. | objects | select(has("tests") and (.tests | type == "array")) | .tests[] | last(.results[]) | select(.status != "passed").status] | length' <"${WORKSPACE}/results/pw-results-${RUN_ID}.json")
echo "FAILURES=${NUM_FAILURES}" >>${GITHUB_OUTPUT}
sudo chown -R 1001:1001 "${WORKSPACE}/logs"

## Exit non-zero on any failure so the GitHub Actions step itself fails — without
## this, FAILURES is only consumed by the persist-report-logs `if:`, leaving the
## step green even when every test failed.
if [[ ${NUM_FAILURES} -gt 0 ]]; then
	echo "playwright reported ${NUM_FAILURES} failing tests"
	exit 1
fi
