# Calls load-test client

## Sample usage

```sh
go run ./lt/client.go -team 11o73u33upfuprysuifa17dn5e -url http://localhost:8065/ -calls 2 -users-per-call 5 -join-duration 10s -duration 60s -unmuted 1 -screen-sharing 1
```

## Options

```
  -admin-password string
    	admin password (default "Sys@dmin-sample1")
  -admin-username string
    	admin username (default "sysadmin")
  -calls int
    	number of calls (default 1)
  -duration string
    	duration (default "1m")
  -join-duration string
    	join duration (default "30s")
  -offset int
    	users offset
  -screen-sharing int
    	number of users screen-sharing
  -team string
    	team ID
  -unmuted int
    	number of unmuted users per call
  -url string
    	MM SiteURL (default "http://localhost:8065")
  -user-password string
    	user password (default "testPass123$")
  -user-prefix string
    	user prefix (default "testuser-")
  -users-per-call int
    	number of users per call (default 1)
  -sim bool
    	simulate user interactions, e.g.: raise/lower hand, unmute/mute, voice on/off, leave/join (default false)
  -sim-interval string
    	rough interval between user actions during simulation
```

