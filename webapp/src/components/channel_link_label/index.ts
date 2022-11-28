import {connect} from 'react-redux';
import {GlobalState} from '@mattermost/types/store';
import {Channel} from '@mattermost/types/channels';
import {UserProfile} from '@mattermost/types/users';

import {voiceConnectedChannels, voiceConnectedProfilesInChannel} from 'src/selectors';

import ChannelLinkLabel from './component';

interface OwnProps {
    channel: Channel,
}

const mapStateToProps = (state: GlobalState, ownProps: OwnProps) => {
    let hasCall = false;
    const channels = voiceConnectedChannels(state);
    let profiles: UserProfile[] = [];
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
