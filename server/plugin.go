package main

import (
	"fmt"
	"sync"
	"time"

	"github.com/mattermost/mattermost-plugin-calls/server/performance"
	"github.com/mattermost/mattermost-plugin-calls/server/telemetry"

	"github.com/mattermost/rtcd/service/rtc"

	pluginapi "github.com/mattermost/mattermost-plugin-api"
	"github.com/mattermost/mattermost-server/v6/model"
	"github.com/mattermost/mattermost-server/v6/plugin"
)

// Plugin implements the interface expected by the Mattermost server to communicate between the server and plugin processes.
type Plugin struct {
	plugin.MattermostPlugin
	pluginAPI *pluginapi.Client

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
}

func (p *Plugin) startSession(us *session, senderID string) {
	var wg sync.WaitGroup
	wg.Add(1)
	defer func() {
		wg.Wait()
		p.LogDebug("exiting session handler")
	}()

	go func() {
		defer wg.Done()
		cfg := rtc.SessionConfig{
			GroupID:   "default",
			CallID:    us.channelID,
			UserID:    us.userID,
			SessionID: us.connID,
		}
		if err := p.rtcServer.InitSession(cfg, nil); err != nil {
			p.LogError(err.Error(), "sessionConfig", fmt.Sprintf("%+v", cfg))
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
		case <-us.closeCh:
			return
		}
	}
}

func (p *Plugin) OnPluginClusterEvent(c *plugin.Context, ev model.PluginClusterEvent) {
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

	p.mut.RLock()
	us := p.sessions[msg.ConnID]
	p.mut.RUnlock()

	switch clusterMessageType(ev.Id) {
	case clusterMessageTypeConnect:
		if us != nil {
			return fmt.Errorf("session already exists, userID=%q, connID=%q, channelID=%q",
				us.userID, msg.ConnID, us.channelID)
		}
		us := newUserSession(msg.UserID, msg.ChannelID, msg.ConnID)
		p.mut.Lock()
		p.sessions[msg.ConnID] = us
		p.mut.Unlock()
		go p.startSession(us, msg.SenderID)
	case clusterMessageTypeDisconnect:
		if us == nil {
			return fmt.Errorf("session doesn't exist, ev=%s, userID=%q, connID=%q, channelID=%q",
				ev.Id, msg.UserID, msg.ConnID, msg.ChannelID)
		}
		p.LogDebug("disconnect event", "ChannelID", msg.ChannelID, "UserID", msg.UserID)
		p.mut.Lock()
		delete(p.sessions, us.connID)
		p.mut.Unlock()
		close(us.signalInCh)
		close(us.closeCh)
		if err := p.rtcServer.CloseSession(us.connID); err != nil {
			return fmt.Errorf("failed to close session: %w", err)
		}
	case clusterMessageTypeSignaling:
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

func (p *Plugin) startNewCallThread(userID, channelID string, startAt int64) (string, error) {
	user, appErr := p.API.GetUser(userID)
	if appErr != nil {
		return "", appErr
	}

	var postMsg string
	if user.FirstName != "" && user.LastName != "" {
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
		Message:   postMsg,
		Type:      "custom_calls",
		Props: map[string]interface{}{
			"attachments": []*model.SlackAttachment{&slackAttachment},
			"start_at":    startAt,
		},
	}

	createdPost, appErr := p.API.CreatePost(post)
	if appErr != nil {
		return "", appErr
	}

	err := p.kvSetAtomicChannelState(channelID, func(state *channelState) (*channelState, error) {
		if state == nil {
			return nil, fmt.Errorf("channel state is missing from store")
		}
		if state.Call == nil {
			return nil, fmt.Errorf("call is missing from channel state")
		}

		state.Call.ThreadID = createdPost.Id
		return state, nil
	})
	if err != nil {
		return "", err
	}

	return createdPost.Id, nil
}

func (p *Plugin) updateCallThreadEnded(threadID string) (float64, error) {
	post, appErr := p.API.GetPost(threadID)
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
