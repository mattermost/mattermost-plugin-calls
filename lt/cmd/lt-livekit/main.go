// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// lt-livekit is a load-test client for the LiveKit PoC branch of the Calls plugin.
// Each simulated user:
//   - logs in to Mattermost (creating the account if needed)
//   - joins the target channel
//   - sends WS join/leave messages so the plugin tracks call state
//   - connects to the LiveKit room and optionally publishes audio (OGG) and/or video (IVF)
//
// Single existing user (one-off testing):
//
//	go run ./cmd/lt-livekit \
//	  -url http://localhost:8065 \
//	  -channel <channelID> \
//	  -username sysadmin \
//	  -user-password Sys@dmin-sample1 \
//	  -unmuted 1
//
// Multiple simulated users publishing audio:
//
//	go run ./cmd/lt-livekit \
//	  -url http://localhost:8065 \
//	  -channel <channelID> \
//	  -users 10 \
//	  -unmuted 10 \
//	  -duration 2m
package main

import (
	"flag"
	"fmt"
	"log"
	"log/slog"
	"math/rand"
	"os"
	"os/signal"
	"strings"
	"sync"
	"syscall"
	"time"

	lklt "github.com/mattermost/mattermost-plugin-calls/lt/livekit"
)

const pkgPrefix = "github.com/mattermost/mattermost-plugin-calls/lt/"

func slogReplaceAttr(_ []string, a slog.Attr) slog.Attr {
	if a.Key == slog.SourceKey {
		source := a.Value.Any().(*slog.Source)
		if idx := strings.Index(source.File, pkgPrefix); idx >= 0 {
			source.File = source.File[idx+len(pkgPrefix):]
		}
	}
	return a
}

func main() {
	logger := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{
		AddSource:   true,
		Level:       slog.LevelDebug,
		ReplaceAttr: slogReplaceAttr,
	}))
	slog.SetDefault(logger)

	var (
		siteURL       string
		channelID     string
		teamID        string
		username      string
		userPrefix    string
		userPassword  string
		adminUsername string
		adminPassword string
		numUsers      int
		numUnmuted    int
		numVideo      int
		offset        int
		duration      string
		joinDuration  string
		speechFile    string
		videoFile     string
		setup         bool
	)

	flag.StringVar(&siteURL, "url", "http://localhost:8065", "Mattermost SiteURL")
	flag.StringVar(&channelID, "channel", "", "Channel ID to join the call in (required)")
	flag.StringVar(&teamID, "team", "", "Team ID (used when setup is enabled)")
	flag.StringVar(&username, "username", "", "Use a single existing account instead of the prefix+index pattern (implies -users 1 -setup false)")
	flag.StringVar(&userPrefix, "user-prefix", "testuser-", "Prefix for simulated usernames")
	flag.StringVar(&userPassword, "user-password", "testPass123$", "Password for simulated users")
	flag.StringVar(&adminUsername, "admin-username", "sysadmin", "Admin username (used for setup)")
	flag.StringVar(&adminPassword, "admin-password", "Sys@dmin-sample1", "Admin password (used for setup)")
	flag.IntVar(&numUsers, "users", 1, "Number of concurrent simulated users")
	flag.IntVar(&numUnmuted, "unmuted", 0, "Number of users that publish audio")
	flag.IntVar(&numVideo, "video", 0, "Number of users that publish video")
	flag.IntVar(&offset, "offset", 0, "User index offset (first user = testuser-<offset>)")
	flag.StringVar(&duration, "duration", "1m", "How long each user stays in the call")
	flag.StringVar(&joinDuration, "join-duration", "10s", "Time window over which users stagger their joins")
	flag.StringVar(&speechFile, "speech-file", "./samples/speech_0.ogg", "OGG/Opus file to stream as audio")
	flag.StringVar(&videoFile, "video-file", "", "IVF/VP8 file to stream as video (default: ./samples/video_h.ivf)")
	flag.BoolVar(&setup, "setup", true, "Create users and join channels/teams automatically")

	flag.Parse()

	if username != "" {
		numUsers = 1
		setup = false
	}

	if channelID == "" {
		log.Fatal("-channel is required")
	}
	if numUsers <= 0 {
		log.Fatal("-users must be > 0")
	}
	if numUnmuted > numUsers {
		log.Fatal("-unmuted cannot exceed -users")
	}
	if numVideo > numUsers {
		log.Fatal("-video cannot exceed -users")
	}

	dur, err := time.ParseDuration(duration)
	if err != nil {
		log.Fatalf("invalid -duration: %s", err)
	}
	joinDur, err := time.ParseDuration(joinDuration)
	if err != nil {
		log.Fatalf("invalid -join-duration: %s", err)
	}

	stopCh := make(chan struct{})
	go func() {
		sig := make(chan os.Signal, 1)
		signal.Notify(sig, os.Interrupt, syscall.SIGTERM)
		<-sig
		close(stopCh)
	}()

	var wg sync.WaitGroup
	wg.Add(numUsers)

	for i := 0; i < numUsers; i++ {
		go func(idx int, unmuted, video bool) {
			defer wg.Done()

			username := username
		if username == "" {
			username = fmt.Sprintf("%s%d", userPrefix, idx)
		}
			userLogger := logger.With(slog.String("username", username))

			// Stagger joins randomly within the join window.
			if joinDur > 0 {
				delay := time.Duration(rand.Int63n(int64(joinDur))) + time.Millisecond
				timer := time.NewTimer(delay)
				select {
				case <-timer.C:
				case <-stopCh:
					timer.Stop()
					return
				}
			}

			cfg := lklt.Config{
				Username:  username,
				Password:  userPassword,
				TeamID:    teamID,
				ChannelID: channelID,
				SiteURL:   siteURL,
				Duration:  dur,
				Unmuted:   unmuted,
				Video:     video,
				SpeechFile: speechFile,
				VideoFile: videoFile,
				Setup:     setup,
			}

			user := lklt.NewUser(cfg, userLogger)
			if err := user.Connect(stopCh); err != nil {
				userLogger.Error("connect failed", slog.String("err", err.Error()))
			}
		}(i+offset, i < numUnmuted, i < numVideo)
	}

	wg.Wait()
	fmt.Println("DONE")
}
