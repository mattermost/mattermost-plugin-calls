import {bindActionCreators, Dispatch} from 'redux';
import {connect} from 'react-redux';

import {GlobalState} from '@mattermost/types/store';
import {UserProfile} from '@mattermost/types/users';
import {IDMappedObjects} from '@mattermost/types/utilities';

import {getChannel} from 'mattermost-redux/selectors/entities/channels';
import {getCurrentUserId} from 'mattermost-redux/selectors/entities/users';
import {getTeam, getCurrentTeamId} from 'mattermost-redux/selectors/entities/teams';
import {Client4} from 'mattermost-redux/client';

import {UserState} from '@calls/common';

import {showExpandedView, showScreenSourceModal, trackEvent} from 'src/actions';

import {
    connectedChannelID,
    voiceUsersStatuses,
    voiceChannelCallStartAt,
    voiceChannelScreenSharingID,
    expandedView,
    getChannelUrlAndDisplayName,
    allowScreenSharing,
    voiceConnectedProfiles,
    voiceChannelCallHostID,
    callRecording,
    voiceChannelCallHostChangeAt,
} from 'src/selectors';

import {alphaSortProfiles, stateSortProfiles} from 'src/utils';

import CallWidget from './component';

const mapStateToProps = (state: GlobalState) => {
    const channel = getChannel(state, connectedChannelID(state));
    const currentUserID = getCurrentUserId(state);

    const screenSharingID = voiceChannelScreenSharingID(state, channel?.id) || '';

    const sortedProfiles = (profiles: UserProfile[], statuses: {[key: string]: UserState}) => {
        return [...profiles].sort(alphaSortProfiles).sort(stateSortProfiles(profiles, statuses, screenSharingID));
    };

    const statuses = voiceUsersStatuses(state);
    const profiles = sortedProfiles(voiceConnectedProfiles(state), statuses);

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
        statuses: voiceUsersStatuses(state) || {},
        callStartAt: voiceChannelCallStartAt(state, channel?.id) || 0,
        callHostID: voiceChannelCallHostID(state, channel?.id) || '',
        callHostChangeAt: voiceChannelCallHostChangeAt(state, channel?.id) || 0,
        callRecording: callRecording(state, channel?.id),
        screenSharingID,
        allowScreenSharing: allowScreenSharing(state),
        show: !expandedView(state),
    };
};

const mapDispatchToProps = (dispatch: Dispatch) => bindActionCreators({
    showExpandedView,
    showScreenSourceModal,
    trackEvent,
}, dispatch);

export default connect(mapStateToProps, mapDispatchToProps)(CallWidget);

