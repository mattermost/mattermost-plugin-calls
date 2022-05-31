import {connect} from 'react-redux';
import {GlobalState} from 'mattermost-redux/types/store';

import {getCurrentChannelId} from 'mattermost-redux/selectors/entities/channels';

import {
    voiceConnectedUsers,
    connectedChannelID,
    isVoiceEnabled,
    isCloudFeatureRestricted,
    isCloudLimitRestricted,
    cloudMaxParticipants,
} from 'src/selectors';

import ChannelHeaderDropdownButton from './component';

const mapStateToProps = (state: GlobalState) => ({
    show: isVoiceEnabled(state),
    inCall: Boolean(connectedChannelID(state) && connectedChannelID(state) === getCurrentChannelId(state)),
    hasCall: voiceConnectedUsers(state).length > 0,
    isCloudFeatureRestricted: isCloudFeatureRestricted(state),
    isCloudLimitRestricted: isCloudLimitRestricted(state),
    cloudMaxParticipants: cloudMaxParticipants(state),
});

export default connect(mapStateToProps)(ChannelHeaderDropdownButton);
