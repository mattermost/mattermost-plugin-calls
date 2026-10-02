// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"golang.org/x/time/rate"
	"google.golang.org/protobuf/proto"

	"github.com/mattermost/mattermost-plugin-calls/server/cluster"
	"github.com/mattermost/mattermost-plugin-calls/server/enterprise"
	"github.com/mattermost/mattermost-plugin-calls/server/public"

	serverMocks "github.com/mattermost/mattermost-plugin-calls/server/mocks/github.com/mattermost/mattermost-plugin-calls/server/interfaces"
	pluginMocks "github.com/mattermost/mattermost-plugin-calls/server/mocks/github.com/mattermost/mattermost/server/public/plugin"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/plugin"

	"github.com/livekit/protocol/livekit"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
)

// newFakeLiveKitRoomService serves the Twirp RoomService.ListParticipants
// endpoint with a fixed participant list, so code that asks LiveKit about the
// SIP leg can be exercised without a LiveKit server.
func newFakeLiveKitRoomService(t *testing.T, participants []*livekit.ParticipantInfo) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(r.Body)
		require.NoError(t, err)

		var resp proto.Message
		switch {
		case strings.HasSuffix(r.URL.Path, "/livekit.RoomService/ListParticipants"):
			var req livekit.ListParticipantsRequest
			require.NoError(t, proto.Unmarshal(body, &req))
			resp = &livekit.ListParticipantsResponse{Participants: participants}
		case strings.HasSuffix(r.URL.Path, "/livekit.RoomService/DeleteRoom"):
			resp = &livekit.DeleteRoomResponse{}
		default:
			http.Error(w, "unexpected call: "+r.URL.Path, http.StatusNotFound)
			return
		}

		data, err := proto.Marshal(resp)
		require.NoError(t, err)
		w.Header().Set("Content-Type", "application/protobuf")
		_, _ = w.Write(data)
	}))
	t.Cleanup(srv.Close)
	return srv
}

func sipParticipantWithStatus(status string) *livekit.ParticipantInfo {
	return &livekit.ParticipantInfo{
		Sid:        model.NewId(),
		Identity:   "sip:+14155551234",
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

func TestPhoneCallerHangupReason(t *testing.T) {
	newPlugin := func(t *testing.T, lkURL string) *Plugin {
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
	phoneCall := &public.Call{Props: public.CallProps{Type: callTypePhone}}

	t.Run("non-phone call is a normal end", func(t *testing.T) {
		p := newPlugin(t, newFakeLiveKitRoomService(t, []*livekit.ParticipantInfo{sipParticipantWithStatus("ringing")}).URL)
		require.Equal(t, callEndReasonNormal, p.phoneCallerHangupReason(&public.Call{}, "channelID"))
	})

	t.Run("livekit not configured falls back to ended", func(t *testing.T) {
		p := newPlugin(t, "")
		require.Equal(t, callEndReasonNormal, p.phoneCallerHangupReason(phoneCall, "channelID"))
	})

	t.Run("callee still ringing means canceled", func(t *testing.T) {
		p := newPlugin(t, newFakeLiveKitRoomService(t, []*livekit.ParticipantInfo{sipParticipantWithStatus("ringing")}).URL)
		require.Equal(t, callEndReasonCanceledByCaller, p.phoneCallerHangupReason(phoneCall, "channelID"))
	})

	t.Run("callee still dialing means canceled", func(t *testing.T) {
		p := newPlugin(t, newFakeLiveKitRoomService(t, []*livekit.ParticipantInfo{sipParticipantWithStatus("dialing")}).URL)
		require.Equal(t, callEndReasonCanceledByCaller, p.phoneCallerHangupReason(phoneCall, "channelID"))
	})

	t.Run("callee answered means ended", func(t *testing.T) {
		p := newPlugin(t, newFakeLiveKitRoomService(t, []*livekit.ParticipantInfo{sipParticipantWithStatus(sipCallStatusActive)}).URL)
		require.Equal(t, callEndReasonNormal, p.phoneCallerHangupReason(phoneCall, "channelID"))
	})

	t.Run("no SIP leg in the room means ended", func(t *testing.T) {
		p := newPlugin(t, newFakeLiveKitRoomService(t, []*livekit.ParticipantInfo{{
			Identity: "user___session", Kind: livekit.ParticipantInfo_STANDARD,
		}}).URL)
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

func TestHostEndPhoneCallReason(t *testing.T) {
	newPlugin := func(t *testing.T, lkURL string) (*Plugin, *pluginMocks.MockAPI) {
		t.Helper()
		mockAPI := &pluginMocks.MockAPI{}
		mockMetrics := &serverMocks.MockMetrics{}

		store, tearDown := NewTestStore(t)
		t.Cleanup(tearDown)

		cfg := &configuration{}
		cfg.SetDefaults()
		cfg.DefaultEnabled = model.NewPointer(true)
		cfg.LiveKitURL = lkURL
		cfg.LiveKitAPIKey = "key"
		cfg.LiveKitAPISecret = "secret"

		p := &Plugin{
			MattermostPlugin:  plugin.MattermostPlugin{API: mockAPI},
			metrics:           mockMetrics,
			callsClusterLocks: map[string]*cluster.Mutex{},
			store:             store,
			nodeID:            "test-node",
			botID:             model.NewId(),
			configuration:     cfg,
			dirtyCalls:        map[string]struct{}{},
			dirtyCallsCh:      make(chan struct{}, 1),
			dmNoAnswerTimers:  map[string]*time.Timer{},
			sipNoAnswerTimers: map[string]*time.Timer{},
		}
		p.licenseChecker = enterprise.NewLicenseChecker(p.API)

		mockMetrics.On("ObserveAppHandlersTime", mock.Anything, mock.AnythingOfType("float64")).Maybe()
		mockMetrics.On("ObserveClusterMutexGrabTime", mock.Anything, mock.AnythingOfType("float64")).Maybe()
		mockMetrics.On("ObserveClusterMutexLockedTime", mock.Anything, mock.AnythingOfType("float64")).Maybe()
		mockMetrics.On("IncWebSocketEvent", mock.Anything, mock.Anything).Maybe()
		mockAPI.On("GetConfig").Return(&model.Config{}, nil).Maybe()
		mockAPI.On("GetLicense").Return(&model.License{SkuShortName: "enterprise"}, nil).Maybe()
		mockAPI.On("KVSetWithOptions", mock.Anything, mock.Anything, mock.Anything).Return(true, nil).Maybe()
		mockAPI.On("KVDelete", mock.Anything).Return(nil).Maybe()
		mockAPI.On("PublishWebSocketEvent", mock.AnythingOfType("string"), mock.Anything,
			mock.AnythingOfType("*model.WebsocketBroadcast")).Maybe()
		mockAPI.On("HasPermissionTo", mock.AnythingOfType("string"), model.PermissionManageSystem).Return(false).Maybe()
		mockAllLogs(mockAPI)
		return p, mockAPI
	}

	// Build a phone call owned by the caller, with its call post in the store.
	setupPhoneCall := func(t *testing.T, p *Plugin, channelID, callerID string) string {
		t.Helper()
		postID := model.NewId()
		createPost(t, p.store, postID, callerID, channelID)
		call := &public.Call{
			ID:        model.NewId(),
			CreateAt:  time.Now().UnixMilli(),
			StartAt:   time.Now().UnixMilli(),
			ChannelID: channelID,
			PostID:    postID,
			ThreadID:  postID,
			OwnerID:   callerID,
			Props: public.CallProps{
				Hosts:       []string{callerID},
				Type:        callTypePhone,
				PhoneNumber: "+14155551234",
			},
		}
		require.NoError(t, p.store.CreateCall(call))
		require.NoError(t, p.store.CreateCallSession(&public.CallSession{
			ID: model.NewId(), CallID: call.ID, UserID: callerID, JoinAt: time.Now().UnixMilli(), ConfirmedAt: time.Now().UnixMilli(),
		}))
		return postID
	}

	t.Run("hanging up while ringing cancels the call", func(t *testing.T) {
		lk := newFakeLiveKitRoomService(t, []*livekit.ParticipantInfo{sipParticipantWithStatus("ringing")})
		p, mockAPI := newPlugin(t, lk.URL)
		channelID, callerID := model.NewId(), model.NewId()
		postID := setupPhoneCall(t, p, channelID, callerID)

		mockAPI.On("UpdatePost", mock.MatchedBy(func(post *model.Post) bool {
			return post.Id == postID && post.GetProp("call_status") == callStatusCanceledByCaller
		})).Return(&model.Post{Id: postID}, nil).Once()

		require.NoError(t, p.hostEnd(callerID, channelID))
		mockAPI.AssertExpectations(t)
	})

	t.Run("hanging up an answered call ends it", func(t *testing.T) {
		lk := newFakeLiveKitRoomService(t, []*livekit.ParticipantInfo{sipParticipantWithStatus(sipCallStatusActive)})
		p, mockAPI := newPlugin(t, lk.URL)
		channelID, callerID := model.NewId(), model.NewId()
		postID := setupPhoneCall(t, p, channelID, callerID)

		mockAPI.On("UpdatePost", mock.MatchedBy(func(post *model.Post) bool {
			return post.Id == postID && post.GetProp("call_status") == callStatusEnded
		})).Return(&model.Post{Id: postID}, nil).Once()

		require.NoError(t, p.hostEnd(callerID, channelID))
		mockAPI.AssertExpectations(t)
	})
}
