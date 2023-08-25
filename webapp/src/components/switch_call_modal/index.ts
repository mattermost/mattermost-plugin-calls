import {GlobalState} from '@mattermost/types/store';
import {getChannel, getCurrentChannelId} from 'mattermost-redux/selectors/entities/channels';
import {getCurrentUserId, getUser} from 'mattermost-redux/selectors/entities/users';
import {connect} from 'react-redux';
import {bindActionCreators, Dispatch} from 'redux';

import {dismissIncomingCallNotification, hideSwitchCallModal} from 'src/actions';
import {connectedChannelID, switchCallModal, callsID} from 'src/selectors';
import {isDMChannel, getUserIdFromDM} from 'src/utils';

import SwitchCallModal from './component';

const mapStateToProps = (state: GlobalState) => {
    const switchCallState = switchCallModal(state);
    const connectedChannel = getChannel(state, connectedChannelID(state) || '');
    const targetCallID = callsID(state, switchCallState.targetID || '') || '';
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
        targetChannelID: switchCallState.targetID,
        targetCallID,
    };
};

const mapDispatchToProps = (dispatch: Dispatch) => bindActionCreators({
    hideSwitchCallModal,
    dismissIncomingCallNotification,
}, dispatch);

export default connect(mapStateToProps, mapDispatchToProps)(SwitchCallModal);
