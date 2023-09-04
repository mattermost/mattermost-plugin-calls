
import {Post} from '@mattermost/types/posts';
import {GlobalState} from '@mattermost/types/store';
import {Client4} from 'mattermost-redux/client';
import {Preferences} from 'mattermost-redux/constants';
import {getBool} from 'mattermost-redux/selectors/entities/preferences';
import {connect} from 'react-redux';

import PostType from 'src/components/custom_post_types/post_type/component';
import {
    profilesInCallInChannel,
    channelIDForCurrentCall,
    isCloudProfessionalOrEnterpriseOrTrial,
    maxParticipants,
} from 'src/selectors';

interface OwnProps {
    post: Post,
}

const mapStateToProps = (state: GlobalState, ownProps: OwnProps) => {
    const pictures = [];
    const profiles = profilesInCallInChannel(state, ownProps.post.channel_id);
    if (profiles.length > 0) {
        for (let i = 0; i < profiles.length; i++) {
            pictures.push(Client4.getProfilePictureUrl(profiles[i].id, profiles[i].last_picture_update));
        }
    }

    return {
        ...ownProps,
        connectedID: channelIDForCurrentCall(state) || '',
        pictures,
        profiles,
        isCloudPaid: isCloudProfessionalOrEnterpriseOrTrial(state),
        maxParticipants: maxParticipants(state),
        militaryTime: getBool(state, Preferences.CATEGORY_DISPLAY_SETTINGS, Preferences.USE_MILITARY_TIME, false),
    };
};

export default connect(mapStateToProps)(PostType);
