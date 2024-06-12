import {GlobalState} from '@mattermost/types/store';
import {getCurrentChannel} from 'mattermost-redux/selectors/entities/channels';
import {isCurrentUserSystemAdmin} from 'mattermost-redux/selectors/entities/users';
import {connect} from 'react-redux';
import {
    callsShowButton,
    channelIDForCurrentCall,
    currentChannelHasCall,
    isCloudProfessionalOrEnterpriseOrTrial,
    isCloudStarter,
    isLimitRestricted,
    maxParticipants,
} from 'src/selectors';

import ChannelHeaderDropdownButton from './component';

const mapStateToProps = (state: GlobalState) => {
    const channel = getCurrentChannel(state);

    return {
        show: callsShowButton(state, channel?.id),
        inCall: Boolean(channelIDForCurrentCall(state) && channelIDForCurrentCall(state) === channel?.id),
        hasCall: currentChannelHasCall(state),
        isAdmin: isCurrentUserSystemAdmin(state),
        isCloudStarter: isCloudStarter(state),
        isCloudPaid: isCloudProfessionalOrEnterpriseOrTrial(state),
        isLimitRestricted: isLimitRestricted(state),
        maxParticipants: maxParticipants(state),
        isChannelArchived: Boolean(channel && channel.delete_at > 0),
    };
};

export default connect(mapStateToProps)(ChannelHeaderDropdownButton);
