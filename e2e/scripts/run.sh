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
		docker logs ${CONTAINER_RTCD}
		docker logs ${CONTAINER_OFFLOADER}

		# Log all containers
		docker ps -a

		# Print transcriber job logs in case of failure.
		for ID in $(docker ps -a --filter=ancestor="calls-transcriber:master" --filter=status="exited" --format "{{.ID}}"); do
			docker logs $ID
		done

		# Print recorder job logs in case of failure.
		for ID in $(docker ps -a --filter=ancestor="calls-recorder:master" --filter=status="exited" --format "{{.ID}}"); do
			docker logs $ID
		done
	fi
}

trap print_logs EXIT

mkdir -p "${WORKSPACE}/results"

# Generate sysadmin
echo "Generating sysadmin ..."
docker exec \
	${CONTAINER_SERVER}1 \
	sh -c "/mattermost/bin/mmctl --local user create --email sysadmin@example.com --username sysadmin --password 'Sys@dmin-sample1'"

# Auth mmctl
echo "Authenticating mmctl ..."
docker exec \
	${CONTAINER_SERVER}1 \
	sh -c "echo 'Sys@dmin-sample1' > pwd.txt && /mattermost/bin/mmctl auth login http://localhost:8065 --username sysadmin --name local --password-file pwd.txt"

# Install Playbooks
echo "Installing playbooks ..."
docker exec \
	${CONTAINER_SERVER}1 \
	sh -c "/mattermost/bin/mmctl plugin add /mattermost/prepackaged_plugins/mattermost-plugin-playbooks-v2*.tar.gz"

# Enable Playbooks
echo "Enabling playbooks ..."
docker exec \
	${CONTAINER_SERVER}1 \
	sh -c "/mattermost/bin/mmctl plugin enable playbooks"

# Copy built plugin into server
echo "Copying calls plugin into ${CONTAINER_SERVER}1 server container ..."
docker cp dist/*.tar.gz ${CONTAINER_SERVER}1:/mattermost/bin/calls

# Copy config patch into server container
echo "Copying calls config patch into ${CONTAINER_SERVER}1 server container ..."
docker cp e2e/config-patch.json ${CONTAINER_SERVER}1:/mattermost

# Install Calls
echo "Installing calls ..."
docker exec \
	${CONTAINER_SERVER}1 \
	sh -c "/mattermost/bin/mmctl plugin add bin/calls && sleep 2"

# Patch config
echo "Patching calls config ..."
docker exec \
	${CONTAINER_SERVER}1 \
	sh -c "/mattermost/bin/mmctl plugin disable com.mattermost.calls && sleep 2 && /mattermost/bin/mmctl config patch /mattermost/config-patch.json && sleep 2 && /mattermost/bin/mmctl plugin enable com.mattermost.calls"

echo "Spawning playwright image ..."
# run e2e
# `--network=container` tells this container to share a network stack
# with the proxy container. This means that `localhost` is the same
# interface for both. That's relevant because some browser APIs
# that Calls uses require a 'secure context', which is either HTTPS
# or localhost.
# https://docs.docker.com/engine/reference/run/#network-settings
# https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts
docker run -d --name playwright-e2e \
	--network=container:${CONTAINER_PROXY} \
	--entrypoint "" \
	mm-playwright \
	bash -c "npm ci && npx playwright install && npx playwright test --shard=${CI_NODE_INDEX}/${CI_NODE_TOTAL}"

docker logs -f playwright-e2e

docker cp playwright-e2e:/usr/src/calls-e2e/test-results results/test-results-${CI_NODE_INDEX}
docker cp playwright-e2e:/usr/src/calls-e2e/playwright-report results/playwright-report-${CI_NODE_INDEX}
docker cp playwright-e2e:/usr/src/calls-e2e/pw-results.json results/pw-results-${CI_NODE_INDEX}.json

## Dumping services logs to be uploaded as artifacts in case of failures.
docker logs ${CONTAINER_SERVER}1 >"${WORKSPACE}/logs/server1.log"
docker logs ${CONTAINER_SERVER}2 >"${WORKSPACE}/logs/server2.log"
docker logs ${CONTAINER_PROXY} >"${WORKSPACE}/logs/proxy.log"
docker logs ${CONTAINER_RTCD} >"${WORKSPACE}/logs/rtcd.log"
docker logs ${CONTAINER_OFFLOADER} >"${WORKSPACE}/logs/offloader.log"

## Check if we have an early failures in order to upload logs
NUM_FAILURES=0
NUM_FAILURES=$((NUM_FAILURES + $(jq '.suites[].suites[].specs[].tests[] | last(.results[]) | select(.status != "passed").status' <"${WORKSPACE}/results/pw-results-${RUN_ID}.json" | wc -l)))
echo "FAILURES=${NUM_FAILURES}" >>${GITHUB_OUTPUT}
sudo chown -R 1001:1001 "${WORKSPACE}/logs"
