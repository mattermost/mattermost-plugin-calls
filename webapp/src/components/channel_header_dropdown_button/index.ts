import {GlobalState} from '@mattermost/types/store';
import {getCurrentChannel} from 'mattermost-redux/selectors/entities/channels';
import {isCurrentUserSystemAdmin} from 'mattermost-redux/selectors/entities/users';
import {connect} from 'react-redux';
import {
    callsShowButton,
    connectedChannelID,
    isCloudProfessionalOrEnterpriseOrTrial,
    isCloudStarter,
    isLimitRestricted,
    maxParticipants,
    voiceConnectedUsers,
} from 'src/selectors';

import ChannelHeaderDropdownButton from './component';

const mapStateToProps = (state: GlobalState) => {
    const channel = getCurrentChannel(state);

    return {
        show: callsShowButton(state, channel?.id),
        inCall: Boolean(connectedChannelID(state) && connectedChannelID(state) === channel?.id),
        hasCall: voiceConnectedUsers(state).length > 0,
        isAdmin: isCurrentUserSystemAdmin(state),
        isCloudStarter: isCloudStarter(state),
        isCloudPaid: isCloudProfessionalOrEnterpriseOrTrial(state),
        isLimitRestricted: isLimitRestricted(state),
        maxParticipants: maxParticipants(state),
        isChannelArchived: channel?.delete_at > 0,
    };
};

export default connect(mapStateToProps)(ChannelHeaderDropdownButton);
