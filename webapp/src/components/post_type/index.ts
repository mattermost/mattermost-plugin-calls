import {bindActionCreators, Dispatch} from 'redux';
import {connect} from 'react-redux';
import {GlobalState} from 'mattermost-redux/types/store';
import {Post} from 'mattermost-redux/types/posts';

import {Client4} from 'mattermost-redux/client';

import {
    voiceConnectedChannels,
    voiceConnectedProfilesInChannel,
    connectedChannelID,
    isCloudProfessionalOrEnterprise,
} from 'src/selectors';
import {showSwitchCallModal} from 'src/actions';

import PostType from './component';

interface OwnProps {
    post: Post,
}

const mapStateToProps = (state: GlobalState, ownProps: OwnProps) => {
    const channels = voiceConnectedChannels(state);
    let profiles = [];
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
        isCloudPaid: isCloudProfessionalOrEnterprise(state),
    };
};

const mapDispatchToProps = (dispatch: Dispatch) => bindActionCreators({
    showSwitchCallModal,
}, dispatch);

export default connect(mapStateToProps, mapDispatchToProps)(PostType);
