import {connect} from 'react-redux';
import {GlobalState} from 'mattermost-redux/types/store';

import {getChannel} from 'mattermost-redux/selectors/entities/channels';
import {getCurrentUserId} from 'mattermost-redux/selectors/entities/users';

import {Client4} from 'mattermost-redux/client';

import {connectedChannelID, voiceConnectedProfiles, voiceUsersStatuses, voiceChannelCallStartAt, voiceChannelScreenSharingID} from '../../selectors';

import {getChannelURL} from '../../utils';

import CallWidget from './component';

const mapStateToProps = (state: GlobalState) => {
    const profiles = voiceConnectedProfiles(state);
    const pictures = [];
    for (let i = 0; i < profiles.length; i++) {
        pictures.push(Client4.getProfilePictureUrl(profiles[i].id, profiles[i].last_picture_update));
    }

    const channel = getChannel(state, connectedChannelID(state));

    let channelURL = '';
    if (channel) {
        channelURL = getChannelURL(state, channel, channel.team_id);
    }

    return {
        currentUserID: getCurrentUserId(state),
        channel,
        channelURL,
        profiles,
        pictures,
        statuses: voiceUsersStatuses(state) || {},
        callStartAt: voiceChannelCallStartAt(state, channel?.id) || 0,
        screenSharingID: voiceChannelScreenSharingID(state, channel?.id) || '',
    };
};

export default connect(mapStateToProps)(CallWidget);

