import {connect} from 'react-redux';

import {voiceConnectedChannels} from 'selectors';

import ChannelLinkLabel from './component';

const mapStateToProps = (state, ownProps) => {
    let hasCall = false;
    const channels = voiceConnectedChannels(state);
    if (channels) {
        const users = channels[ownProps.channel.id];
        if (users && users.length > 0) {
            hasCall = true;
        }
    }
    return {
        hasCall,
    };
};

export default connect(mapStateToProps)(ChannelLinkLabel);
