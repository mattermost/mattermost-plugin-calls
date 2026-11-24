// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {GlobalState} from '@mattermost/types/store';
import {getCurrentTeamId, getTeam} from 'mattermost-redux/selectors/entities/teams';
import {getThread} from 'mattermost-redux/selectors/entities/threads';
import {getCurrentUserId, getUser, isCurrentUserSystemAdmin} from 'mattermost-redux/selectors/entities/users';
import {connect} from 'react-redux';
import {withRouter} from 'react-router-dom';
import {
    callHostChanged,
    fetchCallState,
    hideExpandedView,
    joinUser,
    leaveUser,
    liveCaptionReceived,
    prefetchThread,
    recordingPromptDismissedAt,
    showScreenSourceModal,
    startCallRecording,
} from 'src/actions';
import {
    allowScreenSharing,
    areHostControlsAllowed,
    channelForCurrentCall,
    clientConnecting,
    dmVideoEnabled,
    expandedView,
    getChannelUrlAndDisplayName,
    hostChangeAtForCurrentCall,
    hostIDForCurrentCall,
    isCurrentCallPhoneCall,
    isCurrentDMCallInCallingState,
    isRecordingInCurrentCall,
    recordingForCurrentCall,
    recordingMaxDuration,
    recordingsEnabled,
    threadIDForCallInChannel,
    transcriptionsEnabled,
} from 'src/selectors';
import {userCameraChanged} from 'src/state/camera_on_ids/actions';
import {isCameraOnForSession} from 'src/state/camera_on_ids/selectors';
import {localSessionReconnected, localSessionReconnecting, sessionConnectionQualityChanged} from 'src/state/connection_quality/actions';
import {connectionStateForSession} from 'src/state/connection_quality/selectors';
import {userScreenShared, userScreenUnshared} from 'src/state/screen_sharing_ids/actions';
import {screenSharingSessionForCurrentCall} from 'src/state/screen_sharing_ids/selectors';
import {userLoweredHand, userMuted, userRaisedHand, userReacted, userReactedTimeout, usersVoiceActivityChanged, userUnmuted} from 'src/state/session/actions';
import {
    profilesInCurrentCallMap,
    sessionForCurrentCall,
    sessionsForOtherUsersInCall,
    sessionsInCurrentCall,
    sessionsInCurrentCallMap,
} from 'src/state/session/selectors';
import {alphaSortSessions, getUserIdFromDM, isDMChannel, selfFirstSortSessions, stateSortSessions} from 'src/utils';
import {closeRhs, getIsRhsOpen, getRhsSelectedPostId, modals, selectRhsPost} from 'src/webapp_globals';

import ExpandedView from './component';

const mapStateToProps = (state: GlobalState) => {
    const currentUserID = getCurrentUserId(state);
    const currentTeamID = getCurrentTeamId(state);
    const channel = channelForCurrentCall(state);
    const channelTeam = getTeam(state, channel?.team_id || '');
    const screenSharingSession = screenSharingSessionForCurrentCall(state);
    const threadID = threadIDForCallInChannel(state, channel?.id || '');

    const profiles = profilesInCurrentCallMap(state);
    const isDM = isDMChannel(channel);
    const sessions = sessionsInCurrentCall(state)
        .sort(alphaSortSessions(profiles))
        .sort(isDM ? selfFirstSortSessions(currentUserID) : stateSortSessions(screenSharingSession?.session_id || '', true));

    let connectedDMUser;
    if (channel && isDM) {
        const otherID = getUserIdFromDM(channel.name, currentUserID);
        connectedDMUser = getUser(state, otherID);
    }

    const {channelDisplayName} = getChannelUrlAndDisplayName(state, channel);

    const thread = getThread(state, threadID);
    const currentSession = sessionForCurrentCall(state);
    const otherSessions = sessionsForOtherUsersInCall(state);

    return {
        show: expandedView(state),
        currentUserID,
        currentTeamID,
        profiles,
        sessions,
        sessionsMap: sessionsInCurrentCallMap(state),
        currentSession,
        callHostID: hostIDForCurrentCall(state),
        callHostChangeAt: hostChangeAtForCurrentCall(state),
        callRecording: recordingForCurrentCall(state),
        isRecording: isRecordingInCurrentCall(state),
        screenSharingSession,
        channel,
        channelTeam,
        channelDisplayName,
        connectedDMUser,
        threadID,
        threadUnreadReplies: thread?.unread_replies,
        threadUnreadMentions: thread?.unread_mentions,
        rhsSelectedThreadID: getRhsSelectedPostId?.(state),
        isRhsOpen: getIsRhsOpen?.(state),
        allowScreenSharing: allowScreenSharing(state),
        recordingsEnabled: recordingsEnabled(state),
        recordingMaxDuration: recordingMaxDuration(state),
        transcriptionsEnabled: transcriptionsEnabled(state),
        isAdmin: isCurrentUserSystemAdmin(state),
        hostControlsAllowed: areHostControlsAllowed(state),
        otherSessions,
        isDMCalling: isCurrentDMCallInCallingState(state),
        clientConnecting: clientConnecting(state),
        dmVideoEnabled: dmVideoEnabled(state),
        isPhoneCall: isCurrentCallPhoneCall(state),
        isCameraOn: isCameraOnForSession(state, currentSession?.session_id ?? ''),
        ownConnectionState: connectionStateForSession(state, currentSession?.session_id ?? ''),
    };
};

const mapDispatchToProps = {
    callHostChanged,
    fetchCallState,
    hideExpandedView,
    liveCaptionReceived,
    showScreenSourceModal,
    closeRhs,
    selectRhsPost,
    prefetchThread,
    startCallRecording,
    recordingPromptDismissedAt,
    openModal: modals.openModal,
    userMuted,
    userUnmuted,
    userCameraChanged,
    sessionConnectionQualityChanged,
    localSessionReconnecting,
    localSessionReconnected,
    joinUser,
    leaveUser,
    usersVoiceActivityChanged,
    userRaisedHand,
    userLoweredHand,
    userReacted,
    userReactedTimeout,
    userScreenShared,
    userScreenUnshared,
};

export default withRouter(connect(mapStateToProps, mapDispatchToProps)(ExpandedView));
