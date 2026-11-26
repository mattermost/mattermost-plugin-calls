// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {GlobalState} from '@mattermost/types/store';
import {getCurrentTeamId, getTeam} from 'mattermost-redux/selectors/entities/teams';
import {getThread} from 'mattermost-redux/selectors/entities/threads';
import {getCurrentUserId, getUser, isCurrentUserSystemAdmin} from 'mattermost-redux/selectors/entities/users';
import {connect} from 'react-redux';
import {withRouter} from 'react-router-dom';
import {
    fetchCallState,
    hideExpandedView,
    prefetchThread,
    recordingPromptDismissedAt,
    showScreenSourceModal,
    startCallRecording,
} from 'src/actions';
import {CallStoreSyncOptions, syncCallClientToStore} from 'src/call_store_sync';
import type CallClient from 'src/clients/call';
import {
    allowScreenSharing,
    areHostControlsAllowed,
    channelForCurrentCall,
    clientConnecting,
    expandedView,
    getChannelUrlAndDisplayName,
    hostChangeAtForCurrentCall,
    hostIDForCurrentCall,
    isCurrentDMCallInCallingState,
    isRecordingInCurrentCall,
    recordingForCurrentCall,
    recordingMaxDuration,
    recordingsEnabled,
    threadIDForCallInChannel,
    transcriptionsEnabled,
} from 'src/selectors';
import {screenSharingSessionForCurrentCall} from 'src/state/screen_sharing_ids/selectors';
import {
    profilesInCurrentCallMap,
    sessionForCurrentCall,
    sessionsForOtherUsersInCall,
    sessionsInCurrentCall,
    sessionsInCurrentCallMap,
} from 'src/state/session/selectors';
import {Dispatch} from 'src/types/mattermost-webapp';
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

    return {
        show: expandedView(state),
        currentUserID,
        currentTeamID,
        profiles,
        sessions,
        sessionsMap: sessionsInCurrentCallMap(state),
        currentSession: sessionForCurrentCall(state),
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
        otherSessions: sessionsForOtherUsersInCall(state),
        isDMCalling: isCurrentDMCallInCallingState(state),
        clientConnecting: clientConnecting(state),
    };
};

const mapDispatchToProps = {
    fetchCallState,
    hideExpandedView,
    showScreenSourceModal,
    closeRhs,
    selectRhsPost,
    prefetchThread,
    startCallRecording,
    recordingPromptDismissedAt,
    openModal: modals.openModal,
    syncCallClientToStore: (client: CallClient, options: CallStoreSyncOptions) => (dispatch: Dispatch, getState: () => GlobalState) =>
        syncCallClientToStore(client, {dispatch, getState}, options),
};

export default withRouter(connect(mapStateToProps, mapDispatchToProps)(ExpandedView));
