#!/bin/bash
set -eu
set -o pipefail

# Install Playbooks
echo "Installing playbooks ..."
docker exec \
  ${CONTAINER_SERVER} \
  sh -c "/mattermost/bin/mmctl --local plugin add /mattermost/prepackaged_plugins/mattermost-plugin-playbooks-*.tar.gz && /mattermost/bin/mmctl --local plugin enable playbooks"

# Copy built plugin into server
echo "Copying calls plugin into ${CONTAINER_SERVER} server container ..."
docker cp dist/*.tar.gz ${CONTAINER_SERVER}:/mattermost/bin/calls

# Install Calls
echo "Installing calls ..."
docker exec \
  ${CONTAINER_SERVER} \
  sh -c "/mattermost/bin/mmctl --local plugin add bin/calls"

# Generates a sysadmin that Playwright can use
echo "Generating sample data with mmctl ..."
docker exec \
  ${CONTAINER_SERVER} \
  sh -c "/mattermost/bin/mmctl --local sampledata"

echo "Spawning playwright image ..."
# run e2e
# `--network=container` tells this container to share a network stack
# with the server container. This means that `localhost` is the same
# interface for both. That's relevant because some browser APIs
# that Calls uses require a 'secure context', which is either HTTPS
# or localhost.
# https://docs.docker.com/engine/reference/run/#network-settings
# https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts
docker run -d --name playwright-e2e \
  --network=container:${CONTAINER_SERVER} \
  --entrypoint "" \
  mm-playwright \
  bash -c "npm ci && npx playwright install && npx playwright test --shard=${CI_NODE_INDEX}/${CI_NODE_TOTAL}"

docker logs -f playwright-e2e

docker cp playwright-e2e:/usr/src/calls-e2e/test-results results/test-results-${CI_NODE_INDEX}
docker cp playwright-e2e:/usr/src/calls-e2e/playwright-report results/playwright-report-${CI_NODE_INDEX}
docker cp playwright-e2e:/usr/src/calls-e2e/pw-results.json results/pw-results-${CI_NODE_INDEX}.json
