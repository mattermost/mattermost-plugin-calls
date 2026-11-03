// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"slices"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"golang.org/x/time/rate"
	"google.golang.org/protobuf/proto"

	"github.com/mattermost/mattermost-plugin-calls/server/cluster"
	"github.com/mattermost/mattermost-plugin-calls/server/db"
	"github.com/mattermost/mattermost-plugin-calls/server/enterprise"
	"github.com/mattermost/mattermost-plugin-calls/server/public"

	serverMocks "github.com/mattermost/mattermost-plugin-calls/server/mocks/github.com/mattermost/mattermost-plugin-calls/server/interfaces"
	pluginMocks "github.com/mattermost/mattermost-plugin-calls/server/mocks/github.com/mattermost/mattermost/server/public/plugin"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/plugin"

	"github.com/livekit/protocol/livekit"
	"github.com/livekit/protocol/webhook"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
)

// fakeLiveKit serves the Twirp endpoints the phone-call paths use, so they can
// be exercised without a LiveKit server.
type fakeLiveKit struct {
	srv *httptest.Server

	mut             sync.Mutex
	participants    []*livekit.ParticipantInfo
	listFailures    int
	removalFailures int
	removed         []string
	// dial stands in for CreateSIPParticipant. The handler has released the
	// call lock by then, so dial can change the call the way a webhook would.
	dial func() (*livekit.SIPParticipantInfo, error)
}

func newFakeLiveKit(t *testing.T, participants ...*livekit.ParticipantInfo) *fakeLiveKit {
	t.Helper()
	lk := &fakeLiveKit{participants: participants}
	lk.srv = httptest.NewServer(http.HandlerFunc(lk.serve))
	t.Cleanup(lk.srv.Close)
	return lk
}

func (lk *fakeLiveKit) serve(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	var resp proto.Message
	switch {
	case strings.HasSuffix(r.URL.Path, "/livekit.RoomService/ListParticipants"):
		lk.mut.Lock()
		fail := lk.listFailures > 0
		if fail {
			lk.listFailures--
		}
		participants := lk.participants
		lk.mut.Unlock()
		if fail {
			http.Error(w, "unavailable", http.StatusServiceUnavailable)
			return
		}
		resp = &livekit.ListParticipantsResponse{Participants: participants}
	case strings.HasSuffix(r.URL.Path, "/livekit.RoomService/DeleteRoom"):
		resp = &livekit.DeleteRoomResponse{}
	case strings.HasSuffix(r.URL.Path, "/livekit.RoomService/RemoveParticipant"):
		var req livekit.RoomParticipantIdentity
		if err := proto.Unmarshal(body, &req); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		lk.mut.Lock()
		fail := lk.removalFailures > 0
		if fail {
			lk.removalFailures--
		} else {
			lk.removed = append(lk.removed, req.Identity)
		}
		lk.mut.Unlock()
		if fail {
			http.Error(w, "unavailable", http.StatusServiceUnavailable)
			return
		}
		resp = &livekit.RemoveParticipantResponse{}
	case strings.HasSuffix(r.URL.Path, "/livekit.SIP/CreateSIPParticipant"):
		lk.mut.Lock()
		dial := lk.dial
		lk.mut.Unlock()
		if dial == nil {
			http.Error(w, "no dial configured", http.StatusInternalServerError)
			return
		}
		info, err := dial()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		resp = info
	default:
		http.Error(w, "unexpected call: "+r.URL.Path, http.StatusNotFound)
		return
	}

	data, err := proto.Marshal(resp)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/protobuf")
	_, _ = w.Write(data)
}

func (lk *fakeLiveKit) setParticipants(participants ...*livekit.ParticipantInfo) {
	lk.mut.Lock()
	defer lk.mut.Unlock()
	lk.participants = participants
}

func (lk *fakeLiveKit) failLists(n int) {
	lk.mut.Lock()
	defer lk.mut.Unlock()
	lk.listFailures = n
}

func (lk *fakeLiveKit) failRemovals(n int) {
	lk.mut.Lock()
	defer lk.mut.Unlock()
	lk.removalFailures = n
}

func (lk *fakeLiveKit) setDial(dial func() (*livekit.SIPParticipantInfo, error)) {
	lk.mut.Lock()
	defer lk.mut.Unlock()
	lk.dial = dial
}

func (lk *fakeLiveKit) removedIdentities() []string {
	lk.mut.Lock()
	defer lk.mut.Unlock()
	return slices.Clone(lk.removed)
}

// dialedSIPLeg returns what CreateSIPParticipant reports for a dial to
// testPhoneNumber, and the participant LiveKit then lists for it.
func dialedSIPLeg(sid string) (*livekit.SIPParticipantInfo, *livekit.ParticipantInfo) {
	identity := "sip:" + testPhoneNumber
	return &livekit.SIPParticipantInfo{ParticipantId: sid, ParticipantIdentity: identity, SipCallId: "SCL_" + sid},
		&livekit.ParticipantInfo{Sid: sid, Identity: identity, Kind: livekit.ParticipantInfo_SIP}
}

const testPhoneNumber = "+14155551234"

func sipParticipantWithStatus(status string) *livekit.ParticipantInfo {
	return &livekit.ParticipantInfo{
		Sid:        model.NewId(),
		Identity:   "sip:" + testPhoneNumber,
		Kind:       livekit.ParticipantInfo_SIP,
		Attributes: map[string]string{livekit.AttrSIPCallStatus: status},
	}
}

func mockAllLogs(mockAPI *pluginMocks.MockAPI) {
	for _, method := range []string{"LogDebug", "LogInfo", "LogWarn", "LogError"} {
		for n := 1; n <= 20; n++ {
			args := make([]any, n)
			for i := range args {
				args[i] = mock.Anything
			}
			mockAPI.On(method, args...).Maybe()
		}
	}
}

func TestCallEndReasonStatus(t *testing.T) {
	require.Equal(t, callStatusEnded, callEndReasonNormal.status())
	require.Equal(t, callStatusCanceledByCaller, callEndReasonCanceledByCaller.status())
	require.Equal(t, callStatusNoAnswer, callEndReasonNoAnswer.status())
	require.Equal(t, callStatusDeclined, callEndReasonDeclined.status())
	require.Equal(t, callStatusFailed, callEndReasonFailed.status())
}

func TestPhoneLegEndReason(t *testing.T) {
	for reason, want := range map[livekit.DisconnectReason]callEndReason{
		livekit.DisconnectReason_CLIENT_INITIATED:    callEndReasonNormal,
		livekit.DisconnectReason_USER_REJECTED:       callEndReasonDeclined,
		livekit.DisconnectReason_USER_UNAVAILABLE:    callEndReasonNoAnswer,
		livekit.DisconnectReason_SIP_TRUNK_FAILURE:   callEndReasonFailed,
		livekit.DisconnectReason_ROOM_DELETED:        callEndReasonNormal,
		livekit.DisconnectReason_PARTICIPANT_REMOVED: callEndReasonNormal,
		livekit.DisconnectReason_UNKNOWN_REASON:      callEndReasonNormal,
	} {
		require.Equal(t, want, phoneLegEndReason(reason), reason.String())
	}
}

func TestTruncateRunes(t *testing.T) {
	require.Equal(t, "", truncateRunes("", 4))
	require.Equal(t, "abc", truncateRunes("abc", 4))
	require.Equal(t, "abcd", truncateRunes("abcdef", 4))
	require.Equal(t, "héll", truncateRunes("héllo", 4))
}

func TestPhoneCallFields(t *testing.T) {
	t.Run("non-phone call has no fields", func(t *testing.T) {
		require.Nil(t, phoneCallFields(public.CallProps{}))
		require.Nil(t, phoneCallPostProps(public.CallProps{}))
	})

	t.Run("phone call", func(t *testing.T) {
		props := public.CallProps{
			Type:          callTypePhone,
			PhoneNumber:   "+14155551234",
			DisplayNumber: "415-555-1234",
			DisplayLabel:  "DSN",
			TargetUserID:  "targetID",
		}
		require.Equal(t, map[string]interface{}{
			"type":           callTypePhone,
			"phone_number":   "+14155551234",
			"display_number": "415-555-1234",
			"display_label":  "DSN",
			"target_user_id": "targetID",
		}, phoneCallFields(props))

		// Posts store the type under call_type so core doesn't mistake it for the post type.
		require.Equal(t, map[string]interface{}{
			"call_type":      callTypePhone,
			"phone_number":   "+14155551234",
			"display_number": "415-555-1234",
			"display_label":  "DSN",
			"target_user_id": "targetID",
		}, phoneCallPostProps(props))
	})

	t.Run("optional fields are omitted", func(t *testing.T) {
		fields := phoneCallFields(public.CallProps{Type: callTypePhone, PhoneNumber: "+14155551234"})
		require.Equal(t, map[string]interface{}{"type": callTypePhone, "phone_number": "+14155551234"}, fields)
	})
}

// newLiveKitTestPlugin returns a plugin that talks to the LiveKit server at
// lkURL and nothing else. An empty lkURL leaves LiveKit unconfigured.
func newLiveKitTestPlugin(t *testing.T, lkURL string) *Plugin {
	t.Helper()
	mockAPI := &pluginMocks.MockAPI{}
	mockAllLogs(mockAPI)
	cfg := &configuration{}
	cfg.SetDefaults()
	cfg.LiveKitURL = lkURL
	if lkURL != "" {
		cfg.LiveKitAPIKey = "key"
		cfg.LiveKitAPISecret = "secret"
	}
	return &Plugin{
		MattermostPlugin: plugin.MattermostPlugin{API: mockAPI},
		configuration:    cfg,
	}
}

func TestPhoneCallerHangupReason(t *testing.T) {
	newPlugin := newLiveKitTestPlugin
	phoneCall := &public.Call{Props: public.CallProps{Type: callTypePhone}}

	t.Run("non-phone call is a normal end", func(t *testing.T) {
		p := newPlugin(t, newFakeLiveKit(t, sipParticipantWithStatus("ringing")).srv.URL)
		require.Equal(t, callEndReasonNormal, p.phoneCallerHangupReason(&public.Call{}, "channelID"))
	})

	t.Run("livekit not configured falls back to ended", func(t *testing.T) {
		p := newPlugin(t, "")
		require.Equal(t, callEndReasonNormal, p.phoneCallerHangupReason(phoneCall, "channelID"))
	})

	t.Run("callee still ringing means canceled", func(t *testing.T) {
		p := newPlugin(t, newFakeLiveKit(t, sipParticipantWithStatus("ringing")).srv.URL)
		require.Equal(t, callEndReasonCanceledByCaller, p.phoneCallerHangupReason(phoneCall, "channelID"))
	})

	t.Run("callee still dialing means canceled", func(t *testing.T) {
		p := newPlugin(t, newFakeLiveKit(t, sipParticipantWithStatus("dialing")).srv.URL)
		require.Equal(t, callEndReasonCanceledByCaller, p.phoneCallerHangupReason(phoneCall, "channelID"))
	})

	t.Run("callee answered means ended", func(t *testing.T) {
		p := newPlugin(t, newFakeLiveKit(t, sipParticipantWithStatus(sipCallStatusActive)).srv.URL)
		require.Equal(t, callEndReasonNormal, p.phoneCallerHangupReason(phoneCall, "channelID"))
	})

	t.Run("no SIP leg in the room means ended", func(t *testing.T) {
		p := newPlugin(t, newFakeLiveKit(t, &livekit.ParticipantInfo{
			Identity: "user___session", Kind: livekit.ParticipantInfo_STANDARD,
		}).srv.URL)
		require.Equal(t, callEndReasonNormal, p.phoneCallerHangupReason(phoneCall, "channelID"))
	})
}

func TestResolveCallEndReason(t *testing.T) {
	mockAPI := &pluginMocks.MockAPI{}
	mockAllLogs(mockAPI)
	p := &Plugin{MattermostPlugin: plugin.MattermostPlugin{API: mockAPI}}

	t.Run("override wins", func(t *testing.T) {
		reason := callEndReasonCanceledByCaller
		state := &callState{endReasonOverride: &reason}
		require.Equal(t, callEndReasonCanceledByCaller, p.resolveCallEndReason(state, []string{"a", "b"}, "channelID"))
	})

	t.Run("falls back to participant heuristic", func(t *testing.T) {
		state := &callState{}
		require.Equal(t, callEndReasonNormal, p.resolveCallEndReason(state, []string{"a", "b"}, "channelID"))
	})
}

func TestCrossPostPhoneCallCard(t *testing.T) {
	newPlugin := func(t *testing.T) (*Plugin, *pluginMocks.MockAPI) {
		t.Helper()
		mockAPI := &pluginMocks.MockAPI{}
		mockAllLogs(mockAPI)
		return &Plugin{MattermostPlugin: plugin.MattermostPlugin{API: mockAPI}}, mockAPI
	}

	callerID := model.NewId()
	targetID := model.NewId()

	phonePost := func(status string) *model.Post {
		post := &model.Post{Id: model.NewId(), UserId: callerID, ChannelId: model.NewId(), Message: "Call ended", Type: callEventPostType}
		post.SetProps(map[string]interface{}{
			phoneCallTypeProp:     callTypePhone,
			phoneNumberProp:       "+14155551234",
			phoneDisplayLabelProp: "DSN",
			phoneTargetUserIDProp: targetID,
			"call_status":         status,
			"end_at":              int64(1234),
		})
		return post
	}

	t.Run("not a phone call", func(t *testing.T) {
		p, mockAPI := newPlugin(t)
		post := &model.Post{Id: model.NewId(), UserId: callerID}
		require.Empty(t, p.crossPostPhoneCallCard(post, callStatusEnded))
		mockAPI.AssertNotCalled(t, "CreatePost", mock.Anything)
	})

	t.Run("no target user", func(t *testing.T) {
		p, mockAPI := newPlugin(t)
		post := phonePost(callStatusEnded)
		post.DelProp(phoneTargetUserIDProp)
		require.Empty(t, p.crossPostPhoneCallCard(post, callStatusEnded))
		mockAPI.AssertNotCalled(t, "CreatePost", mock.Anything)
	})

	t.Run("already cross-posted", func(t *testing.T) {
		p, mockAPI := newPlugin(t)
		post := phonePost(callStatusEnded)
		post.AddProp(phoneCrossPostIDProp, model.NewId())
		require.Empty(t, p.crossPostPhoneCallCard(post, callStatusEnded))
		mockAPI.AssertNotCalled(t, "CreatePost", mock.Anything)
	})

	t.Run("declined and failed calls are not cross-posted", func(t *testing.T) {
		p, mockAPI := newPlugin(t)
		require.Empty(t, p.crossPostPhoneCallCard(phonePost(callStatusDeclined), callStatusDeclined))
		require.Empty(t, p.crossPostPhoneCallCard(phonePost(callStatusFailed), callStatusFailed))
		mockAPI.AssertNotCalled(t, "CreatePost", mock.Anything)
	})

	for _, status := range []string{callStatusEnded, callStatusNoAnswer, callStatusCanceledByCaller} {
		t.Run("cross-posts "+status+" into the shared DM", func(t *testing.T) {
			p, mockAPI := newPlugin(t)
			post := phonePost(status)
			dmID := model.NewId()
			crossPostID := model.NewId()

			mockAPI.On("GetDirectChannel", callerID, targetID).Return(&model.Channel{Id: dmID, Type: model.ChannelTypeDirect}, nil).Once()
			mockAPI.On("CreatePost", mock.MatchedBy(func(created *model.Post) bool {
				return created.ChannelId == dmID &&
					created.UserId == callerID &&
					created.Type == callEventPostType &&
					created.Message == post.Message &&
					created.GetProp(phoneCallTypeProp) == callTypePhone &&
					created.GetProp("call_status") == status &&
					created.GetProp(phoneTargetUserIDProp) == targetID &&
					created.GetProp(phoneCrossPostIDProp) == nil
			})).Return(&model.Post{Id: crossPostID}, nil).Once()

			require.Equal(t, crossPostID, p.crossPostPhoneCallCard(post, status))
			mockAPI.AssertExpectations(t)
		})
	}

	t.Run("DM lookup failure posts nothing", func(t *testing.T) {
		p, mockAPI := newPlugin(t)
		mockAPI.On("GetDirectChannel", callerID, targetID).Return(nil, &model.AppError{Message: "nope"}).Once()
		require.Empty(t, p.crossPostPhoneCallCard(phonePost(callStatusEnded), callStatusEnded))
		mockAPI.AssertNotCalled(t, "CreatePost", mock.Anything)
	})
}

func TestUpdateCallPostEndedPhoneCall(t *testing.T) {
	mockAPI := &pluginMocks.MockAPI{}
	mockMetrics := &serverMocks.MockMetrics{}
	mockAllLogs(mockAPI)
	mockMetrics.On("ObserveAppHandlersTime", mock.Anything, mock.AnythingOfType("float64")).Maybe()

	store, tearDown := NewTestStore(t)
	t.Cleanup(tearDown)

	p := &Plugin{
		MattermostPlugin: plugin.MattermostPlugin{API: mockAPI},
		metrics:          mockMetrics,
		store:            store,
	}
	mockAPI.On("GetConfig").Return(&model.Config{}, nil).Maybe()

	callerID := model.NewId()
	targetID := model.NewId()

	setupPost := func(t *testing.T, props map[string]interface{}) string {
		t.Helper()
		postID := model.NewId()
		createPost(t, store, postID, callerID, model.NewId())
		propsJSON, err := json.Marshal(props)
		require.NoError(t, err)
		_, err = store.WriterDB().Exec(`UPDATE Posts SET Props = $1::jsonb WHERE Id = $2`, string(propsJSON), postID)
		require.NoError(t, err)
		return postID
	}

	t.Run("failed call gets the failed status", func(t *testing.T) {
		defer ResetTestStore(t, store)
		postID := setupPost(t, map[string]interface{}{phoneCallTypeProp: callTypePhone})

		mockAPI.On("UpdatePost", mock.MatchedBy(func(post *model.Post) bool {
			return post.Id == postID && post.GetProp("call_status") == callStatusFailed
		})).Return(&model.Post{Id: postID}, nil).Once()

		_, err := p.updateCallPostEnded(postID, nil, callEndReasonFailed)
		require.NoError(t, err)
		mockAPI.AssertExpectations(t)
	})

	t.Run("ended call with a target is cross-posted once", func(t *testing.T) {
		defer ResetTestStore(t, store)
		postID := setupPost(t, map[string]interface{}{
			phoneCallTypeProp:     callTypePhone,
			phoneTargetUserIDProp: targetID,
			"start_at":            float64(time.Now().Add(-time.Minute).UnixMilli()),
		})
		dmID := model.NewId()
		crossPostID := model.NewId()

		mockAPI.On("GetDirectChannel", callerID, targetID).Return(&model.Channel{Id: dmID, Type: model.ChannelTypeDirect}, nil).Once()
		mockAPI.On("CreatePost", mock.MatchedBy(func(post *model.Post) bool {
			return post.ChannelId == dmID && post.GetProp("call_status") == callStatusEnded
		})).Return(&model.Post{Id: crossPostID}, nil).Once()
		mockAPI.On("UpdatePost", mock.MatchedBy(func(post *model.Post) bool {
			return post.Id == postID && post.GetProp(phoneCrossPostIDProp) == crossPostID
		})).Return(&model.Post{Id: postID}, nil).Once()

		dur, err := p.updateCallPostEnded(postID, []string{callerID}, callEndReasonNormal)
		require.NoError(t, err)
		require.Greater(t, dur, float64(0))
		mockAPI.AssertExpectations(t)
	})
}

func TestHandlePhoneCallTarget(t *testing.T) {
	setupPlugin := func(t *testing.T) (*Plugin, *pluginMocks.MockAPI) {
		t.Helper()
		mockAPI := &pluginMocks.MockAPI{}
		mockMetrics := &serverMocks.MockMetrics{}

		cfg := &configuration{}
		cfg.SetDefaults()
		cfg.EnableSIPOutbound = model.NewPointer(true)
		cfg.LiveKitSIPOutboundTrunkID = "ST_test"

		p := &Plugin{
			MattermostPlugin:  plugin.MattermostPlugin{API: mockAPI},
			metrics:           mockMetrics,
			apiLimiters:       map[string]*rate.Limiter{},
			callsClusterLocks: map[string]*cluster.Mutex{},
			sessions:          map[string]*session{},
			configuration:     cfg,
		}
		p.licenseChecker = enterprise.NewLicenseChecker(p.API)

		mockMetrics.On("Handler").Return(nil)
		mockMetrics.On("ObserveAppHandlersTime", mock.AnythingOfType("string"), mock.AnythingOfType("float64")).Maybe()
		mockAPI.On("GetConfig").Return(&model.Config{}, nil).Maybe()
		mockAllLogs(mockAPI)
		return p, mockAPI
	}

	doRequest := func(t *testing.T, p *Plugin, callerID string, body map[string]string) (*http.Response, httpResponse) {
		t.Helper()
		apiRouter := p.newAPIRouter()
		data, err := json.Marshal(body)
		require.NoError(t, err)
		w := httptest.NewRecorder()
		r := httptest.NewRequest("POST", "/phone-call", bytes.NewReader(data))
		r.Header.Set("Mattermost-User-Id", callerID)
		apiRouter.ServeHTTP(w, r)
		resp := w.Result()
		var res httpResponse
		require.NoError(t, json.NewDecoder(resp.Body).Decode(&res))
		return resp, res
	}

	t.Run("invalid target id", func(t *testing.T) {
		p, _ := setupPlugin(t)
		resp, res := doRequest(t, p, model.NewId(), map[string]string{"number": "+14155551234", "target_user_id": "bad"})
		require.Equal(t, http.StatusBadRequest, resp.StatusCode)
		require.Equal(t, errIDInvalidTarget, res.ErrID)
	})

	t.Run("target is the caller", func(t *testing.T) {
		p, _ := setupPlugin(t)
		callerID := model.NewId()
		resp, res := doRequest(t, p, callerID, map[string]string{"number": "+14155551234", "target_user_id": callerID})
		require.Equal(t, http.StatusBadRequest, resp.StatusCode)
		require.Equal(t, errIDInvalidTarget, res.ErrID)
	})

	t.Run("target is a bot", func(t *testing.T) {
		p, mockAPI := setupPlugin(t)
		targetID := model.NewId()
		mockAPI.On("GetUser", targetID).Return(&model.User{Id: targetID, IsBot: true}, nil).Once()
		resp, res := doRequest(t, p, model.NewId(), map[string]string{"number": "+14155551234", "target_user_id": targetID})
		require.Equal(t, http.StatusBadRequest, resp.StatusCode)
		require.Equal(t, errIDInvalidTarget, res.ErrID)
	})

	t.Run("target is deactivated", func(t *testing.T) {
		p, mockAPI := setupPlugin(t)
		targetID := model.NewId()
		mockAPI.On("GetUser", targetID).Return(&model.User{Id: targetID, DeleteAt: 1}, nil).Once()
		resp, res := doRequest(t, p, model.NewId(), map[string]string{"number": "+14155551234", "target_user_id": targetID})
		require.Equal(t, http.StatusBadRequest, resp.StatusCode)
		require.Equal(t, errIDInvalidTarget, res.ErrID)
	})

	t.Run("target shares no team", func(t *testing.T) {
		p, mockAPI := setupPlugin(t)
		callerID := model.NewId()
		targetID := model.NewId()
		mockAPI.On("GetUser", targetID).Return(&model.User{Id: targetID}, nil).Once()
		mockAPI.On("GetTeamsForUser", callerID).Return([]*model.Team{{Id: "team-a"}}, nil).Once()
		mockAPI.On("GetTeamsForUser", targetID).Return([]*model.Team{{Id: "team-b"}}, nil).Once()
		resp, res := doRequest(t, p, callerID, map[string]string{"number": "+14155551234", "target_user_id": targetID})
		require.Equal(t, http.StatusBadRequest, resp.StatusCode)
		require.Equal(t, errIDInvalidTarget, res.ErrID)
		require.Equal(t, errInvalidPhoneCallTarget.Error(), res.Msg)
	})

	t.Run("outbound disabled is reported before the target is checked", func(t *testing.T) {
		p, mockAPI := setupPlugin(t)
		p.configuration.EnableSIPOutbound = model.NewPointer(false)
		resp, res := doRequest(t, p, model.NewId(), map[string]string{"number": "+14155551234", "target_user_id": model.NewId()})
		require.Equal(t, http.StatusBadRequest, resp.StatusCode)
		require.Equal(t, errIDOutboundDisabled, res.ErrID)
		mockAPI.AssertNotCalled(t, "GetUser", mock.Anything)
	})

	t.Run("team lookup failure is a server error", func(t *testing.T) {
		p, mockAPI := setupPlugin(t)
		callerID := model.NewId()
		targetID := model.NewId()
		mockAPI.On("GetUser", targetID).Return(&model.User{Id: targetID}, nil).Once()
		mockAPI.On("GetTeamsForUser", callerID).Return(nil, &model.AppError{Message: "db error"}).Once()
		resp, res := doRequest(t, p, callerID, map[string]string{"number": "+14155551234", "target_user_id": targetID})
		require.Equal(t, http.StatusInternalServerError, resp.StatusCode)
		require.Empty(t, res.ErrID)
	})

	t.Run("valid target passes validation", func(t *testing.T) {
		p, mockAPI := setupPlugin(t)
		callerID := model.NewId()
		targetID := model.NewId()
		mockAPI.On("GetUser", targetID).Return(&model.User{Id: targetID}, nil).Once()
		mockAPI.On("GetTeamsForUser", callerID).Return([]*model.Team{{Id: "team-a"}}, nil).Once()
		mockAPI.On("GetTeamsForUser", targetID).Return([]*model.Team{{Id: "team-a"}, {Id: "team-b"}}, nil).Once()
		// Past validation; stops at the bot lookup because no bot is initialized.
		mockAPI.On("GetDirectChannel", mock.AnythingOfType("string"), mock.AnythingOfType("string")).
			Return(nil, &model.AppError{Message: "bot not initialized"}).Maybe()
		mockAPI.On("GetBotIconImage", mock.AnythingOfType("string")).Return(nil, false).Maybe()

		resp, res := doRequest(t, p, callerID, map[string]string{"number": "+14155551234", "target_user_id": targetID, "display_label": " DSN "})
		require.NotEqual(t, http.StatusBadRequest, resp.StatusCode)
		require.NotEqual(t, errIDInvalidTarget, res.ErrID)
		mockAPI.AssertExpectations(t)
	})
}

// phoneCallTest is a plugin backed by a test store, with SIP outbound enabled
// against a fake LiveKit. callerID places calls through the bot DM channelID.
type phoneCallTest struct {
	p         *Plugin
	api       *pluginMocks.MockAPI
	lk        *fakeLiveKit
	channelID string
	callerID  string
	// lockFails makes every new call-lock attempt fail while it is set.
	lockFails atomic.Bool
}

func newPhoneCallTest(t *testing.T, participants ...*livekit.ParticipantInfo) *phoneCallTest {
	t.Helper()
	mockAPI := &pluginMocks.MockAPI{}
	mockMetrics := &serverMocks.MockMetrics{}

	store, tearDown := NewTestStore(t)
	t.Cleanup(tearDown)

	tc := &phoneCallTest{
		api:       mockAPI,
		lk:        newFakeLiveKit(t, participants...),
		channelID: model.NewId(),
		callerID:  model.NewId(),
	}

	cfg := &configuration{}
	cfg.SetDefaults()
	cfg.DefaultEnabled = model.NewPointer(true)
	cfg.EnableRinging = model.NewPointer(false)
	cfg.EnableSIPOutbound = model.NewPointer(true)
	cfg.LiveKitSIPOutboundTrunkID = "ST_test"
	cfg.LiveKitURL = tc.lk.srv.URL
	cfg.LiveKitAPIKey = "key"
	cfg.LiveKitAPISecret = "secret"

	tc.p = &Plugin{
		MattermostPlugin:  plugin.MattermostPlugin{API: mockAPI},
		metrics:           mockMetrics,
		apiLimiters:       map[string]*rate.Limiter{},
		callsClusterLocks: map[string]*cluster.Mutex{},
		sessions:          map[string]*session{},
		store:             store,
		nodeID:            "test-node",
		botID:             model.NewId(),
		configuration:     cfg,
		dirtyCalls:        map[string]struct{}{},
		dirtyCallsCh:      make(chan struct{}, 1),
		dmNoAnswerTimers:  map[string]*time.Timer{},
		sipNoAnswerTimers: map[string]*sipNoAnswerTimer{},
	}
	tc.p.licenseChecker = enterprise.NewLicenseChecker(tc.p.API)

	mockMetrics.On("Handler").Return(nil).Maybe()
	mockMetrics.On("ObserveAppHandlersTime", mock.Anything, mock.AnythingOfType("float64")).Maybe()
	mockMetrics.On("ObserveClusterMutexGrabTime", mock.Anything, mock.AnythingOfType("float64")).Maybe()
	mockMetrics.On("ObserveClusterMutexLockedTime", mock.Anything, mock.AnythingOfType("float64")).Maybe()
	mockMetrics.On("IncClusterMutexLockRetries", mock.Anything).Maybe()
	mockMetrics.On("IncWebSocketEvent", mock.Anything, mock.Anything).Maybe()

	dmChannel := &model.Channel{Id: tc.channelID, Type: model.ChannelTypeDirect}
	mockAPI.On("GetConfig").Return(&model.Config{}, nil).Maybe()
	mockAPI.On("GetLicense").Return(&model.License{SkuShortName: "enterprise"}, nil).Maybe()
	mockAPI.On("KVSetWithOptions", mock.Anything, mock.Anything, mock.Anything).Return(
		func(_ string, _ []byte, opts model.PluginKVSetOptions) (bool, *model.AppError) {
			// A nil OldValue is a fresh lock attempt; refreshing a held lock still works.
			return opts.OldValue != nil || !tc.lockFails.Load(), nil
		}).Maybe()
	mockAPI.On("KVDelete", mock.Anything).Return(nil).Maybe()
	mockAPI.On("PublishWebSocketEvent", mock.AnythingOfType("string"), mock.Anything,
		mock.AnythingOfType("*model.WebsocketBroadcast")).Maybe()
	mockAPI.On("HasPermissionTo", mock.AnythingOfType("string"), model.PermissionManageSystem).Return(false).Maybe()
	mockAPI.On("GetDirectChannel", tc.callerID, tc.p.botID).Return(dmChannel, nil).Maybe()
	mockAPI.On("GetChannel", tc.channelID).Return(dmChannel, nil).Maybe()
	mockAPI.On("GetChannelMembers", tc.channelID, 0, 10).Return(model.ChannelMembers{
		{ChannelId: tc.channelID, UserId: tc.callerID},
		{ChannelId: tc.channelID, UserId: tc.p.botID},
	}, nil).Maybe()
	mockAPI.On("GetUser", tc.callerID).Return(&model.User{Id: tc.callerID, Username: "caller"}, nil).Maybe()
	mockAllLogs(mockAPI)

	// Built last: newAPIRouter calls into the metrics mock.
	tc.p.apiRouter = tc.p.newAPIRouter()

	t.Cleanup(func() {
		tc.p.sipNoAnswerTimersMut.Lock()
		defer tc.p.sipNoAnswerTimersMut.Unlock()
		for _, entry := range tc.p.sipNoAnswerTimers {
			entry.timer.Stop()
		}
	})

	return tc
}

// createCall stores an active phone call in the bot DM, with its call post and
// the caller's session, confirmed or still pending.
func (tc *phoneCallTest) createCall(t *testing.T, callerConfirmed bool) (callID, postID string) {
	t.Helper()
	postID = model.NewId()
	createPost(t, tc.p.store, postID, tc.callerID, tc.channelID)
	call := &public.Call{
		ID:        model.NewId(),
		CreateAt:  time.Now().UnixMilli(),
		StartAt:   time.Now().UnixMilli(),
		ChannelID: tc.channelID,
		PostID:    postID,
		ThreadID:  postID,
		OwnerID:   tc.callerID,
		Props: public.CallProps{
			Hosts:       []string{tc.callerID},
			Type:        callTypePhone,
			PhoneNumber: testPhoneNumber,
		},
	}
	require.NoError(t, tc.p.store.CreateCall(call))

	session := &public.CallSession{ID: model.NewId(), CallID: call.ID, UserID: tc.callerID, JoinAt: time.Now().UnixMilli()}
	if callerConfirmed {
		session.ConfirmedAt = time.Now().UnixMilli()
	}
	require.NoError(t, tc.p.store.CreateCallSession(session))
	return call.ID, postID
}

// endCall ends the active call under the call lock, as a webhook would while a
// handler has the lock released for its dial. It runs on the fake LiveKit's
// goroutine, so it reports failures without stopping the test.
func (tc *phoneCallTest) endCall(t *testing.T) {
	state, err := tc.p.lockCallReturnState(tc.channelID)
	if !assert.NoError(t, err) {
		return
	}
	defer tc.p.unlockCall(tc.channelID)
	if assert.NotNil(t, state) {
		assert.NoError(t, tc.p.cleanCallState(&state.Call, "test", callEndReasonNormal))
	}
}

// activeCallID returns the ID of the active call in the bot DM, or "".
func (tc *phoneCallTest) activeCallID(t *testing.T) string {
	t.Helper()
	call, err := tc.p.store.GetActiveCallByChannelID(tc.channelID, db.GetCallOpts{FromWriter: true})
	if errors.Is(err, db.ErrNotFound) {
		return ""
	}
	require.NoError(t, err)
	return call.ID
}

func (tc *phoneCallTest) sipTimer() *sipNoAnswerTimer {
	tc.p.sipNoAnswerTimersMut.Lock()
	defer tc.p.sipNoAnswerTimersMut.Unlock()
	return tc.p.sipNoAnswerTimers[tc.channelID]
}

func (tc *phoneCallTest) expectCallPostStatus(postID, status string) {
	tc.api.On("UpdatePost", mock.MatchedBy(func(post *model.Post) bool {
		return post.Id == postID && post.GetProp("call_status") == status
	})).Return(&model.Post{Id: postID}, nil).Once()
}

func (tc *phoneCallTest) assertCallEndPublished(t *testing.T, callID, reason string) {
	t.Helper()
	tc.api.AssertCalled(t, "PublishWebSocketEvent", wsEventCallEnd, map[string]interface{}{
		"call_id":   callID,
		"reason":    reason,
		"channelID": tc.channelID,
	}, mock.Anything)
}

// callerParticipant is the caller's client as LiveKit lists it.
func (tc *phoneCallTest) callerParticipant() *livekit.ParticipantInfo {
	return &livekit.ParticipantInfo{
		Sid:      "PA_" + model.NewId(),
		Identity: composeLivekitIdentity(tc.callerID, model.NewId()),
		Kind:     livekit.ParticipantInfo_STANDARD,
	}
}

// sendWebhook delivers a signed LiveKit webhook about participant in room.
func (tc *phoneCallTest) sendWebhook(t *testing.T, room, event string, participant *livekit.ParticipantInfo) {
	t.Helper()
	w := httptest.NewRecorder()
	tc.p.apiRouter.ServeHTTP(w, newSignedWebhookRequest(t, "key", "secret", &livekit.WebhookEvent{
		Event:       event,
		Room:        &livekit.Room{Name: room},
		Participant: participant,
	}))
	require.Equal(t, http.StatusOK, w.Code)
}

// dial posts testPhoneNumber to a dialing route as the caller.
func (tc *phoneCallTest) dial(t *testing.T, route string) *httptest.ResponseRecorder {
	t.Helper()
	body, err := json.Marshal(map[string]string{"number": testPhoneNumber})
	require.NoError(t, err)
	w := httptest.NewRecorder()
	r := httptest.NewRequest(http.MethodPost, route, bytes.NewReader(body))
	r.Header.Set("Mattermost-User-Id", tc.callerID)
	tc.p.apiRouter.ServeHTTP(w, r)
	return w
}

func errorID(t *testing.T, w *httptest.ResponseRecorder) string {
	t.Helper()
	var res httpResponse
	require.NoError(t, json.NewDecoder(w.Body).Decode(&res))
	return res.ErrID
}

func shortenLockTimeout(t *testing.T) {
	prev := lockTimeout
	lockTimeout = 200 * time.Millisecond
	t.Cleanup(func() { lockTimeout = prev })
}

func TestHostEndPhoneCallReason(t *testing.T) {
	t.Run("hanging up while ringing cancels the call", func(t *testing.T) {
		tc := newPhoneCallTest(t, sipParticipantWithStatus("ringing"))
		callID, postID := tc.createCall(t, true)
		tc.expectCallPostStatus(postID, callStatusCanceledByCaller)

		require.NoError(t, tc.p.hostEnd(tc.callerID, tc.channelID))
		tc.api.AssertExpectations(t)
		tc.assertCallEndPublished(t, callID, callStatusCanceledByCaller)
	})

	t.Run("hanging up an answered call ends it", func(t *testing.T) {
		tc := newPhoneCallTest(t, sipParticipantWithStatus(sipCallStatusActive))
		_, postID := tc.createCall(t, true)
		tc.expectCallPostStatus(postID, callStatusEnded)

		require.NoError(t, tc.p.hostEnd(tc.callerID, tc.channelID))
		tc.api.AssertExpectations(t)
	})
}

func TestHandleSIPNoAnswerTimer(t *testing.T) {
	// fire arms the call's timer and runs its check straight away.
	fire := func(tc *phoneCallTest, callID string) *sipNoAnswerTimer {
		tc.p.startSIPNoAnswerTimer(tc.channelID, callID)
		entry := tc.sipTimer()
		entry.timer.Stop()
		tc.p.handleSIPNoAnswerTimer(tc.channelID, entry)
		return entry
	}

	t.Run("a callee who never answered is hung up as no answer", func(t *testing.T) {
		tc := newPhoneCallTest(t)
		tc.lk.setParticipants(sipParticipantWithStatus("ringing"), tc.callerParticipant())
		callID, postID := tc.createCall(t, true)
		tc.expectCallPostStatus(postID, callStatusNoAnswer)

		fire(tc, callID)

		require.Empty(t, tc.activeCallID(t))
		require.Nil(t, tc.sipTimer())
		tc.api.AssertExpectations(t)
		tc.assertCallEndPublished(t, callID, callStatusNoAnswer)
	})

	t.Run("an answered call with a connected caller stays up", func(t *testing.T) {
		tc := newPhoneCallTest(t)
		tc.lk.setParticipants(sipParticipantWithStatus(sipCallStatusActive), tc.callerParticipant())
		// LiveKit lists the caller before their participant_joined webhook lands.
		callID, _ := tc.createCall(t, false)

		fire(tc, callID)

		require.Equal(t, callID, tc.activeCallID(t))
		require.Nil(t, tc.sipTimer())
		tc.api.AssertNotCalled(t, "UpdatePost", mock.Anything)
	})

	t.Run("a confirmed caller LiveKit doesn't list still counts as connected", func(t *testing.T) {
		tc := newPhoneCallTest(t, sipParticipantWithStatus(sipCallStatusActive))
		callID, _ := tc.createCall(t, true)

		fire(tc, callID)

		require.Equal(t, callID, tc.activeCallID(t))
		tc.api.AssertNotCalled(t, "UpdatePost", mock.Anything)
	})

	t.Run("an answered call whose caller never connected is hung up as failed", func(t *testing.T) {
		tc := newPhoneCallTest(t, sipParticipantWithStatus(sipCallStatusActive))
		callID, postID := tc.createCall(t, false)
		tc.expectCallPostStatus(postID, callStatusFailed)

		fire(tc, callID)

		require.Empty(t, tc.activeCallID(t))
		require.Nil(t, tc.sipTimer())
		tc.api.AssertExpectations(t)
	})

	t.Run("a failed participant list leaves the call up and checks again", func(t *testing.T) {
		tc := newPhoneCallTest(t)
		tc.lk.failLists(1)
		callID, postID := tc.createCall(t, true)

		entry := fire(tc, callID)

		require.Equal(t, callID, tc.activeCallID(t))
		require.Same(t, entry, tc.sipTimer())
		require.True(t, entry.timer.Stop(), "a retry should be pending")

		// LiveKit is back by the retry, and the callee is still ringing.
		tc.lk.setParticipants(sipParticipantWithStatus("ringing"))
		tc.expectCallPostStatus(postID, callStatusNoAnswer)

		tc.p.handleSIPNoAnswerTimer(tc.channelID, entry)

		require.Empty(t, tc.activeCallID(t))
		require.Nil(t, tc.sipTimer())
		tc.api.AssertExpectations(t)
	})

	t.Run("a stale callback leaves the current call's timer alone", func(t *testing.T) {
		tc := newPhoneCallTest(t, sipParticipantWithStatus("ringing"))
		callID, _ := tc.createCall(t, true)
		tc.p.startSIPNoAnswerTimer(tc.channelID, model.NewId())
		stale := tc.sipTimer()
		stale.timer.Stop()
		tc.p.startSIPNoAnswerTimer(tc.channelID, callID)
		current := tc.sipTimer()

		tc.p.handleSIPNoAnswerTimer(tc.channelID, stale)

		require.Same(t, current, tc.sipTimer())
		require.Equal(t, callID, tc.activeCallID(t))
		tc.api.AssertNotCalled(t, "UpdatePost", mock.Anything)
	})
}

func TestHangUpSIPLeg(t *testing.T) {
	info, leg := dialedSIPLeg("PA_dialed")

	t.Run("removes the leg this dial created", func(t *testing.T) {
		lk := newFakeLiveKit(t, leg)
		newLiveKitTestPlugin(t, lk.srv.URL).hangUpSIPLeg("room", info)
		require.Equal(t, []string{leg.Identity}, lk.removedIdentities())
	})

	t.Run("leaves a redial's leg to the same number alone", func(t *testing.T) {
		_, redialed := dialedSIPLeg("PA_redialed")
		lk := newFakeLiveKit(t, redialed)
		newLiveKitTestPlugin(t, lk.srv.URL).hangUpSIPLeg("room", info)
		require.Empty(t, lk.removedIdentities())
	})

	t.Run("does nothing once the leg is gone", func(t *testing.T) {
		lk := newFakeLiveKit(t)
		newLiveKitTestPlugin(t, lk.srv.URL).hangUpSIPLeg("room", info)
		require.Empty(t, lk.removedIdentities())
	})

	t.Run("retries a failed participant list", func(t *testing.T) {
		lk := newFakeLiveKit(t, leg)
		lk.failLists(sipHangUpAttempts - 1)
		newLiveKitTestPlugin(t, lk.srv.URL).hangUpSIPLeg("room", info)
		require.Equal(t, []string{leg.Identity}, lk.removedIdentities())
	})

	t.Run("retries a failed removal", func(t *testing.T) {
		lk := newFakeLiveKit(t, leg)
		lk.failRemovals(sipHangUpAttempts - 1)
		newLiveKitTestPlugin(t, lk.srv.URL).hangUpSIPLeg("room", info)
		require.Equal(t, []string{leg.Identity}, lk.removedIdentities())
	})

	t.Run("gives up after the last attempt", func(t *testing.T) {
		lk := newFakeLiveKit(t, leg)
		lk.failRemovals(sipHangUpAttempts)
		newLiveKitTestPlugin(t, lk.srv.URL).hangUpSIPLeg("room", info)
		require.Empty(t, lk.removedIdentities())
	})
}

func TestHandlePhoneCallAfterDial(t *testing.T) {
	failedDial := func() (*livekit.SIPParticipantInfo, error) {
		return nil, errors.New("trunk unavailable")
	}

	t.Run("a successful dial announces the call and arms the no-answer timer", func(t *testing.T) {
		tc := newPhoneCallTest(t)
		info, leg := dialedSIPLeg("PA_dialed")
		tc.lk.setDial(func() (*livekit.SIPParticipantInfo, error) {
			tc.lk.setParticipants(leg)
			return info, nil
		})
		tc.api.On("CreatePost", mock.AnythingOfType("*model.Post")).Return(&model.Post{Id: model.NewId()}, nil).Once()

		w := tc.dial(t, "/phone-call")

		require.Equal(t, http.StatusOK, w.Code)
		var res phoneCallResponse
		require.NoError(t, json.NewDecoder(w.Body).Decode(&res))
		require.Equal(t, info.SipCallId, res.SIPCallID)
		require.Equal(t, res.CallID, tc.activeCallID(t))
		require.Equal(t, res.CallID, tc.sipTimer().callID)
		require.Empty(t, tc.lk.removedIdentities())
		tc.api.AssertExpectations(t)
	})

	t.Run("a call that ends during the dial hangs up the SIP leg", func(t *testing.T) {
		tc := newPhoneCallTest(t)
		info, leg := dialedSIPLeg("PA_dialed")
		tc.lk.setDial(func() (*livekit.SIPParticipantInfo, error) {
			tc.lk.setParticipants(leg)
			tc.endCall(t)
			return info, nil
		})

		w := tc.dial(t, "/phone-call")

		require.Equal(t, http.StatusConflict, w.Code)
		require.Equal(t, errIDCallEnded, errorID(t, w))
		require.Equal(t, []string{leg.Identity}, tc.lk.removedIdentities())
		require.Nil(t, tc.sipTimer())
		tc.api.AssertNotCalled(t, "CreatePost", mock.Anything)
	})

	t.Run("a call replaced during the dial hangs up the SIP leg", func(t *testing.T) {
		tc := newPhoneCallTest(t)
		info, leg := dialedSIPLeg("PA_dialed")
		newCallID := model.NewId()
		tc.lk.setDial(func() (*livekit.SIPParticipantInfo, error) {
			tc.lk.setParticipants(leg)
			tc.endCall(t)
			now := time.Now().UnixMilli()
			assert.NoError(t, tc.p.store.CreateCall(&public.Call{
				ID: newCallID, CreateAt: now, StartAt: now, ChannelID: tc.channelID, OwnerID: tc.callerID,
			}))
			return info, nil
		})

		w := tc.dial(t, "/phone-call")

		require.Equal(t, http.StatusConflict, w.Code)
		require.Equal(t, errIDCallEnded, errorID(t, w))
		require.Equal(t, []string{leg.Identity}, tc.lk.removedIdentities())
		require.Equal(t, newCallID, tc.activeCallID(t))
		require.Nil(t, tc.sipTimer())
		tc.api.AssertNotCalled(t, "CreatePost", mock.Anything)
	})

	t.Run("a failed dial is rolled back when the re-lock fails", func(t *testing.T) {
		shortenLockTimeout(t)
		tc := newPhoneCallTest(t)
		tc.lk.setDial(func() (*livekit.SIPParticipantInfo, error) {
			tc.lockFails.Store(true)
			return failedDial()
		})

		w := tc.dial(t, "/phone-call")
		require.Equal(t, http.StatusInternalServerError, w.Code)
		tc.lockFails.Store(false)

		require.Empty(t, tc.activeCallID(t))

		// The redial gets as far as dialing rather than being refused as call_in_progress.
		tc.lk.setDial(failedDial)
		w = tc.dial(t, "/phone-call")
		require.Equal(t, errIDDialFailed, errorID(t, w))
	})

	t.Run("a successful dial is hung up and rolled back when the re-lock fails", func(t *testing.T) {
		shortenLockTimeout(t)
		tc := newPhoneCallTest(t)
		info, leg := dialedSIPLeg("PA_dialed")
		tc.lk.setDial(func() (*livekit.SIPParticipantInfo, error) {
			tc.lk.setParticipants(leg)
			tc.lockFails.Store(true)
			return info, nil
		})

		w := tc.dial(t, "/phone-call")
		require.Equal(t, http.StatusInternalServerError, w.Code)
		tc.lockFails.Store(false)

		require.Equal(t, []string{leg.Identity}, tc.lk.removedIdentities())
		require.Empty(t, tc.activeCallID(t))
		require.Nil(t, tc.sipTimer())
		tc.api.AssertNotCalled(t, "CreatePost", mock.Anything)
	})
}

func TestHandleAddPhoneCallAfterDial(t *testing.T) {
	t.Run("no active call has a stable error id", func(t *testing.T) {
		tc := newPhoneCallTest(t)

		w := tc.dial(t, "/add-phone-call")

		require.Equal(t, http.StatusBadRequest, w.Code)
		require.Equal(t, errIDNoActiveCall, errorID(t, w))
	})

	t.Run("a successful dial returns the call", func(t *testing.T) {
		tc := newPhoneCallTest(t)
		callID, _ := tc.createCall(t, true)
		info, leg := dialedSIPLeg("PA_dialed")
		tc.lk.setDial(func() (*livekit.SIPParticipantInfo, error) {
			tc.lk.setParticipants(leg)
			return info, nil
		})

		w := tc.dial(t, "/add-phone-call")

		require.Equal(t, http.StatusOK, w.Code)
		var res map[string]string
		require.NoError(t, json.NewDecoder(w.Body).Decode(&res))
		require.Equal(t, callID, res["call_id"])
		require.Equal(t, info.SipCallId, res["sip_call_id"])
		require.Empty(t, tc.lk.removedIdentities())
	})

	t.Run("a caller who leaves during the dial gets the SIP leg hung up", func(t *testing.T) {
		tc := newPhoneCallTest(t)
		callID, _ := tc.createCall(t, true)
		info, leg := dialedSIPLeg("PA_dialed")
		tc.lk.setDial(func() (*livekit.SIPParticipantInfo, error) {
			tc.lk.setParticipants(leg)
			_, err := tc.p.store.DeleteCallsSessions(callID)
			assert.NoError(t, err)
			return info, nil
		})

		w := tc.dial(t, "/add-phone-call")

		require.Equal(t, http.StatusBadRequest, w.Code)
		require.Equal(t, errIDNoActiveCall, errorID(t, w))
		require.Equal(t, []string{leg.Identity}, tc.lk.removedIdentities())
	})

	t.Run("a call that ends during the dial gets the SIP leg hung up", func(t *testing.T) {
		tc := newPhoneCallTest(t)
		tc.createCall(t, true)
		tc.api.On("UpdatePost", mock.AnythingOfType("*model.Post")).Return(&model.Post{}, nil).Maybe()
		info, leg := dialedSIPLeg("PA_dialed")
		tc.lk.setDial(func() (*livekit.SIPParticipantInfo, error) {
			tc.lk.setParticipants(leg)
			tc.endCall(t)
			return info, nil
		})

		w := tc.dial(t, "/add-phone-call")

		require.Equal(t, http.StatusBadRequest, w.Code)
		require.Equal(t, errIDNoActiveCall, errorID(t, w))
		require.Equal(t, []string{leg.Identity}, tc.lk.removedIdentities())
	})
}

func TestParticipantJoinedAfterPhoneCallEnded(t *testing.T) {
	t.Run("a caller who joins after the carrier rejected the call is removed", func(t *testing.T) {
		tc := newPhoneCallTest(t)
		callID, postID := tc.createCall(t, false)
		tc.expectCallPostStatus(postID, callStatusDeclined)

		_, leg := dialedSIPLeg("PA_dialed")
		tc.sendWebhook(t, tc.channelID, webhook.EventParticipantJoined, leg)
		leg.DisconnectReason = livekit.DisconnectReason_USER_REJECTED
		tc.sendWebhook(t, tc.channelID, webhook.EventParticipantLeft, leg)

		require.Empty(t, tc.activeCallID(t))
		tc.assertCallEndPublished(t, callID, callStatusDeclined)

		// The caller's client finishes connecting into a room LiveKit recreated for it.
		caller := tc.callerParticipant()
		tc.sendWebhook(t, tc.channelID, webhook.EventParticipantJoined, caller)

		require.Equal(t, []string{caller.Identity}, tc.lk.removedIdentities())
		require.Empty(t, tc.activeCallID(t))
		tc.api.AssertExpectations(t)
	})

	t.Run("a participant joining a regular channel with no call is left alone", func(t *testing.T) {
		tc := newPhoneCallTest(t)
		channelID := model.NewId()
		tc.api.On("GetChannel", channelID).Return(&model.Channel{Id: channelID, Type: model.ChannelTypeOpen}, nil)

		tc.sendWebhook(t, channelID, webhook.EventParticipantJoined, tc.callerParticipant())

		require.Empty(t, tc.lk.removedIdentities())
	})
}
