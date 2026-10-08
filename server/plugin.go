// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"errors"
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
	"github.com/mattermost/mattermost-plugin-calls/server/public"

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

	mut      sync.RWMutex
	nodeID   string // the node cluster id
	stopCh   chan struct{}
	sessions map[string]*session

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

	sipNoAnswerTimers    map[string]*time.Timer
	sipNoAnswerTimersMut sync.Mutex

	sipOutboundTrunkID       string
	sipOutboundTrunkSpecHash string
	sipOutboundTrunkMut      sync.Mutex

	// reconcilerSuspicions tracks how many consecutive ticks each confirmed
	// session has been absent from LiveKit. Cleared when the session is confirmed
	// present or reaped. Guarded by reconcilerSuspicionsMut.
	reconcilerSuspicions    map[string]int
	reconcilerSuspicionsMut sync.Mutex

	// dirtyCalls is the set of channels whose LiveKit room metadata is stale.
	// dirtyCallsCh is a doorbell: it signals that there is work, the set says
	// what. See markCallDirty.
	dirtyCalls    map[string]struct{}
	dirtyCallsMut sync.Mutex
	dirtyCallsCh  chan struct{}
	publisherWg   sync.WaitGroup

	// Database
	store *db.Store

	// Batchers
	addSessionsBatchers    map[string]*batching.Batcher
	removeSessionsBatchers map[string]*batching.Batcher
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

	for k, v := range phoneCallPostProps(state.Call.Props) {
		props[k] = v
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

	var postMsg string
	switch reason {
	case callEndReasonNoAnswer:
		postMsg = T("app.call.no_answer_message")
	case callEndReasonCanceledByCaller:
		postMsg = T("app.call.canceled_by_caller_message")
	case callEndReasonDeclined:
		postMsg = T("app.call.declined_message")
	case callEndReasonFailed:
		postMsg = T("app.call.failed_message")
	default:
		postMsg = T("app.call.ended_message")
	}
	callStatus := reason.status()

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

	if crossPostID := p.crossPostPhoneCallCard(post, callStatus); crossPostID != "" {
		post.AddProp(phoneCrossPostIDProp, crossPostID)
	}

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

// Post props carrying the phone-call fields. The call type is stored as call_type
// rather than type: core treats a string props.type as the post type when picking
// a renderer, so a type prop would make the card render as plain text.
const (
	phoneCallTypeProp     = "call_type"
	phoneNumberProp       = "phone_number"
	phoneDisplayNumProp   = "display_number"
	phoneDisplayLabelProp = "display_label"
	phoneTargetUserIDProp = "target_user_id"
	phoneCrossPostIDProp  = "cross_post_id"
)

// phoneCallFields returns the phone-call props as sent to clients in call events.
// Empty for non-phone calls.
func phoneCallFields(props public.CallProps) map[string]interface{} {
	if props.Type != callTypePhone {
		return nil
	}
	fields := map[string]interface{}{
		"type":         props.Type,
		"phone_number": props.PhoneNumber,
	}
	if props.DisplayNumber != "" {
		fields["display_number"] = props.DisplayNumber
	}
	if props.DisplayLabel != "" {
		fields["display_label"] = props.DisplayLabel
	}
	if props.TargetUserID != "" {
		fields["target_user_id"] = props.TargetUserID
	}
	return fields
}

// phoneCallPostProps returns the phone-call fields as post props so the call
// card can render from scrollback. Empty for non-phone calls.
func phoneCallPostProps(props public.CallProps) map[string]interface{} {
	fields := phoneCallFields(props)
	if fields == nil {
		return nil
	}
	postProps := make(map[string]interface{}, len(fields))
	for k, v := range fields {
		if k == "type" {
			k = phoneCallTypeProp
		}
		postProps[k] = v
	}
	return postProps
}

func postPropString(post *model.Post, key string) string {
	s, _ := post.GetProp(key).(string)
	return s
}

// crossPostPhoneCallCard copies the final card of a phone call that named a
// target user into the DM between the caller and that user, so the person who
// was called sees it where they'd expect. The full record, including recordings,
// stays on the original post in the Calls bot DM. Returns the new post's id, or
// "" when nothing was posted. Posts at most once per call.
func (p *Plugin) crossPostPhoneCallCard(post *model.Post, callStatus string) string {
	if postPropString(post, phoneCallTypeProp) != callTypePhone {
		return ""
	}
	targetUserID := postPropString(post, phoneTargetUserIDProp)
	if targetUserID == "" || postPropString(post, phoneCrossPostIDProp) != "" {
		return ""
	}
	switch callStatus {
	case callStatusEnded, callStatusNoAnswer, callStatusCanceledByCaller:
	default:
		return ""
	}

	dm, appErr := p.API.GetDirectChannel(post.UserId, targetUserID)
	if appErr != nil {
		p.LogError("crossPostPhoneCallCard: failed to get DM channel",
			"callerID", post.UserId, "targetUserID", targetUserID, "err", appErr.Error())
		return ""
	}

	props := make(map[string]interface{}, len(post.GetProps()))
	for k, v := range post.GetProps() {
		props[k] = v
	}
	delete(props, phoneCrossPostIDProp)

	crossPost, appErr := p.API.CreatePost(&model.Post{
		UserId:    post.UserId,
		ChannelId: dm.Id,
		Message:   post.Message,
		Type:      callEventPostType,
		Props:     props,
	})
	if appErr != nil {
		p.LogError("crossPostPhoneCallCard: failed to create post",
			"channelID", dm.Id, "err", appErr.Error())
		return ""
	}
	return crossPost.Id
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
	for connID, session := range state.sessions {
		if session.UserID == cm.UserId {
			p.LogDebug("UserHasLeftChannel: removing session for user who left channel",
				"userID", session.UserID, "channelID", cm.ChannelId, "connID", connID)

			// Evicting the participant is what actually ends their call: their
			// client sees RoomEvent.Disconnected and tears down, and the resulting
			// participant_left webhook deletes the session row. This is the only
			// path for a client with no Calls WebSocket, where the p.sessions
			// lookup below finds nothing.
			if err := p.livekitRemoveParticipant(cm.ChannelId, composeLivekitIdentity(session.UserID, connID)); err != nil &&
				!errors.Is(err, errLiveKitNotConfigured) {
				p.LogError("UserHasLeftChannel: failed to remove LiveKit participant", "err", err.Error(),
					"userID", session.UserID, "channelID", cm.ChannelId, "connID", connID)
			}

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
