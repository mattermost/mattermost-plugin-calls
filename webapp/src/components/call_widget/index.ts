import {injectIntl} from 'react-intl';
import {connect} from 'react-redux';
import {bindActionCreators, Dispatch} from 'redux';

import {GlobalState} from '@mattermost/types/store';
import {getChannel} from 'mattermost-redux/selectors/entities/channels';
import {getTeam, getCurrentTeamId, getMyTeams} from 'mattermost-redux/selectors/entities/teams';
import {getCurrentUserId} from 'mattermost-redux/selectors/entities/users';
import {recordingPromptDismissedAt, showExpandedView, showScreenSourceModal, trackEvent} from 'src/actions';
import {
    sessionsInCurrentCall,
    callStartAtForCurrentCall,
    screenSharingSessionForCurrentCall,
    expandedView,
    getChannelUrlAndDisplayName,
    allowScreenSharing,
    profilesInCurrentCallMap,
    hostIDForCurrentCall,
    hostChangeAtForCurrentCall,
    recordingForCurrentCall,
    sortedIncomingCalls,
    recentlyJoinedUsersInCurrentCall,
    sessionForCurrentCall,
} from 'src/selectors';
import {alphaSortSessions, stateSortSessions} from 'src/utils';

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

    return {
        currentUserID,
        channel,
        team: getTeam(state, channel?.team_id || getCurrentTeamId(state)),
        channelURL,
        channelDisplayName,
        sessions,
        currentSession: sessionForCurrentCall(state),
        profiles,
        callStartAt: callStartAtForCurrentCall(state),
        callHostID: hostIDForCurrentCall(state),
        callHostChangeAt: hostChangeAtForCurrentCall(state),
        callRecording: recordingForCurrentCall(state),
        screenSharingSession,
        allowScreenSharing: allowScreenSharing(state),
        show: !expandedView(state),
        recentlyJoinedUsers: recentlyJoinedUsersInCurrentCall(state),
        wider: getMyTeams(state)?.length > 1,
        callsIncoming: sortedIncomingCalls(state),
    };
};

const mapDispatchToProps = (dispatch: Dispatch) => bindActionCreators({
    showExpandedView,
    showScreenSourceModal,
    trackEvent,
    recordingPromptDismissedAt,
}, dispatch);

export default injectIntl(connect(mapStateToProps, mapDispatchToProps)(CallWidget));

