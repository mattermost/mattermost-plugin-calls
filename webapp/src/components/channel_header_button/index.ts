
import {connect} from 'react-redux';

import {getCurrentChannelId} from 'mattermost-redux/selectors/entities/channels';

import {voiceConnectedUsers, connectedChannelID} from 'selectors';

import ChannelHeaderButton from './component';

const mapStateToProps = (state) => ({
    userCount: voiceConnectedUsers(state).length,
    show: !connectedChannelID(state) || getCurrentChannelId(state) !== connectedChannelID(state),
});

export default connect(mapStateToProps)(ChannelHeaderButton);
