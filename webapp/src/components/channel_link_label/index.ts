import {connect} from 'react-redux';
import {GlobalState} from 'mattermost-redux/types/store';
import {Channel} from 'mattermost-redux/types/channels';

import {voiceConnectedChannels, voiceConnectedProfilesInChannel} from '../../selectors';

import ChannelLinkLabel from './component';

interface OwnProps {
    channel: Channel,
}

const mapStateToProps = (state: GlobalState, ownProps: OwnProps) => {
    let hasCall = false;
    const channels = voiceConnectedChannels(state);
    let profiles = [];
    if (channels) {
        const users = channels[ownProps.channel.id];
        if (users && users.length > 0) {
            hasCall = true;
            profiles = voiceConnectedProfilesInChannel(state, ownProps.channel.id);
        }
    }
    return {
        hasCall,
        profiles,
    };
};

export default connect(mapStateToProps)(ChannelLinkLabel);
