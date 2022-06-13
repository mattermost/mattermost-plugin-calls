import {connect} from 'react-redux';
import {GlobalState} from '@mattermost/types/store';

import {getCurrentChannelId} from 'mattermost-redux/selectors/entities/channels';

import {
    voiceConnectedUsers,
    connectedChannelID,
    isVoiceEnabled,
    isCloudFeatureRestricted,
    isCloudProfessionalOrEnterprise,
    isLimitRestricted,
    maxParticipants,
} from 'src/selectors';

import ChannelHeaderButton from './component';

const mapStateToProps = (state: GlobalState) => ({
    show: isVoiceEnabled(state),
    inCall: Boolean(connectedChannelID(state) && connectedChannelID(state) === getCurrentChannelId(state)),
    hasCall: voiceConnectedUsers(state).length > 0,
    isCloudFeatureRestricted: isCloudFeatureRestricted(state),
    isCloudPaid: isCloudProfessionalOrEnterprise(state),
    isLimitRestricted: isLimitRestricted(state),
    maxParticipants: maxParticipants(state),
});

export default connect(mapStateToProps)(ChannelHeaderButton);
