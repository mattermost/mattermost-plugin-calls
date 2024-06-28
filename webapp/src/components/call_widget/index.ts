import {GlobalState} from '@mattermost/types/store';
import {getChannel} from 'mattermost-redux/selectors/entities/channels';
import {getCurrentTeamId, getMyTeams, getTeam} from 'mattermost-redux/selectors/entities/teams';
import {getCurrentUserId} from 'mattermost-redux/selectors/entities/users';
import {injectIntl} from 'react-intl';
import {connect} from 'react-redux';
import {bindActionCreators, Dispatch} from 'redux';
import {
    recordingPromptDismissedAt,
    selectRHSPost,
    showExpandedView,
    showScreenSourceModal,
    startCallRecording,
    stopCallRecording,
    trackEvent,
} from 'src/actions';
import {
    allowScreenSharing,
    callStartAtForCurrentCall,
    clientConnecting,
    expandedView,
    getChannelUrlAndDisplayName,
    hostChangeAtForCurrentCall,
    hostControlNoticesForCurrentCall,
    hostIDForCurrentCall,
    isRecordingInCurrentCall,
    profilesInCurrentCallMap,
    recentlyJoinedUsersInCurrentCall,
    recordingForCurrentCall,
    recordingsEnabled,
    screenSharingSessionForCurrentCall,
    sessionForCurrentCall,
    sessionsInCurrentCall,
    sessionsInCurrentCallMap,
    sortedIncomingCalls,
    threadIDForCallInChannel,
    transcriptionsEnabled,
} from 'src/selectors';
import {alphaSortSessions, stateSortSessions} from 'src/utils';
import {modals} from 'src/webapp_globals';

import CallWidget from './component';

const mapStateToProps = (state: GlobalState) => {
    // Using the channelID from the client since we could connect before
    // receiving the user connected event and still want to go ahead and show the widget.
    // Also, it would be possible to lose the event altogether if connecting to
    // the call while in a ws reconnection handler.
    const channel = getChannel(state, String(window.callsClient?.channelID));
    const currentUserID = getCurrentUserId(state);

    const screenSharingSession = screenSharingSessionForCurrentCall(state);

    const profiles = profilesInCurrentCallMap(state);
    const sessions = sessionsInCurrentCall(state)
        .sort(alphaSortSessions(profiles))
        .sort(stateSortSessions(screenSharingSession?.session_id || '', true));

    const {channelURL, channelDisplayName} = getChannelUrlAndDisplayName(state, channel);

    const callThreadID = threadIDForCallInChannel(state, channel?.id || '');

    return {
        currentUserID,
        channel,
        team: getTeam(state, channel?.team_id || getCurrentTeamId(state)),
        channelURL,
        channelDisplayName,
        sessions,
        sessionsMap: sessionsInCurrentCallMap(state),
        currentSession: sessionForCurrentCall(state),
        profiles,
        callStartAt: callStartAtForCurrentCall(state),
        callHostID: hostIDForCurrentCall(state),
        callHostChangeAt: hostChangeAtForCurrentCall(state),
        callRecording: recordingForCurrentCall(state),
        isRecording: isRecordingInCurrentCall(state),
        screenSharingSession,
        allowScreenSharing: allowScreenSharing(state),
        show: !expandedView(state),
        recentlyJoinedUsers: recentlyJoinedUsersInCurrentCall(state),
        hostNotices: hostControlNoticesForCurrentCall(state),
        wider: getMyTeams(state)?.length > 1,
        callsIncoming: sortedIncomingCalls(state),
        transcriptionsEnabled: transcriptionsEnabled(state),
        clientConnecting: clientConnecting(state),
        callThreadID,
        recordingsEnabled: recordingsEnabled(state),
    };
};

const mapDispatchToProps = (dispatch: Dispatch) => bindActionCreators({
    showExpandedView,
    showScreenSourceModal,
    trackEvent,
    recordingPromptDismissedAt,
    selectRHSPost,
    startCallRecording,
    stopCallRecording,
    openModal: modals?.openModal,
}, dispatch);

export default injectIntl(connect(mapStateToProps, mapDispatchToProps)(CallWidget));
