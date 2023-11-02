import {connect} from 'react-redux';
import {withRouter} from 'react-router-dom';

import {GlobalState} from '@mattermost/types/store';
import {getCurrentTeamId, getTeam} from 'mattermost-redux/selectors/entities/teams';
import {getThread} from 'mattermost-redux/selectors/entities/threads';
import {getCurrentUserId, getUser} from 'mattermost-redux/selectors/entities/users';
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
    recordingForCurrentCall,
    isRecordingInCurrentCall,
    expandedView,
    getChannelUrlAndDisplayName,
    recordingMaxDuration,
    recordingsEnabled,
    hostIDForCurrentCall,
    hostChangeAtForCurrentCall,
    callStartAtForCurrentCall,
    threadIDForCallInChannel,
    screenSharingSessionForCurrentCall,
    channelForCurrentCall,
    sessionsInCurrentCall,
    sessionForCurrentCall,
    profilesInCurrentCallMap,
} from 'src/selectors';
import {alphaSortSessions, getUserIdFromDM, isDMChannel, stateSortSessions} from 'src/utils';
import {closeRhs, getIsRhsOpen, getRhsSelectedPostId, selectRhsPost} from 'src/webapp_globals';

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
};

export default withRouter(connect(mapStateToProps, mapDispatchToProps)(ExpandedView));
