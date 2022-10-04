import {bindActionCreators, Dispatch} from 'redux';
import {connect} from 'react-redux';

import {GlobalState} from '@mattermost/types/store';
import {UserProfile} from '@mattermost/types/users';
import {IDMappedObjects} from '@mattermost/types/utilities';

import {getUsers} from 'mattermost-redux/selectors/entities/common';
import {getChannel} from 'mattermost-redux/selectors/entities/channels';
import {getCurrentUserId, getUserIdsInChannels} from 'mattermost-redux/selectors/entities/users';
import {getTeam, getCurrentTeamId} from 'mattermost-redux/selectors/entities/teams';
import {getTeammateNameDisplaySetting} from 'mattermost-redux/selectors/entities/preferences';
import {getUserIdFromChannelName, isDirectChannel, isGroupChannel, getGroupDisplayNameFromUserIds} from 'mattermost-redux/utils/channel_utils';
import {displayUsername} from 'mattermost-redux/utils/user_utils';

import {Client4} from 'mattermost-redux/client';

import {UserState} from '../../types/types';

import {showExpandedView, showScreenSourceModal, trackEvent} from '../../actions';

import {connectedChannelID, voiceConnectedProfiles, voiceUsersStatuses, voiceChannelCallStartAt, voiceChannelScreenSharingID, expandedView} from '../../selectors';

import {getChannelURL, alphaSortProfiles, stateSortProfiles} from '../../utils';

import CallWidget from './component';

const mapStateToProps = (state: GlobalState) => {
    const channel = getChannel(state, connectedChannelID(state));

    const screenSharingID = voiceChannelScreenSharingID(state, channel?.id) || '';

    const sortedProfiles = (profiles: UserProfile[], statuses: {[key: string]: UserState}) => {
        return [...profiles].sort(alphaSortProfiles(profiles)).sort(stateSortProfiles(profiles, statuses, screenSharingID));
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

    const currentUserID = getCurrentUserId(state);
    const teammateNameDisplaySetting = getTeammateNameDisplaySetting(state);
    const users = getUsers(state);

    let channelURL = '';
    let channelDisplayName = '';
    if (channel) {
        channelURL = getChannelURL(state, channel, channel.team_id);

        if (isDirectChannel(channel)) {
            const otherUserID = getUserIdFromChannelName(currentUserID, channel.name);
            const otherUser = users[otherUserID];
            channelDisplayName = displayUsername(otherUser, teammateNameDisplaySetting, false);
        } else if (isGroupChannel(channel)) {
            const userIdsInChannel = getUserIdsInChannels(state)[channel.id];
            channelDisplayName = getGroupDisplayNameFromUserIds(userIdsInChannel, users, currentUserID, teammateNameDisplaySetting);
        } else {
            channelDisplayName = channel.display_name;
        }
    }

    return {
        currentUserID,
        channel,
        team: getTeam(state, getCurrentTeamId(state)),
        channelURL,
        channelDisplayName,
        profiles,
        profilesMap,
        picturesMap,
        statuses: voiceUsersStatuses(state) || {},
        callStartAt: voiceChannelCallStartAt(state, channel?.id) || 0,
        screenSharingID,
        show: !expandedView(state),
    };
};

const mapDispatchToProps = (dispatch: Dispatch) => bindActionCreators({
    showExpandedView,
    showScreenSourceModal,
    trackEvent,
}, dispatch);

export default connect(mapStateToProps, mapDispatchToProps)(CallWidget);

