package main

import (
	"log"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"

	"github.com/mattermost/mattermost-plugin-calls/lt/client"
)

func main() {
	stopCh := make(chan struct{})
	var wg sync.WaitGroup
	wg.Add(2)

	siteURL := "http://localhost:8065"
	channelID := "kc6yoe75btbapqtsp6wcarucpe"
	wsURL := "ws://localhost:8065"
	userPassword := "testPass123$"
	duration := 10 * time.Minute

	userA := client.NewUser(client.Config{
		Username:  "testuser-0",
		Password:  userPassword,
		ChannelID: channelID,
		SiteURL:   siteURL,
		WsURL:     wsURL,
		Duration:  duration,
		Speak:     true,
	})
	go func() {
		defer wg.Done()
		if err := userA.Connect(stopCh); err != nil {
			log.Fatalf("connectUser failed: %s", err.Error())
		}
	}()

	userB := client.NewUser(client.Config{
		Username:  "testuser-1",
		Password:  userPassword,
		ChannelID: channelID,
		SiteURL:   siteURL,
		WsURL:     wsURL,
		Duration:  duration,
		Speak:     true,
	})
	go func() {
		defer wg.Done()
		if err := userB.Connect(stopCh); err != nil {
			log.Fatalf("connectUser failed: %s", err.Error())
		}
	}()

	// "Conversation" logic
	go func() {
		userA.Speak("Hi, this is user A")
		time.Sleep(4 * time.Second)
		userB.Speak("Hi user A, this is user B responding")
		time.Sleep(4 * time.Second)
		userA.Speak("Nice to meet you user B!")
	}()

	go func() {
		sig := make(chan os.Signal, 1)
		signal.Notify(sig, os.Interrupt, syscall.SIGINT, syscall.SIGTERM)
		<-sig
		close(stopCh)
	}()

	wg.Wait()
}
