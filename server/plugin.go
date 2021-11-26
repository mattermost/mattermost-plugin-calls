package main

import (
	"fmt"
	"sync"
	"time"

	"github.com/mattermost/mattermost-plugin-calls/server/performance"

	"github.com/mattermost/mattermost-server/v6/model"
	"github.com/mattermost/mattermost-server/v6/plugin"

	"github.com/prometheus/client_golang/prometheus"
)

// Plugin implements the interface expected by the Mattermost server to communicate between the server and plugin processes.
type Plugin struct {
	plugin.MattermostPlugin

	// configurationLock synchronizes access to the configuration.
	configurationLock sync.RWMutex
	// configuration is the active plugin configuration. Consult getConfiguration and
	// setConfiguration for usage.
	configuration *configuration

	metrics *performance.Metrics

	mut         sync.RWMutex
	nodeID      string // the node cluster id
	stopCh      chan struct{}
	clusterEvCh chan model.PluginClusterEvent
	sessions    map[string]*session
	calls       map[string]*call
}

func (p *Plugin) startSession(msg *clusterMessage) {
	us := newUserSession(msg.UserID, msg.ChannelID)

	p.mut.Lock()
	p.sessions[msg.UserID] = us
	p.mut.Unlock()

	var wg sync.WaitGroup
	wg.Add(1)
	go func() {
		defer wg.Done()
		p.metrics.RTCSessions.With(prometheus.Labels{"channelID": msg.ChannelID}).Inc()
		defer p.metrics.RTCSessions.With(prometheus.Labels{"channelID": msg.ChannelID}).Dec()
		p.initRTCConn(msg.UserID)
		p.LogDebug("initRTCConn DONE")
		p.handleTracks(us)
		p.LogDebug("handleTracks DONE")
	}()

	for m := range us.wsOutCh {
		clusterMsg := clusterMessage{
			UserID:    msg.UserID,
			ChannelID: msg.ChannelID,
			SenderID:  p.nodeID,
			ClientMessage: clientMessage{
				Type: clientMessageTypeSignal,
				Data: m,
			},
		}
		if err := p.sendClusterMessage(clusterMsg, clusterMessageTypeSignaling, msg.SenderID); err != nil {
			p.LogError(err.Error())
		}
	}

	wg.Wait()

	p.LogDebug("exiting session handler")
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
	us := p.sessions[msg.UserID]
	p.mut.RUnlock()

	switch clusterMessageType(ev.Id) {
	case clusterMessageTypeConnect:
		if us != nil {
			return fmt.Errorf("session already exists, userID=%q, channelID=%q", us.userID, us.channelID)
		}
		go p.startSession(&msg)
	case clusterMessageTypeDisconnect:
		if us == nil {
			return fmt.Errorf("session doesn't exist, userID=%q, channelID=%q", msg.UserID, msg.ChannelID)
		}
		p.LogDebug("disconnect event", "ChannelID", msg.ChannelID, "UserID", msg.UserID)
		p.mut.Lock()
		delete(p.sessions, us.userID)
		p.mut.Unlock()
		close(us.wsInCh)
		close(us.wsOutCh)
		close(us.closeCh)
		if us.rtcConn != nil {
			us.rtcConn.Close()
		}
	case clusterMessageTypeSignaling:
		if us == nil {
			return fmt.Errorf("session doesn't exist, userID=%q, channelID=%q", msg.UserID, msg.ChannelID)
		}
		if msg.ClientMessage.Type == clientMessageTypeSignal || msg.ClientMessage.Type == clientMessageTypeICE {
			if us.wsConn != nil {
				select {
				case us.wsOutCh <- []byte(msg.ClientMessage.Data):
				default:
					return fmt.Errorf("out chan is full, dropping msg")
				}
			} else {
				select {
				case us.wsInCh <- []byte(msg.ClientMessage.Data):
				default:
					return fmt.Errorf("in chan is full, dropping msg")
				}
			}
		} else {
			return fmt.Errorf("unexpected client message type %q", msg.ClientMessage.Type)
		}
	case clusterMessageTypeUserState:
		if us == nil {
			return fmt.Errorf("session doesn't exist, userID=%q, channelID=%q", msg.UserID, msg.ChannelID)
		}
		us.trackEnableCh <- (msg.ClientMessage.Type == clientMessageTypeMute)
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

func (p *Plugin) updateCallThreadEnded(threadID string) error {
	post, appErr := p.API.GetPost(threadID)
	if appErr != nil {
		return appErr
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
		return appErr
	}

	return nil
}
