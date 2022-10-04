import {connect} from 'react-redux';
import {GlobalState} from '@mattermost/types/store';
import {UserProfile} from '@mattermost/types/users';

import {getChannel} from 'mattermost-redux/selectors/entities/channels';
import {getCurrentUserId, getUser} from 'mattermost-redux/selectors/entities/users';

import {Client4} from 'mattermost-redux/client';

import {UserState} from '../../types/types';

import {alphaSortProfiles, stateSortProfiles, isDMChannel, getUserIdFromDM} from '../../utils';

import {
    closeRhs,
    selectRhsPost,
    getIsRhsOpen,
} from 'src/webapp_globals';
import {hideExpandedView, showScreenSourceModal, trackEvent} from '../../actions';
import {expandedView, voiceChannelCallStartAt, connectedChannelID, voiceConnectedProfiles, voiceUsersStatuses, voiceChannelScreenSharingID, voiceChannelRootPost} from '../../selectors';

import ExpandedView from './component';

const mapStateToProps = (state: GlobalState) => {
    const channel = getChannel(state, connectedChannelID(state));
    const screenSharingID = voiceChannelScreenSharingID(state, channel?.id) || '';
    const threadID = voiceChannelRootPost(state, channel?.id);

    const sortedProfiles = (profiles: UserProfile[], statuses: {[key: string]: UserState}) => {
        return [...profiles].sort(alphaSortProfiles(profiles)).sort(stateSortProfiles(profiles, statuses, screenSharingID));
    };

    const statuses = voiceUsersStatuses(state);
    const profiles = sortedProfiles(voiceConnectedProfiles(state), statuses);

    const pictures: {[key: string]: string} = {};
    for (let i = 0; i < profiles.length; i++) {
        pictures[String(profiles[i].id)] = Client4.getProfilePictureUrl(profiles[i].id, profiles[i].last_picture_update);
    }

    let connectedDMUser;
    if (channel && isDMChannel(channel)) {
        const otherID = getUserIdFromDM(channel.name, getCurrentUserId(state));
        connectedDMUser = getUser(state, otherID);
    }

    return {
        show: expandedView(state),
        currentUserID: getCurrentUserId(state),
        profiles,
        pictures,
        statuses,
        callStartAt: voiceChannelCallStartAt(state, channel?.id) || 0,
        screenSharingID,
        channel,
        connectedDMUser,
        threadID,
        isRhsOpen: getIsRhsOpen?.(state),
    };
};

const mapDispatchToProps = {
    hideExpandedView,
    showScreenSourceModal,
    closeRhs,
    selectRhsPost,
    trackEvent,
};

export default connect(mapStateToProps, mapDispatchToProps)(ExpandedView);
