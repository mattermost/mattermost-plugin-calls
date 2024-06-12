import {GlobalState} from '@mattermost/types/store';
import {getCurrentTeamId, getTeam} from 'mattermost-redux/selectors/entities/teams';
import {getThread} from 'mattermost-redux/selectors/entities/threads';
import {getCurrentUserId, getUser, isCurrentUserSystemAdmin} from 'mattermost-redux/selectors/entities/users';
import {connect} from 'react-redux';
import {withRouter} from 'react-router-dom';
import {
    hideExpandedView,
    prefetchThread,
    recordingPromptDismissedAt,
    showScreenSourceModal,
    startCallRecording,
    trackEvent,
} from 'src/actions';
import {
    allowScreenSharing,
    areHostControlsAllowed,
    callStartAtForCurrentCall,
    channelForCurrentCall,
    expandedView,
    getChannelUrlAndDisplayName,
    hostChangeAtForCurrentCall,
    hostIDForCurrentCall,
    isRecordingInCurrentCall,
    profilesInCurrentCallMap,
    recordingForCurrentCall,
    recordingMaxDuration,
    recordingsEnabled,
    screenSharingSessionForCurrentCall,
    sessionForCurrentCall,
    sessionsInCurrentCall,
    sessionsInCurrentCallMap,
    threadIDForCallInChannel,
    transcriptionsEnabled,
} from 'src/selectors';
import {alphaSortSessions, getUserIdFromDM, isDMChannel, stateSortSessions} from 'src/utils';
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
    const sessions = sessionsInCurrentCall(state)
        .sort(alphaSortSessions(profiles))
        .sort(stateSortSessions(screenSharingSession?.session_id || '', true));

    let connectedDMUser;
    if (channel && isDMChannel(channel)) {
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
        callStartAt: callStartAtForCurrentCall(state),
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
    };
};

const mapDispatchToProps = {
    hideExpandedView,
    showScreenSourceModal,
    closeRhs,
    selectRhsPost,
    prefetchThread,
    trackEvent,
    startCallRecording,
    recordingPromptDismissedAt,
    openModal: modals.openModal,
};

export default withRouter(connect(mapStateToProps, mapDispatchToProps)(ExpandedView));
