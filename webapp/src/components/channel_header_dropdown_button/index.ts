import {connect} from 'react-redux';
import {GlobalState} from 'mattermost-redux/types/store';

import {getCurrentChannelId} from 'mattermost-redux/selectors/entities/channels';

import {voiceConnectedUsers, connectedChannelID, isVoiceEnabled} from '../../selectors';

import ChannelHeaderDropdownButton from './component';

const mapStateToProps = (state: GlobalState) => ({
    hasCall: voiceConnectedUsers(state).length > 0,
    inCall: connectedChannelID(state) && connectedChannelID(state) === getCurrentChannelId(state),
    show: isVoiceEnabled(state),
});

export default connect(mapStateToProps)(ChannelHeaderDropdownButton);
