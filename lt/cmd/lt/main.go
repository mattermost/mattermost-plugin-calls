package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"math/rand"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"

	"github.com/mattermost/mattermost-plugin-calls/lt/client"

	"github.com/mattermost/mattermost/server/public/model"
)

func main() {
	// TODO: consider using a config file instead.
	var teamID string
	var channelID string
	var siteURL string
	var userPassword string
	var userPrefix string
	var duration string
	var joinDuration string
	var adminUsername string
	var adminPassword string
	var offset int
	var numUnmuted int
	var numScreenSharing int
	var numCalls int
	var numUsersPerCall int
	var numRecordings int
	var setup bool
	var speechFile string

	flag.StringVar(&teamID, "team", "", "The team ID to start calls in")
	flag.StringVar(&channelID, "channel", "", "The channel ID to start the call in")
	flag.StringVar(&siteURL, "url", "http://localhost:8065", "Mattermost SiteURL")
	flag.StringVar(&userPrefix, "user-prefix", "testuser-", "The user prefix used to create and log in users")
	flag.StringVar(&userPassword, "user-password", "testPass123$", "user password")
	flag.IntVar(&numUnmuted, "unmuted", 0, "The number of unmuted users per call")
	flag.IntVar(&numScreenSharing, "screen-sharing", 0, "The number of users screen-sharing")
	flag.IntVar(&numRecordings, "recordings", 0, "The number of calls to record")
	flag.IntVar(&offset, "offset", 0, "The user offset")
	flag.IntVar(&numCalls, "calls", 1, "The number of calls to start")
	flag.IntVar(&numUsersPerCall, "users-per-call", 1, "The number of participants per call")
	flag.StringVar(&duration, "duration", "1m", "The total duration of the test")
	flag.StringVar(&joinDuration, "join-duration", "30s", "The amount of time it takes for all participants to join their calls")
	flag.StringVar(&adminUsername, "admin-username", "sysadmin", "The username of a system admin account")
	flag.StringVar(&adminPassword, "admin-password", "Sys@dmin-sample1", "The password of a system admin account")
	flag.BoolVar(&setup, "setup", true, "Whether or not setup actions like creating users, channels, teams and/or members should be executed.")
	flag.StringVar(&speechFile, "speech-file", "./samples/speech_0.ogg", "The path to a speech OGG file to read to simulate real voice samples")

	flag.Parse()

	if numCalls == 0 {
		log.Fatalf("calls should be > 0")
	}

	if channelID != "" && numCalls != 1 {
		log.Fatalf("number of calls should be 1 when running on a single channel")
	}

	if channelID == "" && teamID == "" {
		log.Fatalf("team must be set")
	}

	if !setup && (channelID == "" || teamID == "") {
		log.Fatalf("team and channel are required when running with setup disabled")
	}

	if numUsersPerCall == 0 {
		log.Fatalf("users-per-call should be > 0")
	}

	if siteURL == "" {
		log.Fatalf("siteURL must be set")
	}

	dur, err := time.ParseDuration(duration)
	if err != nil {
		log.Fatalf(err.Error())
	}

	joinDur, err := time.ParseDuration(joinDuration)
	if err != nil {
		log.Fatalf(err.Error())
	}

	if numUnmuted > numUsersPerCall {
		log.Fatalf("unmuted cannot be greater than the number of users per call")
	}

	if numScreenSharing > numCalls {
		log.Fatalf("screen-sharing cannot be greater than the number of calls")
	}

	if numRecordings > numCalls {
		log.Fatalf("recordings cannot be greater than the number of calls")
	}

	var channels []*model.Channel
	if setup {
		adminClient := model.NewAPIv4Client(siteURL)
		ctx, cancel := context.WithTimeout(context.Background(), client.HTTPRequestTimeout)
		defer cancel()
		_, _, err = adminClient.Login(ctx, adminUsername, adminPassword)
		if err != nil {
			log.Fatalf("failed to login as admin: %s", err.Error())
		}
		cancel()

		if channelID == "" {
			page := 0
			perPage := 100
			for {
				ctx, cancel = context.WithTimeout(context.Background(), client.HTTPRequestTimeout)
				chs, _, err := adminClient.SearchChannels(ctx, teamID, &model.ChannelSearch{
					Public:  true,
					PerPage: &perPage,
					Page:    &page,
				})
				cancel()
				if err != nil {
					log.Fatalf("failed to search channels: %s", err.Error())
				}
				channels = append(channels, chs...)
				if len(channels) >= numCalls || len(chs) < perPage {
					break
				}
				page++
			}

			if len(channels) < numCalls {
				channels = make([]*model.Channel, numCalls)
				for i := 0; i < numCalls; i++ {
					name := model.NewId()
					ctx, cancel = context.WithTimeout(context.Background(), client.HTTPRequestTimeout)
					channel, _, err := adminClient.CreateChannel(ctx, &model.Channel{
						TeamId:      teamID,
						Name:        name,
						DisplayName: "test-" + name,
						Type:        model.ChannelTypeOpen,
					})
					cancel()
					if err != nil {
						log.Fatalf("failed to create channel: %s", err.Error())
					}
					channels[i] = channel
				}
			}
		} else {
			ctx, cancel = context.WithTimeout(context.Background(), client.HTTPRequestTimeout)
			channel, _, err := adminClient.GetChannel(ctx, channelID, "")
			cancel()
			if err != nil {
				log.Fatalf("failed to search channels: %s", err.Error())
			}
			channels = append(channels, channel)
		}
	} else {
		channels = []*model.Channel{
			{
				Id:     channelID,
				TeamId: teamID,
			},
		}
	}

	stopCh := make(chan struct{})
	var wg sync.WaitGroup
	wg.Add(numUsersPerCall * numCalls)
	for j := 0; j < numCalls; j++ {
		log.Printf("starting call in %s", channels[j].DisplayName)
		for i := 0; i < numUsersPerCall; i++ {
			go func(idx int, channelID string, teamID string, unmuted, screenSharing, recording bool) {
				username := fmt.Sprintf("%s%d", userPrefix, idx)
				if unmuted {
					log.Printf("%s: going to transmit voice", username)
				}
				if screenSharing {
					log.Printf("%s: going to transmit screen", username)
				}
				defer wg.Done()

				ticker := time.NewTicker(time.Duration(rand.Intn(int(joinDur.Milliseconds())))*time.Millisecond + 1)
				defer ticker.Stop()
				select {
				case <-ticker.C:
				case <-stopCh:
					return
				}

				cfg := client.Config{
					Username:      username,
					Password:      userPassword,
					TeamID:        teamID,
					ChannelID:     channelID,
					SiteURL:       siteURL,
					Duration:      dur,
					Unmuted:       unmuted,
					ScreenSharing: screenSharing,
					Recording:     recording,
					Setup:         setup,
					SpeechFile:    speechFile,
				}

				user := client.NewUser(cfg)
				if err := user.Connect(stopCh); err != nil {
					log.Printf("connectUser failed: %s", err.Error())
				}
			}((numUsersPerCall*j)+i+offset, channels[j].Id, channels[j].TeamId, i < numUnmuted, i == 0 && j < numScreenSharing, j < numRecordings)
		}
	}

	go func() {
		sig := make(chan os.Signal, 1)
		signal.Notify(sig, os.Interrupt, syscall.SIGINT, syscall.SIGTERM)
		<-sig
		close(stopCh)
	}()

	wg.Wait()

	fmt.Println("DONE")
}
