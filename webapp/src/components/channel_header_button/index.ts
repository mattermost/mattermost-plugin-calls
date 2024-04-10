import {GlobalState} from '@mattermost/types/store';
import {getCurrentChannel} from 'mattermost-redux/selectors/entities/channels';
import {getCurrentUserId, getUser, isCurrentUserSystemAdmin} from 'mattermost-redux/selectors/entities/users';
import {connect} from 'react-redux';
import {
    callsShowButton,
    channelIDForCurrentCall,
    isCloudProfessionalOrEnterpriseOrTrial,
    isCloudStarter,
    isLimitRestricted,
    maxParticipants,
    profilesInCallInCurrentChannel,
} from 'src/selectors';
import {getUserIdFromDM, isDMChannel} from 'src/utils';

import ChannelHeaderButton from './component';

const mapStateToProps = (state: GlobalState) => {
    const channel = getCurrentChannel(state);

    let isDeactivatedDM = false;
    if (channel && isDMChannel(channel)) {
        const otherUser = getUser(state, getUserIdFromDM(channel.name, getCurrentUserId(state)));
        isDeactivatedDM = otherUser?.delete_at > 0;
    }

    return {
        show: callsShowButton(state, channel?.id),
        inCall: Boolean(channelIDForCurrentCall(state) && channelIDForCurrentCall(state) === channel?.id),
        hasCall: profilesInCallInCurrentChannel(state).length > 0,
        isAdmin: isCurrentUserSystemAdmin(state),
        isCloudStarter: isCloudStarter(state),
        isCloudPaid: isCloudProfessionalOrEnterpriseOrTrial(state),
        isLimitRestricted: isLimitRestricted(state),
        maxParticipants: maxParticipants(state),
        isChannelArchived: channel?.delete_at > 0,
        isDeactivatedDM,
    };
};

export default connect(mapStateToProps)(ChannelHeaderButton);
