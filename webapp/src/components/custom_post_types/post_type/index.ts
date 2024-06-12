import {Post} from '@mattermost/types/posts';
import {GlobalState} from '@mattermost/types/store';
import Preferences from 'mattermost-redux/constants/preferences';
import {getCurrentUserId} from 'mattermost-redux/selectors/entities/common';
import {get, getBool} from 'mattermost-redux/selectors/entities/preferences';
import {connect} from 'react-redux';
import PostType from 'src/components/custom_post_types/post_type/component';
import {MESSAGE_DISPLAY, MESSAGE_DISPLAY_COMPACT, MESSAGE_DISPLAY_DEFAULT} from 'src/constants';
import {
    channelIDForCurrentCall,
    hostIDForCallInChannel,
    isCloudProfessionalOrEnterpriseOrTrial,
    maxParticipants,
    profilesInCallInChannel,
} from 'src/selectors';

interface OwnProps {
    post: Post,
    isRHS: boolean,
}

const mapStateToProps = (state: GlobalState, ownProps: OwnProps) => {
    return {
        ...ownProps,
        connectedID: channelIDForCurrentCall(state) || '',
        profiles: profilesInCallInChannel(state, ownProps.post.channel_id),
        isCloudPaid: isCloudProfessionalOrEnterpriseOrTrial(state),
        maxParticipants: maxParticipants(state),
        militaryTime: getBool(state, Preferences.CATEGORY_DISPLAY_SETTINGS, Preferences.USE_MILITARY_TIME, false),
        compactDisplay: get(state, Preferences.CATEGORY_DISPLAY_SETTINGS, MESSAGE_DISPLAY, MESSAGE_DISPLAY_DEFAULT) === MESSAGE_DISPLAY_COMPACT,
        isHost: hostIDForCallInChannel(state, ownProps.post.channel_id) === getCurrentUserId(state),
    };
};

export default connect(mapStateToProps)(PostType);
