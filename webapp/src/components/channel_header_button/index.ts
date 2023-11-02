import {connect} from 'react-redux';

import {GlobalState} from '@mattermost/types/store';
import {getCurrentChannel} from 'mattermost-redux/selectors/entities/channels';
import {isCurrentUserSystemAdmin} from 'mattermost-redux/selectors/entities/users';
import {
    profilesInCallInCurrentChannel,
    channelIDForCurrentCall,
    isCloudProfessionalOrEnterpriseOrTrial,
    isLimitRestricted,
    maxParticipants,
    isCloudStarter,
    callsShowButton,
} from 'src/selectors';

import ChannelHeaderButton from './component';

const mapStateToProps = (state: GlobalState) => {
    const channel = getCurrentChannel(state);
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
    };
};

export default connect(mapStateToProps)(ChannelHeaderButton);
