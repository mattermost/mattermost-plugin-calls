import {bindActionCreators, Dispatch} from 'redux';
import {connect} from 'react-redux';
import {GlobalState} from '@mattermost/types/store';
import {getChannel, getCurrentChannelId} from 'mattermost-redux/selectors/entities/channels';
import {getCurrentUserId, getUser} from 'mattermost-redux/selectors/entities/users';

import {hideSwitchCallModal} from '../../actions';
import {connectedChannelID, switchCallModal} from '../../selectors';
import {isDMChannel, getUserIdFromDM} from '../../utils';

import SwitchCallModal from './component';

const mapStateToProps = (state: GlobalState) => {
    const switchCallState = switchCallModal(state);
    const connectedChannel = getChannel(state, connectedChannelID(state) || '');
    const currentChannel = switchCallState.targetID ? getChannel(state, switchCallState.targetID) : getChannel(state, getCurrentChannelId(state));

    let connectedDMUser;
    if (connectedChannel && isDMChannel(connectedChannel)) {
        const otherID = getUserIdFromDM(connectedChannel.name, getCurrentUserId(state));
        connectedDMUser = getUser(state, otherID);
    }

    let currentDMUser;
    if (currentChannel && isDMChannel(currentChannel)) {
        const otherID = getUserIdFromDM(currentChannel.name, getCurrentUserId(state));
        currentDMUser = getUser(state, otherID);
    }

    return {
        show: switchCallModal(state).show,
        connectedChannel,
        currentChannel,
        connectedDMUser,
        currentDMUser,
    };
};

const mapDispatchToProps = (dispatch: Dispatch) => bindActionCreators({
    hideSwitchCallModal,
}, dispatch);

export default connect(mapStateToProps, mapDispatchToProps)(SwitchCallModal);
