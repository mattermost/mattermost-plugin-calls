package main

import (
	"log"
	"math/rand"
	"time"
)

type event string

const (
	eventMute        event = "custom_com.mattermost.calls_mute"
	eventUnmute      event = "custom_com.mattermost.calls_unmute"
	eventVoiceOn     event = "custom_com.mattermost.calls_voice_on"
	eventVoiceOff    event = "custom_com.mattermost.calls_voice_off"
	eventRaiseHand   event = "custom_com.mattermost.calls_raise_hand"
	eventUnraiseHand event = "custom_com.mattermost.calls_unraise_hand"
	eventNoop        event = "noop"
	eventLeave       event = "leave"
	eventJoin        event = "join"
)

type state int
type transition struct {
	action event
	result state
}

const (
	mutedLoweredHand state = iota
	mutedRaisedHand
	unmutedLoweredHand
	unmutedLoweredHandSpeaking
	unmutedRaisedHand
	unmutedRaisedHandSpeaking
	outOfCall
)

var transitionTable = map[state][]transition{
	mutedLoweredHand: {
		{eventRaiseHand, mutedRaisedHand},
		{eventUnmute, unmutedLoweredHand},
		{eventLeave, outOfCall},
	},
	mutedRaisedHand: {
		{eventUnraiseHand, mutedLoweredHand},
		{eventUnmute, unmutedRaisedHand},
	},
	unmutedLoweredHand: {
		{eventVoiceOn, unmutedLoweredHandSpeaking},
		{eventRaiseHand, unmutedRaisedHand},
		{eventMute, mutedLoweredHand},
	},
	unmutedLoweredHandSpeaking: {
		{eventVoiceOff, unmutedLoweredHand},
		{eventRaiseHand, unmutedRaisedHandSpeaking},
		{eventNoop, unmutedLoweredHandSpeaking}, // we want more speaking to happen
		{eventNoop, unmutedLoweredHandSpeaking}, // we want more speaking to happen
	},
	unmutedRaisedHand: {
		{eventVoiceOn, unmutedRaisedHandSpeaking},
		{eventMute, mutedRaisedHand},
		{eventUnraiseHand, unmutedLoweredHand},
	},
	unmutedRaisedHandSpeaking: {
		{eventVoiceOff, unmutedRaisedHand},
		{eventUnraiseHand, unmutedLoweredHandSpeaking},
		{eventNoop, unmutedRaisedHandSpeaking}, // we want more speaking to happen
		{eventNoop, unmutedRaisedHandSpeaking}, // we want more speaking to happen
	},
	outOfCall: {
		{eventJoin, mutedLoweredHand},
	},
}

func (u *user) simulateBehavior(interval time.Duration, stopCh chan struct{}) {
	// Wait for the connection to be established
	<-u.connectedCh
	curState := mutedLoweredHand

	ticker := time.NewTicker(addJitter(interval))
	defer func() {
		ticker.Stop()
	}()

	for {
		select {
		case <-ticker.C:
			next := randFrom(transitionTable[curState])

			u.doAction(next.action, stopCh)
			curState = next.result

			// add some jitter to next tick
			ticker.Reset(addJitter(interval))
		case <-u.doneCh:
			log.Printf("%s: finished sim", u.cfg.username)
			return
		}
	}
}

// addJitter adds 1/10th +/- jitter
func addJitter(interval time.Duration) time.Duration {
	jitter := rand.Intn(int(interval.Milliseconds()/5)) - int(interval.Milliseconds()/10)
	return interval + time.Duration(jitter)*time.Millisecond
}

func randFrom(choices []transition) transition {
	// TODO: add weighted probabilities?
	idx := rand.Intn(len(choices))
	return choices[idx]
}

func (u *user) doAction(e event, stopCh chan struct{}) {
	switch e {
	case eventJoin:
		if !u.cfg.simJoinLeave {
			return
		}
		log.Printf("%s: resetting channels and connecting...", u.cfg.username)
		u.resetChannels()
		go func() {
			if err := u.ConnectToCall(stopCh); err != nil {
				log.Printf("%s: ConnectToCall failed: %s", u.cfg.username, err.Error())
			}
		}()
	case eventLeave:
		if !u.cfg.simJoinLeave {
			return
		}
		log.Printf("%s: leaving call", u.cfg.username)
		close(u.wsCloseCh)
	case eventNoop:
		return
	default:
		u.wsSendCh <- wsMsg{event: string(e)}
	}
}
