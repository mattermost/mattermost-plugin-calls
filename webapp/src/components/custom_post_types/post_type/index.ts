import {connect} from 'react-redux';

import {Preferences} from 'mattermost-redux/constants';
import {getBool} from 'mattermost-redux/selectors/entities/preferences';
import {Client4} from 'mattermost-redux/client';

import {GlobalState} from '@mattermost/types/store';
import {Post} from '@mattermost/types/posts';
import {UserProfile} from '@mattermost/types/users';

import {
    voiceConnectedChannels,
    voiceConnectedProfilesInChannel,
    connectedChannelID,
    isCloudProfessionalOrEnterpriseOrTrial,
    maxParticipants,
} from 'src/selectors';
import PostType from 'src/components/custom_post_types/post_type/component';

interface OwnProps {
    post: Post,
}

const mapStateToProps = (state: GlobalState, ownProps: OwnProps) => {
    const channels = voiceConnectedChannels(state);
    let profiles: UserProfile[] = [];
    const pictures = [];
    if (channels) {
        const users = channels[ownProps.post.channel_id];
        if (users && users.length > 0) {
            profiles = voiceConnectedProfilesInChannel(state, ownProps.post.channel_id);
            for (let i = 0; i < profiles.length; i++) {
                pictures.push(Client4.getProfilePictureUrl(profiles[i].id, profiles[i].last_picture_update));
            }
        }
    }

    return {
        ...ownProps,
        connectedID: connectedChannelID(state) || '',
        pictures,
        profiles,
        isCloudPaid: isCloudProfessionalOrEnterpriseOrTrial(state),
        maxParticipants: maxParticipants(state),
        militaryTime: getBool(state, Preferences.CATEGORY_DISPLAY_SETTINGS, Preferences.USE_MILITARY_TIME, false),
    };
};

export default connect(mapStateToProps)(PostType);
