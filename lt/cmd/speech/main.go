package main

import (
	"flag"
	"log"
	"os"
	"os/signal"
	"path/filepath"
	"sync"
	"syscall"
	"time"

	"github.com/aws/aws-sdk-go/aws"
	"github.com/aws/aws-sdk-go/aws/session"
	"github.com/aws/aws-sdk-go/service/polly"

	"github.com/mattermost/mattermost-plugin-calls/lt/client"
)

var script, siteURL, wsURL, channelID, teamID, userPassword, profile string
var setup bool

func main() {
	flag.StringVar(&script, "script", "script.txt", "Script for the tts, to be found in lt/scripts; assumes you will be running the lt program from the repo/lt directory")
	flag.StringVar(&siteURL, "siteURL", "http://localhost:8065", "Mattermost SiteURL")
	flag.StringVar(&wsURL, "wsURL", "ws://localhost:8065", "Mattermost wsURL")
	flag.StringVar(&channelID, "channelID", "", "ChannelID of the call")
	flag.StringVar(&teamID, "teamID", "", "TeamID of the call")
	flag.BoolVar(&setup, "setup", false, "setup users (needs teamID and valid sysadmin login)")
	flag.StringVar(&userPassword, "userPassword", "testPass123$", "password for users (default testPass123$)")
	flag.StringVar(&profile, "profile", "default", "named aws profile, located in .aws/config, see https://aws.github.io/aws-sdk-go-v2/docs/configuring-sdk/")
	flag.Parse()

	if channelID == "" {
		log.Fatalf("need a -channelID flag")
	}

	if script == "" {
		log.Fatalf("need a -script flag")
	}

	if setup && teamID == "" {
		log.Fatalf("need a -teamID flag")
	}

	if err := performScript(script); err != nil {
		log.Fatalf("error performing script: %v", err)
	}
}

func performScript(filename string) error {
	awsSess := session.Must(session.NewSessionWithOptions(session.Options{
		Profile:           profile,
		SharedConfigState: session.SharedConfigEnable,
	}))
	svc := polly.New(awsSess)

	f, err := os.Open(filepath.Join("scripts", filename))
	if err != nil {
		log.Fatalf("open script %s failed: %v", filename, err)
	}

	script, err := importScript(f)
	if err != nil {
		log.Fatalf("parsing script %s failed: %v", filename, err)
	}

	stopCh := make(chan struct{})
	var userWg sync.WaitGroup

	var userClients []*client.User
	for i, name := range script.users {
		user := client.NewUser(client.Config{
			Username:     name,
			Password:     userPassword,
			ChannelID:    channelID,
			SiteURL:      siteURL,
			WsURL:        wsURL,
			Duration:     24 * time.Hour,
			Speak:        true,
			Setup:        setup,
			TeamID:       teamID,
			PollySession: svc,
			PollyVoiceID: aws.String(script.voiceIDs[i]),
		})
		userClients = append(userClients, user)

		userWg.Add(1)
		go func() {
			defer userWg.Done()
			if err := user.Connect(stopCh); err != nil {
				log.Fatalf("connectUser failed: %s", err.Error())
			}
		}()
	}

	// "Conversation" logic
	go func() {
		time.Sleep(2 * time.Second) // time to take a sip of coffee before we talk talk talk

		for _, block := range script.blocks {
			time.Sleep(block.delay)

			var blockWg sync.WaitGroup
			for i, userIdx := range block.speakers {
				blockWg.Add(1)
				doneCh := userClients[userIdx].Speak(block.text[i])
				go func() {
					<-doneCh
					blockWg.Done()
				}()
			}

			blockWg.Wait()
		}

		close(stopCh)
	}()

	go func() {
		sig := make(chan os.Signal, 1)
		signal.Notify(sig, os.Interrupt, syscall.SIGINT, syscall.SIGTERM)
		<-sig
		close(stopCh)
	}()

	userWg.Wait()

	return nil
}
