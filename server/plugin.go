// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"fmt"
	"net/http"
	"sync"
	"time"

	"golang.org/x/time/rate"

	"github.com/mattermost/mattermost-plugin-calls/server/batching"
	"github.com/mattermost/mattermost-plugin-calls/server/cluster"
	"github.com/mattermost/mattermost-plugin-calls/server/db"
	"github.com/mattermost/mattermost-plugin-calls/server/enterprise"
	"github.com/mattermost/mattermost-plugin-calls/server/interfaces"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/plugin"

	"github.com/gorilla/mux"
)

const (
	callStartPostType = "custom_calls"
)

// Plugin implements the interface expected by the Mattermost server to communicate between the server and plugin processes.
type Plugin struct {
	plugin.MattermostPlugin
	licenseChecker *enterprise.LicenseChecker

	// configurationLock synchronizes access to the configuration.
	configurationLock sync.RWMutex
	// configuration is the active plugin configuration. Consult getConfiguration and
	// setConfiguration for usage.
	configuration      *configuration
	configEnvOverrides map[string]string

	apiRouter *mux.Router

	metrics interfaces.Metrics

	mut         sync.RWMutex
	nodeID      string // the node cluster id
	stopCh      chan struct{}
	clusterEvCh chan model.PluginClusterEvent
	sessions    map[string]*session

	// A map of userID -> limiter to implement basic, user based API rate-limiting.
	apiLimiters    map[string]*rate.Limiter
	apiLimitersMut sync.RWMutex

	// A map of IP -> limiter for guest join endpoint rate-limiting.
	guestAPILimiters    map[string]*rate.Limiter
	guestAPILimitersMut sync.RWMutex

	botSession *model.Session

	// A map of callID -> *cluster.Mutex to guarantee atomicity of call state
	// operations.
	callsClusterLocks    map[string]*cluster.Mutex
	callsClusterLocksMut sync.RWMutex

	// Database
	store *db.Store

	// Batchers
	addSessionsBatchers    map[string]*batching.Batcher
	removeSessionsBatchers map[string]*batching.Batcher

	// SIP dispatch rule IDs keyed by channelID
	sipDispatchRules map[string]string
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
	// In the LiveKit PoC, cluster events are not used for RTC signaling.
	// We only keep the handler to avoid breaking the plugin framework.
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

func (p *Plugin) createCallStartedPost(state *callState, userID, channelID, title, threadID string) (string, string, error) {
	user, appErr := p.API.GetUser(userID)
	if appErr != nil {
		return "", "", appErr
	}

	cfg := p.API.GetConfig()
	if cfg == nil {
		return "", "", fmt.Errorf("failed to get configuration")
	}

	T := p.getTranslationFunc("")

	showFullName := cfg.PrivacySettings.ShowFullName != nil && *cfg.PrivacySettings.ShowFullName

	var postMsg string
	if user.FirstName != "" && user.LastName != "" && showFullName {
		postMsg = T("app.call.started_message_fullname", map[string]any{"FirstName": user.FirstName, "LastName": user.LastName})
	} else {
		postMsg = T("app.call.started_message", map[string]any{"Username": user.Username})
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
		Type:      callStartPostType,
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

	p.sendPushNotifications(channelID, createdPost.Id, threadID, user, cfg)

	return createdPost.Id, threadID, nil
}

func (p *Plugin) updateCallPostEnded(postID string, participants []string) (float64, error) {
	if postID == "" {
		return 0, fmt.Errorf("postID should not be empty")
	}

	post, err := p.store.GetPost(postID)
	if err != nil {
		return 0, err
	}

	T := p.getTranslationFunc("")

	postMsg := T("app.call.ended_message")
	slackAttachment := model.SlackAttachment{
		Fallback: postMsg,
		Title:    postMsg,
		Text:     postMsg,
	}

	post.Message = postMsg
	post.DelProp("attachments")
	post.AddProp("attachments", []*model.SlackAttachment{&slackAttachment})
	post.AddProp("end_at", time.Now().UnixMilli())
	post.AddProp("participants", participants)

	if _, appErr := p.API.UpdatePost(post); appErr != nil {
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

func (p *Plugin) ServeMetrics(_ *plugin.Context, w http.ResponseWriter, r *http.Request) {
	p.metrics.Handler().ServeHTTP(w, r)
}

// We want to prevent call posts from being modified by the user starting the
// call to avoid potentially messing with metadata (e.g. job ids).
// Both Plugin and Calls bot should still be able to do it though.
func (p *Plugin) MessageWillBeUpdated(c *plugin.Context, newPost, oldPost *model.Post) (*model.Post, string) {
	if oldPost != nil && oldPost.Type == callStartPostType && c != nil && c.SessionId != "" {
		if p.botSession == nil || c.SessionId != p.botSession.Id {
			return nil, "you are not allowed to edit a call post"
		}
	}

	return newPost, ""
}

func (p *Plugin) UserHasLeftChannel(_ *plugin.Context, cm *model.ChannelMember, _ *model.User) {
	if cm == nil {
		p.LogWarn("UserHasLeftChannel: unexpected nil channel member")
		return
	}

	state, err := p.getCallState(cm.ChannelId, false)
	if err != nil {
		p.LogError("UserHasLeftChannel: failed to get call state", "err", err.Error(), "channelID", cm.ChannelId)
		return
	} else if state == nil {
		p.LogDebug("UserHasLeftChannel: no call ongoing", "channelID", cm.ChannelId)
		return
	}

	// Remove any sessions for the user who left the channel.
	for connID, session := range state.sessions {
		if session.UserID == cm.UserId {
			p.LogDebug("UserHasLeftChannel: removing session for user who left channel",
				"userID", session.UserID, "channelID", cm.ChannelId, "connID", connID)

			p.mut.RLock()
			us := p.sessions[connID]
			p.mut.RUnlock()

			if us != nil {
				if err := p.removeSession(us); err != nil {
					p.LogError("UserHasLeftChannel: failed to remove session", "err", err.Error(),
						"userID", session.UserID, "channelID", cm.ChannelId, "connID", connID)
				}
			}

			// Sending user_left event to the user since they won't receive the channel
			// wide broadcast.
			p.publishWebSocketEvent(wsEventUserLeft, map[string]interface{}{
				"user_id":    session.UserID,
				"session_id": connID,
				"channelID":  cm.ChannelId,
			}, &WebSocketBroadcast{UserID: cm.UserId, ReliableClusterSend: true})
		}
	}
}
