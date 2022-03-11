# Calls load-test client

## Sample usage

```sh
go run ./lt/client.go -team 11o73u33upfuprysuifa17dn5e -channel 71mw3ynt5jdwbyo34j4kmegwyo -url http://localhost:8065/ -users 10 -join-duration 10s -duration 60s -unmuted 1
```

## Options

```
  -channel string
    	channel ID
  -duration string
    	duration (default "1m")
  -join-duration string
    	join duration (default "30s")
  -offset int
    	users offset
  -password string
    	user password (default "testPass123$")
  -team string
    	team ID
  -unmuted int
    	number of unmuted users
  -url string
    	MM SiteURL (default "http://localhost:8065")
  -user-prefix string
    	user prefix (default "testuser-")
  -users int
    	number of users to connect (default 1)
```

