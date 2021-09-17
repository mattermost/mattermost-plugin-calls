import {connect} from 'react-redux';

import {getChannel} from 'mattermost-redux/selectors/entities/channels';

import {Client4} from 'mattermost-redux/client';

import {connectedChannelID, voiceConnectedProfiles, voiceUsersStatuses} from 'selectors';

import {disconnectVoice} from 'actions';

import GlobalHeaderRightControls from './component';

const mapStateToProps = (state) => {
    const profiles = voiceConnectedProfiles(state);
    const pictures = [];
    for (let i = 0; i < profiles.length; i++) {
        pictures.push(Client4.getProfilePictureUrl(profiles[i].id, profiles[i].last_picture_update));
    }

    return {
        channel: getChannel(state, connectedChannelID(state)),
        profiles,
        pictures,
        statuses: voiceUsersStatuses(state) || {},
    };
};

export default connect(mapStateToProps)(GlobalHeaderRightControls);

