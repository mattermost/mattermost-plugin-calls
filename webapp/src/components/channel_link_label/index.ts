import {Channel} from '@mattermost/types/channels';
import {GlobalState} from '@mattermost/types/store';
import {UserProfile} from '@mattermost/types/users';
import {connect} from 'react-redux';

import {connectedChannels, connectedProfilesInChannel} from 'src/selectors';

import ChannelLinkLabel from './component';

interface OwnProps {
    channel: Channel,
}

const mapStateToProps = (state: GlobalState, ownProps: OwnProps) => {
    let hasCall = false;
    const channels = connectedChannels(state);
    let profiles: UserProfile[] = [];
    if (channels) {
        const users = channels[ownProps.channel.id];
        if (users && users.length > 0) {
            hasCall = true;
            profiles = connectedProfilesInChannel(state, ownProps.channel.id);
        }
    }
    return {
        hasCall,
        profiles,
    };
};

export default connect(mapStateToProps)(ChannelLinkLabel);
