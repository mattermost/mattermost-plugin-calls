#!/bin/bash
set -eu
set -o pipefail

docker network create ${DOCKER_NETWORK}

# Start server dependencies
echo "Starting server dependencies ... "
docker-compose -f ${DOCKER_COMPOSE_FILE} run -d --rm start_dependencies
timeout --foreground 90s bash -c "until docker-compose -f ${DOCKER_COMPOSE_FILE} exec -T postgres pg_isready ; do sleep 5 ; done"

cat ${DOCKER_COMPOSE_TEST_DATA} | docker-compose -f ${DOCKER_COMPOSE_FILE} exec -T openldap bash -c 'ldapadd -x -D "cn=admin,dc=mm,dc=test,dc=com" -w mostest'
docker-compose -f ${DOCKER_COMPOSE_FILE} exec -d -T minio sh -c 'mkdir -p /data/mattermost-test'

echo "Pulling ${IMAGE_CALLS_RECORDER} and ${IMAGE_CALLS_TRANSCRIBER} in order to be quickly accessible ... "
# Pull calls-recorder and calls-transcriber images to be used by calls-offloader.
docker pull --quiet ${IMAGE_CALLS_RECORDER}
docker pull --quiet ${IMAGE_CALLS_TRANSCRIBER}
# We retag the official images so they can be run instead of the expected local
# one (DEV_MODE=true). Alternatively we'd have to build our own image from scratch or make
# some CI specific changes on the offloader.
docker image tag ${IMAGE_CALLS_RECORDER} calls-recorder:master
docker image tag ${IMAGE_CALLS_TRANSCRIBER} calls-transcriber:master

echo "Spawning calls-offloader service with docker host access ..."
# Spawn calls offloader image as root to access local docker socket
docker run -d --quiet --user root --name "${COMPOSE_PROJECT_NAME}_callsoffloader" \
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

# Check that elasticsearch is ready
docker run --rm --quiet --name "${COMPOSE_PROJECT_NAME}_curl_elasticsearch" --net ${DOCKER_NETWORK} ${IMAGE_CURL} sh -c "until curl --max-time 5 --output - http://elasticsearch:9200; do echo Waiting for elasticsearch; sleep 5; done; echo elasticsearch is up"
