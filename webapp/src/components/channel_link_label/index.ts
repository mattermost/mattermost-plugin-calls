import {connect} from 'react-redux';

import {Channel} from '@mattermost/types/channels';
import {GlobalState} from '@mattermost/types/store';
import {profilesInCallInChannel} from 'src/selectors';

import ChannelLinkLabel from './component';

interface OwnProps {
    channel: Channel,
}

const mapStateToProps = (state: GlobalState, ownProps: OwnProps) => {
    const profiles = profilesInCallInChannel(state, ownProps.channel.id);
    return {
        hasCall: profiles.length > 0,
        profiles,
    };
};

export default connect(mapStateToProps)(ChannelLinkLabel);
