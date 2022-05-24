import {connect} from 'react-redux';
import {GlobalState} from 'mattermost-redux/types/store';

import {getCurrentChannelId} from 'mattermost-redux/selectors/entities/channels';

import {
    voiceConnectedUsers,
    connectedChannelID,
    isVoiceEnabled,
    isCloudFeatureRestricted,
    isCloudLimitRestricted,
} from 'src/selectors';

import ChannelHeaderButton from './component';

const mapStateToProps = (state: GlobalState) => ({
    show: isVoiceEnabled(state),
    inCall: Boolean(connectedChannelID(state) && connectedChannelID(state) === getCurrentChannelId(state)),
    hasCall: voiceConnectedUsers(state).length > 0,
    isCloudFeatureRestricted: isCloudFeatureRestricted(state),
    isCloudLimitRestricted: isCloudLimitRestricted(state),
});

export default connect(mapStateToProps)(ChannelHeaderButton);
