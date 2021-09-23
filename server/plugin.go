package main

import (
	"fmt"
	"sync"

	"github.com/mattermost/mattermost-server/v6/model"
	"github.com/mattermost/mattermost-server/v6/plugin"
)

// Plugin implements the interface expected by the Mattermost server to communicate between the server and plugin processes.
type Plugin struct {
	plugin.MattermostPlugin
	// configurationLock synchronizes access to the configuration.
	configurationLock sync.RWMutex
	// configuration is the active plugin configuration. Consult getConfiguration and
	// setConfiguration for usage.
	configuration *configuration

	stopCh      chan struct{}
	clusterEvCh chan model.PluginClusterEvent
	sessions    map[string]*session
	nodeID      string // the node cluster id
	mut         sync.RWMutex
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
		p.handleTracks(msg.UserID)
		p.LogDebug("handleTracks DONE")
	}()

	if msg.ClientMessage.Type == clientMessageTypeSignal {
		select {
		case us.wsInCh <- []byte(msg.ClientMessage.Data):
		default:
			p.LogError("channel is full, dropping msg")
		}
	}

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
	p.LogDebug("got cluster event", ev.Id)

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
			return fmt.Errorf("session doesn't exist, userID=%q, channelID=%q", us.userID, us.channelID)
		}
		p.LogDebug("disconnect event", "ChannelID", msg.ChannelID, "UserID", msg.UserID)
		close(us.wsOutCh)
		p.mut.Lock()
		delete(p.sessions, us.userID)
		p.mut.Unlock()
	case clusterMessageTypeSignaling:
		if msg.ClientMessage.Type == clientMessageTypeSignal {
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

func (p *Plugin) startNewCallThread(userID, channelID string, startAt int64) error {
	user, appErr := p.API.GetUser(userID)
	if appErr != nil {
		return appErr
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
		return appErr
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
		return err
	}

	return nil
}
