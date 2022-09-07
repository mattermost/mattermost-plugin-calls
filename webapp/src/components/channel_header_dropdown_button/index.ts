import {connect} from 'react-redux';
import {GlobalState} from '@mattermost/types/store';

import {getCurrentChannel} from 'mattermost-redux/selectors/entities/channels';

import {
    voiceConnectedUsers,
    connectedChannelID,
    callsEnabled,
    isCloudFeatureRestricted,
    isCloudProfessionalOrEnterprise,
    isLimitRestricted,
    maxParticipants,
} from 'src/selectors';

import ChannelHeaderDropdownButton from './component';

const mapStateToProps = (state: GlobalState) => {
    const channel = getCurrentChannel(state);
    return {
        show: callsEnabled(state, channel?.id),
        inCall: Boolean(connectedChannelID(state) && connectedChannelID(state) === channel?.id),
        hasCall: voiceConnectedUsers(state).length > 0,
        isCloudFeatureRestricted: isCloudFeatureRestricted(state),
        isCloudPaid: isCloudProfessionalOrEnterprise(state),
        isLimitRestricted: isLimitRestricted(state),
        maxParticipants: maxParticipants(state),
        isChannelArchived: channel?.delete_at > 0,
    };
};

export default connect(mapStateToProps)(ChannelHeaderDropdownButton);
