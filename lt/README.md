# Calls load-test client

## Requirements

1. Golang and git installed.
2. A running Mattermost installation with Calls enabled.
3. A system admin account with username/password credentials used to automatically create resources (e.g. channels).
4. Open signups with no email verification to allow for the test users to join.
5. At least one open team where users can join without invitation.

## How to use

### Clone the repository

```
git clone https://github.com/mattermost/mattermost-plugin-calls.git && cd mattermost-plugin-calls
```

### Run on a team

```sh
cd ./lt && go run ./cmd/lt -url http://localhost:8065 \
  -team 11o73u33upfuprysuifa17dn5e \
  -calls 2 \
  -users-per-call 5 \
  -join-duration 10s \
  -duration 5m \
  -unmuted 1 \
  -screen-sharing 1
```

> **_Note_**
>
> The team should be open so that users can join.

> **_Note_**
>
> The load-test client will automatically create users and channels as needed through the provided admin account.

> **_Note_**
>
> This requires Calls to be enabled in all channels (Test mode = Off).

### Run on a single channel

It's also possible to run the load-test on a single channel by providing its ID instead of the team.

```sh
cd ./lt && go run ./cmd/lt -url http://localhost:8065 \
  -channel ebjjdnozn3gs5n7ozooesaubua \
  -calls 1 \
  -users-per-call 5 \
  -join-duration 10s \
  -duration 5m \
  -unmuted 1 \
  -screen-sharing 1
```

## Options

```
  -admin-password string
    	The password of a system admin account (default "Sys@dmin-sample1")
  -admin-username string
    	The username of a system admin account (default "sysadmin")
  -calls int
    	The number of calls to start (default 1)
  -channel string
    	The channel ID to start the call in
  -duration string
    	The total duration of the test (default "1m")
  -join-duration string
    	The amount of time it takes for all participants to join their calls (default "30s")
  -offset int
    	The user offset
  -recordings int
    	The number of calls to record
  -screen-sharing int
    	The number of users screen-sharing
  -setup
    	Whether or not setup actions like creating users, channels, teams and/or members should be executed. (default true)
  -simulcast
    	Whether or not to enable simulcast for screen
  -speech-file string
    	The path to a speech OGG file to read to simulate real voice samples (default "./lt/samples/speech_0.ogg")
  -team string
    	The team ID to start calls in
  -unmuted int
    	The number of unmuted users per call
  -url string
    	Mattermost SiteURL (default "http://localhost:8065")
  -user-password string
    	user password (default "testPass123$")
  -user-prefix string
    	The user prefix used to create and log in users (default "testuser-")
  -users-per-call int
    	The number of participants per call (default 1)
```

