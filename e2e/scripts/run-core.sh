#!/bin/bash
set -eu
set -o pipefail

# Copy config patch into server container
echo "Copying calls config patch into ${CONTAINER_SERVER}1 server container ..."
docker cp e2e/config-patch-core.json ${CONTAINER_SERVER}1:/mattermost

# Patch config. Needed to disable rtcd.
echo "Patching calls config ..."
docker exec \
	${CONTAINER_SERVER}1 \
	sh -c "/mattermost/bin/mmctl plugin disable com.mattermost.calls && sleep 2 && /mattermost/bin/mmctl config patch /mattermost/config-patch-core.json && sleep 2 && /mattermost/bin/mmctl plugin enable com.mattermost.calls"

echo "Spawning playwright image ..."
# run e2e
# `--network=container` tells this container to share a network stack
# with the proxy container. This means that `localhost` is the same
# interface for both. That's relevant because some browser APIs
# that Calls uses require a 'secure context', which is either HTTPS
# or localhost.
# https://docs.docker.com/engine/reference/run/#network-settings
# https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts
docker run -d --name playwright-e2e-core \
	--network=container:${CONTAINER_PROXY} \
	--entrypoint "" \
	mm-playwright \
	bash -c "npm ci && npx playwright install && npx playwright test --grep @core --shard=${CI_NODE_INDEX}/${CI_NODE_TOTAL}"

docker logs -f playwright-e2e-core

docker cp playwright-e2e-core:/usr/src/calls-e2e/test-results results/test-results-core-${CI_NODE_INDEX}
docker cp playwright-e2e-core:/usr/src/calls-e2e/playwright-report results/playwright-report-core-${CI_NODE_INDEX}
docker cp playwright-e2e-core:/usr/src/calls-e2e/pw-results.json results/pw-results-core-${CI_NODE_INDEX}.json

## Check if we have an early failures in order to upload logs
NUM_FAILURES=0
NUM_FAILURES=$((NUM_FAILURES + $(jq '.suites[].suites[].specs[].tests[] | last(.results[]) | select(.status != "passed").status' <"${WORKSPACE}/results/pw-results-core-${RUN_ID}.json" | wc -l)))
echo "FAILURES=${NUM_FAILURES}" >>${GITHUB_OUTPUT}
sudo chown -R 1001:1001 "${WORKSPACE}/logs"
