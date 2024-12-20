#!/bin/bash
set -eu
set -o pipefail

function print_logs {
	docker logs ${CONTAINER_SERVER}1
	docker logs ${CONTAINER_SERVER}2
	docker logs ${CONTAINER_PROXY}
	docker logs ${CONTAINER_RTCD}
	docker logs ${CONTAINER_OFFLOADER}
}

trap print_logs EXIT

mkdir -p ${WORKSPACE}/logs
mkdir -p ${WORKSPACE}/config
mkdir -p ${WORKSPACE}/dotenv

docker network create ${DOCKER_NETWORK}

# Start server dependencies
echo "Starting server dependencies ... "
DOCKER_NETWORK=${DOCKER_NETWORK} CONTAINER_PROXY=${CONTAINER_PROXY} docker compose -f ${DOCKER_COMPOSE_FILE} run -d --rm start_dependencies
timeout --foreground 90s bash -c "until docker compose -f ${DOCKER_COMPOSE_FILE} exec -T postgres pg_isready ; do sleep 5 ; done"

echo "Pulling ${IMAGE_CALLS_RECORDER} in order to be quickly accessible ... "
# Pull calls-recorder image to be used by calls-offloader.
docker pull ${IMAGE_CALLS_RECORDER}

echo "Pulling ${IMAGE_CALLS_TRANSCRIBER} in order to be quickly accessible ... "
# Pull calls-transcriber image to be used by calls-offloader.
docker pull ${IMAGE_CALLS_TRANSCRIBER}

# We retag the official images so they can be run instead of the expected local
# one (DEV_MODE=true). Alternatively we'd have to build our own image from scratch or make
# some CI specific changes on the offloader.
docker image tag ${IMAGE_CALLS_RECORDER} calls-recorder:master
docker image tag ${IMAGE_CALLS_TRANSCRIBER} calls-transcriber:master

## Load rtcd image
docker load --input ${RTCD_IMAGE_PATH}

## Print images info
docker images

echo "Spawning RTCD service..."
docker run -d --quiet --name "${CONTAINER_RTCD}" \
	--net ${DOCKER_NETWORK} \
	--env "RTCD_LOGGER_ENABLEFILE=false" \
	--env "RTCD_LOGGER_CONSOLELEVEL=DEBUG" \
	--env "RTCD_API_SECURITY_ALLOWSELFREGISTRATION=true" \
	--network-alias=rtcd "rtcd:e2e"

# Check that rtcd is up and ready
docker run --rm --quiet --name "${COMPOSE_PROJECT_NAME}_curl_rtcd" --net ${DOCKER_NETWORK} ${IMAGE_CURL} sh -c "until curl -fs http://rtcd:8045/version; do echo Waiting for rtcd; sleep 5; done; echo rtcd is up"

echo "Spawning calls-offloader service with docker host access ..."
# Spawn calls offloader image as root to access local docker socket
docker run -d --quiet --user root --name "${CONTAINER_OFFLOADER}" \
	-v /var/run/docker.sock:/var/run/docker.sock:rw \
	--net ${DOCKER_NETWORK} \
	--env "API_SECURITY_ALLOWSELFREGISTRATION=true" \
	--env "JOBS_MAXCONCURRENTJOBS=20" \
	--env "LOGGER_ENABLEFILE=false" \
	--env "LOGGER_CONSOLELEVEL=DEBUG" \
	--env "DEV_MODE=true" \
	--env "DOCKER_NETWORK=${DOCKER_NETWORK}" \
	--network-alias=calls-offloader ${IMAGE_CALLS_OFFLOADER}

# Check that calls-offloader is up and ready
docker run --rm --quiet --name "${COMPOSE_PROJECT_NAME}_curl_callsoffloader" --net ${DOCKER_NETWORK} ${IMAGE_CURL} sh -c "until curl -fs http://calls-offloader:4545/version; do echo Waiting for calls-offloader; sleep 5; done; echo calls-offloader is up"

## Add extra environment variables for mattermost server. This is needed to override configuration in HA since
## the config is stored in DB.
echo "MM_LICENSE=${MM_PLUGIN_CALLS_TEST_LICENSE}" >>${WORKSPACE}/dotenv/app.private.env
echo "MM_FEATUREFLAGS_BoardsProduct=true" >>${WORKSPACE}/dotenv/app.private.env
echo "MM_SERVICEENVIRONMENT=test" >>${WORKSPACE}/dotenv/app.private.env
echo "MM_CALLS_JOB_SERVICE_URL=http://calls-offloader:4545" >>${WORKSPACE}/dotenv/app.private.env
echo "MM_CALLS_RTCD_SERVICE_URL=http://rtcd:8045" >>${WORKSPACE}/dotenv/app.private.env
echo "MM_CONFIG=postgres://mmuser:mostest@postgres/mattermost_test?sslmode=disable&connect_timeout=10&binary_parameters=yes" >>${WORKSPACE}/dotenv/app.private.env
echo "MM_SERVICESETTINGS_SITEURL=http://mm-server:8065" >>${WORKSPACE}/dotenv/app.private.env
echo "MM_SERVICESETTINGS_ENABLELOCALMODE=true" >>${WORKSPACE}/dotenv/app.private.env
echo "MM_SERVICESETTINGS_ENABLEDEVELOPER=true" >>${WORKSPACE}/dotenv/app.private.env
echo "MM_SERVICESETTINGS_ENABLETESTING=true" >>${WORKSPACE}/dotenv/app.private.env
echo "MM_SERVICESETTINGS_ALLOWCORSFROM=http://localhost:8065" >>${WORKSPACE}/dotenv/app.private.env
echo "MM_SERVICESETTINGS_ENABLEONBOARDINGFLOW=false" >>${WORKSPACE}/dotenv/app.private.env
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
	--user mattermost:mattermost \
	--env-file="${WORKSPACE}/dotenv/app.private.env" \
	-v ${WORKSPACE}/config1:/mattermost/config:rw \
	-v ${WORKSPACE}/logs1:/mattermost/logs:rw \
	-v ${WORKSPACE}/mmdata:/mattermost/data:rw \
	${IMAGE_SERVER} \
	sh -c "/mattermost/bin/mattermost server"

echo "Checking node 1 is up and running"
timeout --foreground 90s bash -c "until docker run --rm --quiet --name ${COMPOSE_PROJECT_NAME}_curl_mm1 --net ${DOCKER_NETWORK} ${IMAGE_CURL} curl -fs http://mm-server1:8065/api/v4/system/ping; do echo Waiting for mm-server1; sleep 2; done; echo mm-server1 is up"

echo "Spawning mattermost server 2 ... "
docker run -d --quiet --name ${CONTAINER_SERVER}2 \
	--net ${DOCKER_NETWORK} \
	--net-alias mm-server2 \
	--user mattermost:mattermost \
	--env-file="${WORKSPACE}/dotenv/app.private.env" \
	-v ${WORKSPACE}/config2:/mattermost/config:rw \
	-v ${WORKSPACE}/logs2:/mattermost/logs:rw \
	-v ${WORKSPACE}/mmdata:/mattermost/data:rw \
	${IMAGE_SERVER} \
	sh -c "/mattermost/bin/mattermost server"

echo "Checking node 2 is up and running"
timeout --foreground 90s bash -c "until docker run --rm --quiet --name ${COMPOSE_PROJECT_NAME}_curl_mm2 --net ${DOCKER_NETWORK} ${IMAGE_CURL} curl -fs http://mm-server2:8065/api/v4/system/ping; do echo Waiting for mm-server2; sleep 2; done; echo mm-server2 is up"

echo "Checking proxy is up and running"
timeout --foreground 90s bash -c "until docker run --rm --quiet --name ${COMPOSE_PROJECT_NAME}_curl_proxy --net ${DOCKER_NETWORK} ${IMAGE_CURL} curl -fs http://mm-server:8065/api/v4/system/ping; do echo Waiting for proxy; sleep 2; done; echo proxy is up"
