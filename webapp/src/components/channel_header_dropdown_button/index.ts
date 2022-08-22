import {connect} from 'react-redux';
import {GlobalState} from '@mattermost/types/store';

import {getCurrentChannelId} from 'mattermost-redux/selectors/entities/channels';

import {
    voiceConnectedUsers,
    connectedChannelID,
    channelState,
    isCloudFeatureRestricted,
    isCloudProfessionalOrEnterprise,
    isLimitRestricted,
    maxParticipants,
} from 'src/selectors';

import ChannelHeaderDropdownButton from './component';

const mapStateToProps = (state: GlobalState) => ({
    show: Boolean(channelState(state, getCurrentChannelId(state))?.enabled),
    inCall: Boolean(connectedChannelID(state) && connectedChannelID(state) === getCurrentChannelId(state)),
    hasCall: voiceConnectedUsers(state).length > 0,
    isCloudFeatureRestricted: isCloudFeatureRestricted(state),
    isCloudPaid: isCloudProfessionalOrEnterprise(state),
    isLimitRestricted: isLimitRestricted(state),
    maxParticipants: maxParticipants(state),
});

export default connect(mapStateToProps)(ChannelHeaderDropdownButton);
