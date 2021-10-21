import {bindActionCreators, Dispatch} from 'redux';
import {connect} from 'react-redux';
import {GlobalState} from 'mattermost-redux/types/store';

import {getChannel} from 'mattermost-redux/selectors/entities/channels';
import {getCurrentUserId} from 'mattermost-redux/selectors/entities/users';

import {Client4} from 'mattermost-redux/client';

import {hideExpandedView} from '../../actions';
import {expandedView, voiceChannelCallStartAt, connectedChannelID, voiceConnectedProfiles, voiceUsersStatuses} from '../../selectors';

import ExpandedView from './component';

const mapStateToProps = (state: GlobalState) => {
    const profiles = voiceConnectedProfiles(state);
    const pictures = [];
    for (let i = 0; i < profiles.length; i++) {
        pictures.push(Client4.getProfilePictureUrl(profiles[i].id, profiles[i].last_picture_update));
    }
    const channel = getChannel(state, connectedChannelID(state));

    return {
        show: expandedView(state),
        currentUserID: getCurrentUserId(state),
        profiles,
        pictures,
        statuses: voiceUsersStatuses(state) || {},
        callStartAt: voiceChannelCallStartAt(state, channel?.id) || 0,
    };
};

const mapDispatchToProps = (dispatch: Dispatch) => bindActionCreators({
    hideExpandedView,
}, dispatch);

export default connect(mapStateToProps, mapDispatchToProps)(ExpandedView);
