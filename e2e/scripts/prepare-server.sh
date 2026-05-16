#!/bin/bash
set -eu
set -o pipefail

function print_logs {
	docker logs ${CONTAINER_SERVER}1
	docker logs ${CONTAINER_SERVER}2
	docker logs ${CONTAINER_PROXY}
	docker logs ${CONTAINER_LIVEKIT}
}

trap print_logs EXIT

mkdir -p ${WORKSPACE}/logs
mkdir -p ${WORKSPACE}/config
mkdir -p ${WORKSPACE}/dotenv

# Remove mattermost server image to avoid caching issues.
docker rmi -f ${IMAGE_SERVER}

docker network create ${DOCKER_NETWORK}

# Start server dependencies (postgres, haproxy, livekit).
echo "Starting server dependencies ... "
DOCKER_NETWORK=${DOCKER_NETWORK} CONTAINER_PROXY=${CONTAINER_PROXY} docker compose -f ${DOCKER_COMPOSE_FILE} run -d --rm start_dependencies
timeout --foreground 90s bash -c "until docker compose -f ${DOCKER_COMPOSE_FILE} exec -T postgres pg_isready ; do sleep 5 ; done"

# Rename the livekit container so it matches CONTAINER_LIVEKIT for log access.
LIVEKIT_ID=$(docker compose -f ${DOCKER_COMPOSE_FILE} ps -q livekit)
docker rename "${LIVEKIT_ID}" "${CONTAINER_LIVEKIT}"

# Check that livekit is reachable on its signaling port. We omit -f because the
# response code for "/" varies across livekit-server versions; any HTTP response
# (i.e. successful TCP connect + HTTP roundtrip) proves the service is listening.
timeout --foreground 90s bash -c "until docker run --rm --quiet --name ${COMPOSE_PROJECT_NAME}_curl_livekit --net ${DOCKER_NETWORK} ${IMAGE_CURL} curl -s -o /dev/null --max-time 5 http://livekit:7880/; do echo Waiting for livekit; sleep 2; done; echo livekit is up"

## Print images info
docker images

## Add extra environment variables for mattermost server. This is needed to override configuration in HA since
## the config is stored in DB.
echo "MM_LICENSE=${MM_PLUGIN_CALLS_TEST_LICENSE}" >>${WORKSPACE}/dotenv/app.private.env
echo "MM_FEATUREFLAGS_BoardsProduct=true" >>${WORKSPACE}/dotenv/app.private.env
echo "MM_SERVICEENVIRONMENT=test" >>${WORKSPACE}/dotenv/app.private.env
echo "MM_CONFIG=postgres://mmuser:mostest@postgres/mattermost_test?sslmode=disable&connect_timeout=10&binary_parameters=yes" >>${WORKSPACE}/dotenv/app.private.env
echo "MM_SERVICESETTINGS_SITEURL=http://mm-server:8065" >>${WORKSPACE}/dotenv/app.private.env
echo "MM_SERVICESETTINGS_ENABLELOCALMODE=true" >>${WORKSPACE}/dotenv/app.private.env
echo "MM_SERVICESETTINGS_ENABLEDEVELOPER=true" >>${WORKSPACE}/dotenv/app.private.env
echo "MM_SERVICESETTINGS_ENABLETESTING=true" >>${WORKSPACE}/dotenv/app.private.env
echo "MM_SERVICESETTINGS_ALLOWCORSFROM=http://localhost:8065" >>${WORKSPACE}/dotenv/app.private.env
echo "MM_SERVICESETTINGS_ENABLEONBOARDINGFLOW=false" >>${WORKSPACE}/dotenv/app.private.env
echo "MM_SERVICESETTINGS_EXPERIMENTALSTRICTCSRFENFORCEMENT=true" >>${WORKSPACE}/dotenv/app.private.env
echo "MM_PLUGINSETTINGS_ENABLE=true" >>${WORKSPACE}/dotenv/app.private.env
echo "MM_PLUGINSETTINGS_ENABLEUPLOADS=true" >>${WORKSPACE}/dotenv/app.private.env
echo "MM_PLUGINSETTINGS_AUTOMATICPREPACKAGEDPLUGINS=false" >>${WORKSPACE}/dotenv/app.private.env
echo "MM_CLUSTERSETTINGS_ENABLE=true" >>${WORKSPACE}/dotenv/app.private.env
echo "MM_CLUSTERSETTINGS_CLUSTERNAME=mm_server_e2e" >>${WORKSPACE}/dotenv/app.private.env
echo "MM_LOGSETTINGS_CONSOLELEVEL=DEBUG" >>${WORKSPACE}/dotenv/app.private.env
echo "MM_LOGSETTINGS_FILELEVEL=DEBUG" >>${WORKSPACE}/dotenv/app.private.env
echo "MM_SQLSETTINGS_DATASOURCE=postgres://mmuser:mostest@postgres:5432/mattermost_test?sslmode=disable&connect_timeout=10&binary_parameters=yes" >>${WORKSPACE}/dotenv/app.private.env
echo "MM_EXPERIMENTALSETTINGS_DISABLEAPPBAR=false" >>${WORKSPACE}/dotenv/app.private.env
echo "MM_ANNOUNCEMENTSETTINGS_USERNOTICESENABLED=false" >>${WORKSPACE}/dotenv/app.private.env
echo "MM_ANNOUNCEMENTSETTINGS_ADMINNOTICESENABLED=false" >>${WORKSPACE}/dotenv/app.private.env

# LiveKit configuration consumed by the plugin via the generic MM_CALLS_* env-override
# mechanism in server/environment.go. Field names map to: LiveKitURL -> LIVE_KIT_URL, etc.
echo "MM_CALLS_LIVE_KIT_URL=${MM_CALLS_LIVE_KIT_URL}" >>${WORKSPACE}/dotenv/app.private.env
echo "MM_CALLS_LIVE_KIT_API_KEY=${MM_CALLS_LIVE_KIT_API_KEY}" >>${WORKSPACE}/dotenv/app.private.env
echo "MM_CALLS_LIVE_KIT_API_SECRET=${MM_CALLS_LIVE_KIT_API_SECRET}" >>${WORKSPACE}/dotenv/app.private.env

sudo cp -r ${WORKSPACE}/logs ${WORKSPACE}/logs1
sudo cp -r ${WORKSPACE}/config ${WORKSPACE}/config1
sudo chown -R 2000:2000 ${WORKSPACE}/logs1
sudo chown -R 2000:2000 ${WORKSPACE}/config1

sudo cp -r ${WORKSPACE}/logs ${WORKSPACE}/logs2
sudo cp -r ${WORKSPACE}/config ${WORKSPACE}/config2
sudo chown -R 2000:2000 ${WORKSPACE}/logs2
sudo chown -R 2000:2000 ${WORKSPACE}/config2

mkdir -p ${WORKSPACE}/mmdata
sudo chown -R 2000:2000 ${WORKSPACE}/mmdata

# Spawn mattermost server
echo "Spawning mattermost server 1 ... "
docker run -d --quiet --name ${CONTAINER_SERVER}1 \
	--net ${DOCKER_NETWORK} \
	--net-alias mm-server1 \
	--user mattermost \
	--env-file="${WORKSPACE}/dotenv/app.private.env" \
	-v ${WORKSPACE}/config1:/mattermost/config:rw \
	-v ${WORKSPACE}/logs1:/mattermost/logs:rw \
	-v ${WORKSPACE}/mmdata:/mattermost/data:rw \
	${IMAGE_SERVER}

echo "Checking node 1 is up and running"
timeout --foreground 90s bash -c "until docker run --rm --quiet --name ${COMPOSE_PROJECT_NAME}_curl_mm1 --net ${DOCKER_NETWORK} ${IMAGE_CURL} curl -fs http://mm-server1:8065/api/v4/system/ping; do echo Waiting for mm-server1; sleep 2; done; echo mm-server1 is up"

echo "Spawning mattermost server 2 ... "
docker run -d --quiet --name ${CONTAINER_SERVER}2 \
	--net ${DOCKER_NETWORK} \
	--net-alias mm-server2 \
	--user mattermost \
	--env-file="${WORKSPACE}/dotenv/app.private.env" \
	-v ${WORKSPACE}/config2:/mattermost/config:rw \
	-v ${WORKSPACE}/logs2:/mattermost/logs:rw \
	-v ${WORKSPACE}/mmdata:/mattermost/data:rw \
	${IMAGE_SERVER}

echo "Checking node 2 is up and running"
timeout --foreground 90s bash -c "until docker run --rm --quiet --name ${COMPOSE_PROJECT_NAME}_curl_mm2 --net ${DOCKER_NETWORK} ${IMAGE_CURL} curl -fs http://mm-server2:8065/api/v4/system/ping; do echo Waiting for mm-server2; sleep 2; done; echo mm-server2 is up"

echo "Checking proxy is up and running"
timeout --foreground 90s bash -c "until docker run --rm --quiet --name ${COMPOSE_PROJECT_NAME}_curl_proxy --net ${DOCKER_NETWORK} ${IMAGE_CURL} curl -fs http://mm-server:8065/api/v4/system/ping; do echo Waiting for proxy; sleep 2; done; echo proxy is up"
