import {UserState} from '@calls/common/lib/types';
import {GlobalState} from '@mattermost/types/store';
import {UserProfile} from '@mattermost/types/users';
import {IDMappedObjects} from '@mattermost/types/utilities';
import {Client4} from 'mattermost-redux/client';
import {getChannel} from 'mattermost-redux/selectors/entities/channels';
import {getTeam, getCurrentTeamId, getMyTeams} from 'mattermost-redux/selectors/entities/teams';
import {getCurrentUserId} from 'mattermost-redux/selectors/entities/users';
import {injectIntl} from 'react-intl';
import {connect} from 'react-redux';
import {bindActionCreators, Dispatch} from 'redux';

import {recordingPromptDismissedAt, showExpandedView, showScreenSourceModal, trackEvent} from 'src/actions';
import {
    usersStatusesInCurrentCall,
    callStartAt,
    screenSharingIDInCurrentCall,
    expandedView,
    getChannelUrlAndDisplayName,
    allowScreenSharing,
    connectedProfilesInCurrentCall,
    hostIDInCurrentCall,
    hostChangeAtInCurrentCall,
    recordingInCurrentCall,
    sortedIncomingCalls,
    recentlyJoinedUsersInCurrentCall,
} from 'src/selectors';
import {alphaSortProfiles, stateSortProfiles} from 'src/utils';

import CallWidget from './component';

const mapStateToProps = (state: GlobalState) => {
    // Using the channelID from the client since we could connect before
    // receiving the user connected event and still want to go ahead and show the widget.
    // Also, it would be possible to lose the event altogether if connecting to
    // the call while in a ws reconnection handler.
    const channel = getChannel(state, String(window.callsClient?.channelID));
    const currentUserID = getCurrentUserId(state);

    const screenSharingID = screenSharingIDInCurrentCall(state);

    const sortedProfiles = (profiles: UserProfile[], statuses: {[key: string]: UserState}) => {
        return [...profiles].sort(alphaSortProfiles).sort(stateSortProfiles(profiles, statuses, screenSharingID, true));
    };

    const statuses = usersStatusesInCurrentCall(state);
    const profiles = sortedProfiles(connectedProfilesInCurrentCall(state), statuses);

    const profilesMap: IDMappedObjects<UserProfile> = {};
    const picturesMap: {
        [key: string]: string,
    } = {};
    for (let i = 0; i < profiles.length; i++) {
        const pic = Client4.getProfilePictureUrl(profiles[i].id, profiles[i].last_picture_update);
        picturesMap[profiles[i].id] = pic;
        profilesMap[profiles[i].id] = profiles[i];
    }

    const {channelURL, channelDisplayName} = getChannelUrlAndDisplayName(state, channel);

    return {
        currentUserID,
        channel,
        team: getTeam(state, channel?.team_id || getCurrentTeamId(state)),
        channelURL,
        channelDisplayName,
        profiles,
        profilesMap,
        picturesMap,
        statuses,
        callStartAt: callStartAt(state, channel?.id) || Number(window.callsClient?.initTime),
        callHostID: hostIDInCurrentCall(state),
        callHostChangeAt: hostChangeAtInCurrentCall(state),
        callRecording: recordingInCurrentCall(state),
        screenSharingID,
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

