import {bindActionCreators, Dispatch} from 'redux';
import {connect} from 'react-redux';
import {GlobalState} from 'mattermost-redux/types/store';
import {Post} from 'mattermost-redux/types/posts';

import {Client4} from 'mattermost-redux/client';

import {voiceConnectedChannels, voiceConnectedProfilesInChannel, connectedChannelID} from '../../selectors';
import {showSwitchCallModal} from '../../actions';

import PostType from './component';

interface OwnProps {
    post: Post,
}

const mapStateToProps = (state: GlobalState, ownProps: OwnProps) => {
    let hasCall = false;
    const connectedID = connectedChannelID(state) || '';
    const channels = voiceConnectedChannels(state);

    let profiles = [];
    const pictures = [];
    if (channels) {
        const users = channels[ownProps.post.channel_id];
        if (users && users.length > 0) {
            hasCall = true;
            profiles = voiceConnectedProfilesInChannel(state, ownProps.post.channel_id);
            for (let i = 0; i < profiles.length; i++) {
                pictures.push(Client4.getProfilePictureUrl(profiles[i].id, profiles[i].last_picture_update));
            }
        }
    }
    return {
        ...ownProps,
        connectedID,
        hasCall,
        pictures,
        profiles,
    };
};

const mapDispatchToProps = (dispatch: Dispatch) => bindActionCreators({
    showSwitchCallModal,
}, dispatch);

export default connect(mapStateToProps, mapDispatchToProps)(PostType);
