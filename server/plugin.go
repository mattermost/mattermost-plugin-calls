// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"fmt"
	"net/http"
	"sync"
	"sync/atomic"
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
	callEventPostType     = "custom_calls"
	callRecordingPostType = "custom_calls_recording"
	callTranscriptionType = "custom_calls_transcription"
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

	jobService *jobService

	// A map of userID -> limiter to implement basic, user based API rate-limiting.
	// TODO: consider moving this to a dedicated API object.
	apiLimiters    map[string]*rate.Limiter
	apiLimitersMut sync.RWMutex

	// botID is the Calls bot's user ID, resolved via EnsureBotUser at activation.
	// It is cached independently of botSession so the bot filter (getBotID) keeps
	// working even while botSession is nil (e.g. a node's activation window during
	// a rolling restart), rather than silently returning "" and no-opping.
	botID      string
	botSession *model.Session

	// A map of callID -> *cluster.Mutex to guarantee atomicity of call state
	// operations.
	callsClusterLocks    map[string]*cluster.Mutex
	callsClusterLocksMut sync.RWMutex

	dmNoAnswerTimers    map[string]*time.Timer
	dmNoAnswerTimersMut sync.Mutex

	// Database
	store *db.Store

	// Batchers
	addSessionsBatchers    map[string]*batching.Batcher
	removeSessionsBatchers map[string]*batching.Batcher
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
			delete(p.sessions, us.connID)
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

func (p *Plugin) createCallStartedPost(state *callState, userID, channelID, title, threadID string, channelType model.ChannelType) (string, string, error) {
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

	props := map[string]interface{}{
		"attachments": []*model.SlackAttachment{&slackAttachment},
		"start_at":    state.Call.StartAt,
		"title":       title,
	}

	// Only DM calls are phone-like, so only they start out ringing. For every other channel type
	// the prop is absent and clients read the card as an active call.
	if channelType == model.ChannelTypeDirect {
		props["call_status"] = callStatusCalling
	}

	post := &model.Post{
		UserId:    userID,
		ChannelId: channelID,
		RootId:    threadID,
		Message:   postMsg,
		Type:      callEventPostType,
		Props:     props,
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

func (p *Plugin) updateCallPostEnded(postID string, participants []string, reason callEndReason) (float64, error) {
	if postID == "" {
		return 0, fmt.Errorf("postID should not be empty")
	}

	post, err := p.store.GetPost(postID)
	if err != nil {
		return 0, err
	}

	T := p.getTranslationFunc("")

	var postMsg, callStatus string
	switch reason {
	case callEndReasonNoAnswer:
		postMsg = T("app.call.no_answer_message")
		callStatus = callStatusNoAnswer
	case callEndReasonCanceledByCaller:
		postMsg = T("app.call.canceled_by_caller_message")
		callStatus = callStatusCanceledByCaller
	case callEndReasonDeclined:
		postMsg = T("app.call.declined_message")
		callStatus = callStatusDeclined
	default:
		postMsg = T("app.call.ended_message")
		callStatus = callStatusEnded
	}

	slackAttachment := model.SlackAttachment{
		Fallback: postMsg,
		Title:    postMsg,
		Text:     postMsg,
	}

	post.Message = postMsg
	post.DelProp("attachments")
	post.AddProp("attachments", []*model.SlackAttachment{&slackAttachment})
	post.AddProp("end_at", time.Now().UnixMilli())
	post.AddProp("call_status", callStatus)
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
	if oldPost != nil && oldPost.Type == callEventPostType && c != nil && c.SessionId != "" {
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

	// Remove call session(s) for the user who left the channel.
	// LiveKit handles its own media cleanup when participants disconnect.
	for connID, session := range state.sessions {
		if session.UserID == cm.UserId {
			p.LogDebug("UserHasLeftChannel: removing session for user who left channel",
				"userID", session.UserID, "channelID", cm.ChannelId, "connID", connID)

			us := p.getSessionByOriginalID(connID)
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
