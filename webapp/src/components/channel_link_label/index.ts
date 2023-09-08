import {connect} from 'react-redux';

import {Channel} from '@mattermost/types/channels';
import {GlobalState} from '@mattermost/types/store';
import {UserProfile} from '@mattermost/types/users';
import {usersInCallInChannel, profilesInCallInChannel} from 'src/selectors';

import ChannelLinkLabel from './component';

interface OwnProps {
    channel: Channel,
}

const mapStateToProps = (state: GlobalState, ownProps: OwnProps) => {
    let hasCall = false;
    const users = usersInCallInChannel(state, ownProps.channel.id);
    let profiles: UserProfile[] = [];
    if (users && users.length > 0) {
        hasCall = true;
        profiles = profilesInCallInChannel(state, ownProps.channel.id);
    }
    return {
        hasCall,
        profiles,
    };
};

export default connect(mapStateToProps)(ChannelLinkLabel);
