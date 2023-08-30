
import {Post} from '@mattermost/types/posts';
import {GlobalState} from '@mattermost/types/store';
import {UserProfile} from '@mattermost/types/users';
import {Client4} from 'mattermost-redux/client';
import {Preferences} from 'mattermost-redux/constants';
import {getBool} from 'mattermost-redux/selectors/entities/preferences';
import {connect} from 'react-redux';

import PostType from 'src/components/custom_post_types/post_type/component';
import {
    usersInCallInChannel,
    profilesInCallInChannel,
    channelIDForCurrentCall,
    isCloudProfessionalOrEnterpriseOrTrial,
    maxParticipants,
} from 'src/selectors';

interface OwnProps {
    post: Post,
}

const mapStateToProps = (state: GlobalState, ownProps: OwnProps) => {
    const users = usersInCallInChannel(state, ownProps.post.channel_id);
    let profiles: UserProfile[] = [];
    const pictures = [];
    if (users && users.length > 0) {
        profiles = profilesInCallInChannel(state, ownProps.post.channel_id);
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
