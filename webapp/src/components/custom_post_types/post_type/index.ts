import {connect} from 'react-redux';

import {Post} from '@mattermost/types/posts';
import {GlobalState} from '@mattermost/types/store';
import {Preferences} from 'mattermost-redux/constants';
import {getBool} from 'mattermost-redux/selectors/entities/preferences';
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
    return {
        ...ownProps,
        connectedID: channelIDForCurrentCall(state) || '',
        profiles: profilesInCallInChannel(state, ownProps.post.channel_id),
        isCloudPaid: isCloudProfessionalOrEnterpriseOrTrial(state),
        maxParticipants: maxParticipants(state),
        militaryTime: getBool(state, Preferences.CATEGORY_DISPLAY_SETTINGS, Preferences.USE_MILITARY_TIME, false),
    };
};

export default connect(mapStateToProps)(PostType);
