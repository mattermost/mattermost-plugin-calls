// Copyright (c) 2022-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"context"
	"database/sql"
	"fmt"
	"sync"
	"sync/atomic"
	"time"

	"golang.org/x/time/rate"

	"github.com/mattermost/mattermost-plugin-calls/server/cluster"
	"github.com/mattermost/mattermost-plugin-calls/server/enterprise"
	"github.com/mattermost/mattermost-plugin-calls/server/performance"
	"github.com/mattermost/mattermost-plugin-calls/server/telemetry"

	"github.com/mattermost/rtcd/service/rtc"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/plugin"
)

// Plugin implements the interface expected by the Mattermost server to communicate between the server and plugin processes.
type Plugin struct {
	plugin.MattermostPlugin
	licenseChecker *enterprise.LicenseChecker

	// configurationLock synchronizes access to the configuration.
	configurationLock sync.RWMutex
	// configuration is the active plugin configuration. Consult getConfiguration and
	// setConfiguration for usage.
	configuration *configuration

	metrics   *performance.Metrics
	telemetry *telemetry.Client

	mut         sync.RWMutex
	nodeID      string // the node cluster id
	stopCh      chan struct{}
	clusterEvCh chan model.PluginClusterEvent
	sessions    map[string]*session

	rtcServer   *rtc.Server
	rtcdManager *rtcdClientManager

	jobService *jobService

	// A map of userID -> limiter to implement basic, user based API rate-limiting.
	// TODO: consider moving this to a dedicated API object.
	apiLimiters    map[string]*rate.Limiter
	apiLimitersMut sync.RWMutex

	botSession *model.Session

	// A map of callID -> *cluster.Mutex to guarantee atomicity of call state
	// operations.
	callsClusterLocks map[string]*cluster.Mutex

	// Database handle to the writer DB node
	wDB        *sql.DB
	driverName string
}

func (p *Plugin) startSession(us *session, senderID string) {
	cfg := rtc.SessionConfig{
		GroupID:   "default",
		CallID:    us.channelID,
		UserID:    us.userID,
		SessionID: us.connID,
	}
	if err := p.rtcServer.InitSession(cfg, func() error {
		p.LogDebug("rtc session close cb", "sessionID", us.connID)
		if atomic.CompareAndSwapInt32(&us.rtcClosed, 0, 1) {
			close(us.rtcCloseCh)
		}
		return p.removeSession(us)
	}); err != nil {
		p.LogError(err.Error(), "sessionConfig", fmt.Sprintf("%+v", cfg))
		return
	}

	defer func() {
		p.LogDebug("closing rtc session", "sessionID", us.connID)
		if err := p.rtcServer.CloseSession(us.connID); err != nil {
			p.LogError("failed to close session", "error", err.Error())
		}
	}()

	for {
		select {
		case m, ok := <-us.signalOutCh:
			if !ok {
				return
			}
			clusterMsg := clusterMessage{
				ConnID:    us.connID,
				UserID:    us.userID,
				ChannelID: us.channelID,
				SenderID:  p.nodeID,
				ClientMessage: clientMessage{
					Type: clientMessageTypeSDP,
					Data: m,
				},
			}
			if err := p.sendClusterMessage(clusterMsg, clusterMessageTypeSignaling, senderID); err != nil {
				p.LogError(err.Error())
			}
		case <-us.rtcCloseCh:
			return
		}
	}
}

func (p *Plugin) OnPluginClusterEvent(_ *plugin.Context, ev model.PluginClusterEvent) {
	select {
	case p.clusterEvCh <- ev:
	default:
		p.LogError("too many cluster events, channel is full, dropping.")
	}
}

func (p *Plugin) handleEvent(ev model.PluginClusterEvent) error {
	p.LogDebug("got cluster event", "type", ev.Id)

	var msg clusterMessage
	if err := msg.FromJSON(ev.Data); err != nil {
		return err
	}

	switch clusterMessageType(ev.Id) {
	case clusterMessageTypeConnect:
		p.LogDebug("connect event", "ChannelID", msg.ChannelID, "UserID", msg.UserID, "ConnID", msg.ConnID)
		p.mut.Lock()
		defer p.mut.Unlock()
		us := p.sessions[msg.ConnID]
		if us != nil {
			return fmt.Errorf("session already exists, userID=%q, connID=%q, channelID=%q",
				us.userID, msg.ConnID, us.channelID)
		}
		us = newUserSession(msg.UserID, msg.ChannelID, msg.ConnID, true)
		p.sessions[msg.ConnID] = us
		go p.startSession(us, msg.SenderID)
		return nil
	case clusterMessageTypeReconnect:
		p.LogDebug("reconnect event", "UserID", msg.UserID, "ConnID", msg.ConnID)

		p.mut.Lock()
		defer p.mut.Unlock()

		us := p.sessions[msg.ConnID]
		if us == nil {
			return nil
		}

		if atomic.CompareAndSwapInt32(&us.wsReconnected, 0, 1) {
			p.LogDebug("closing reconnectCh", "connID", msg.ConnID)
			close(us.wsReconnectCh)
			if !us.rtc {
				delete(p.sessions, us.connID)
			}
		} else {
			return fmt.Errorf("session already reconnected, connID=%q", msg.ConnID)
		}

		return nil
	case clusterMessageTypeLeave:
		p.LogDebug("leave event", "UserID", msg.UserID, "ConnID", msg.ConnID)

		p.mut.RLock()
		us := p.sessions[msg.ConnID]
		p.mut.RUnlock()

		if us == nil {
			return nil
		}

		if atomic.CompareAndSwapInt32(&us.left, 0, 1) {
			p.LogDebug("closing leaveCh", "connID", msg.ConnID)
			close(us.leaveCh)
		}
	case clusterMessageTypeDisconnect:
		p.LogDebug("disconnect event", "ChannelID", msg.ChannelID, "UserID", msg.UserID, "ConnID", msg.ConnID)
		p.mut.RLock()
		us := p.sessions[msg.ConnID]
		p.mut.RUnlock()
		if us == nil {
			return fmt.Errorf("session doesn't exist, ev=%s, userID=%q, connID=%q, channelID=%q",
				ev.Id, msg.UserID, msg.ConnID, msg.ChannelID)
		}
		if atomic.CompareAndSwapInt32(&us.rtcClosed, 0, 1) {
			close(us.rtcCloseCh)
		}
		return nil
	case clusterMessageTypeSignaling:
		p.LogDebug("signaling event", "ChannelID", msg.ChannelID, "UserID", msg.UserID, "ConnID", msg.ConnID)
		p.mut.RLock()
		us := p.sessions[msg.ConnID]
		p.mut.RUnlock()

		if us == nil {
			return fmt.Errorf("session doesn't exist, ev=%s, userID=%q, connID=%q, channelID=%q",
				ev.Id, msg.UserID, msg.ConnID, msg.ChannelID)
		}
		if msg.ClientMessage.Type != clientMessageTypeSDP && msg.ClientMessage.Type != clientMessageTypeICE {
			return fmt.Errorf("unexpected client message type %q", msg.ClientMessage.Type)
		}

		msgType := rtc.SDPMessage
		if msg.ClientMessage.Type == clientMessageTypeICE {
			msgType = rtc.ICEMessage
		}
		rtcMsg := rtc.Message{
			SessionID: us.connID,
			Type:      msgType,
			Data:      msg.ClientMessage.Data,
		}

		if err := p.sendRTCMessage(rtcMsg, us.channelID); err != nil {
			return fmt.Errorf("failed to send RTC message: %w", err)
		}
	case clusterMessageTypeUserState:
		p.LogDebug("user state event", "ChannelID", msg.ChannelID, "UserID", msg.UserID, "ConnID", msg.ConnID)
		p.mut.RLock()
		us := p.sessions[msg.ConnID]
		p.mut.RUnlock()

		if us == nil {
			return fmt.Errorf("session doesn't exist, ev=%s, userID=%q, connID=%q, channelID=%q",
				ev.Id, msg.UserID, msg.ConnID, msg.ChannelID)
		}

		var msgType rtc.MessageType
		switch msg.ClientMessage.Type {
		case clientMessageTypeMute:
			msgType = rtc.MuteMessage
		case clientMessageTypeUnmute:
			msgType = rtc.UnmuteMessage
		case clientMessageTypeScreenOn:
			msgType = rtc.ScreenOnMessage
		case clientMessageTypeScreenOff:
			msgType = rtc.ScreenOffMessage
		default:
			return fmt.Errorf("unexpected client message type %q", msg.ClientMessage.Type)
		}

		rtcMsg := rtc.Message{
			SessionID: us.connID,
			Type:      msgType,
			Data:      msg.ClientMessage.Data,
		}

		if err := p.sendRTCMessage(rtcMsg, us.channelID); err != nil {
			return fmt.Errorf("failed to send RTC message: %w", err)
		}
	default:
		return fmt.Errorf("unexpected event type %q", ev.Id)
	}

	return nil
}

func (p *Plugin) clusterEventsHandler() {
	for {
		select {
		case ev := <-p.clusterEvCh:
			if err := p.handleEvent(ev); err != nil {
				p.LogError(err.Error())
			}
		case <-p.stopCh:
			return
		}
	}
}

func (p *Plugin) startNewCallPost(state *channelState, userID, channelID, title, threadID string) (string, string, error) {
	user, appErr := p.API.GetUser(userID)
	if appErr != nil {
		return "", "", appErr
	}

	cfg := p.API.GetConfig()
	if cfg == nil {
		return "", "", fmt.Errorf("failed to get configuration")
	}

	showFullName := cfg.PrivacySettings.ShowFullName != nil && *cfg.PrivacySettings.ShowFullName

	var postMsg string
	if user.FirstName != "" && user.LastName != "" && showFullName {
		postMsg = fmt.Sprintf("%s %s started a call", user.FirstName, user.LastName)
	} else {
		postMsg = fmt.Sprintf("%s started a call", user.Username)
	}

	slackAttachment := model.SlackAttachment{
		Fallback: postMsg,
		Title:    postMsg,
		Text:     postMsg,
	}

	post := &model.Post{
		UserId:    userID,
		ChannelId: channelID,
		RootId:    threadID,
		Message:   postMsg,
		Type:      "custom_calls",
		Props: map[string]interface{}{
			"attachments": []*model.SlackAttachment{&slackAttachment},
			"start_at":    state.Call.StartAt,
			"title":       title,
		},
	}

	createdPost, appErr := p.API.CreatePost(post)
	if appErr != nil {
		return "", "", appErr
	}
	if threadID == "" {
		threadID = createdPost.Id
	}

	state.Call.PostID = createdPost.Id
	state.Call.ThreadID = threadID
	if err := p.kvSetChannelState(channelID, state); err != nil {
		return "", "", fmt.Errorf("failed to set channel state: %w", err)
	}

	return createdPost.Id, threadID, nil
}

func (p *Plugin) updateCallPostEnded(postID string) (float64, error) {
	post, appErr := p.API.GetPost(postID)
	if appErr != nil {
		return 0, appErr
	}

	postMsg := "Call ended"
	slackAttachment := model.SlackAttachment{
		Fallback: postMsg,
		Title:    postMsg,
		Text:     postMsg,
	}

	post.Message = postMsg
	post.DelProp("attachments")
	post.AddProp("attachments", []*model.SlackAttachment{&slackAttachment})
	post.AddProp("end_at", time.Now().UnixMilli())

	_, appErr = p.API.UpdatePost(post)
	if appErr != nil {
		return 0, appErr
	}

	var dur float64
	if prop := post.GetProp("start_at"); prop != nil {
		if startAt, ok := prop.(float64); ok {
			dur = time.Since(time.UnixMilli(int64(startAt))).Seconds()
		}
	}

	return dur, nil
}

func (p *Plugin) lockCall(callID string) error {
	p.mut.Lock()
	mut := p.callsClusterLocks[callID]
	if mut == nil {
		p.LogDebug("creating cluster mutex for call", "callID", callID)
		m, err := cluster.NewMutex(p.API, p.metrics, "call_"+callID, cluster.MutexConfig{
			TTL:             4 * time.Second,
			RefreshInterval: 1 * time.Second,
			PollInterval:    50 * time.Millisecond,
			MetricsGroup:    "mutex_call",
		})
		if err != nil {
			p.mut.Unlock()
			return fmt.Errorf("failed to create new call cluster mutex: %w", err)
		}
		p.callsClusterLocks[callID] = m
		mut = m
	}
	p.mut.Unlock()

	lockCtx, cancelCtx := context.WithTimeout(context.Background(), lockTimeout)
	defer cancelCtx()

	return mut.Lock(lockCtx)
}

func (p *Plugin) unlockCall(callID string) error {
	p.mut.RLock()
	defer p.mut.RUnlock()

	mut := p.callsClusterLocks[callID]
	if mut == nil {
		return fmt.Errorf("call cluster mutex doesn't exist")
	}

	mut.Unlock()

	return nil
}
