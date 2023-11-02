import {connect} from 'react-redux';
import {bindActionCreators, Dispatch} from 'redux';

import {hideEndCallModal} from '../../actions';
import {profilesInCallInChannel, endCallModal} from '../../selectors';
import {isDMChannel, getUserIdFromDM} from '../../utils';
import {GlobalState} from '@mattermost/types/store';
import {getChannel} from 'mattermost-redux/selectors/entities/channels';
import {getCurrentUserId, getUser} from 'mattermost-redux/selectors/entities/users';

import EndCallModal from './component';

const mapStateToProps = (state: GlobalState) => {
    const endCallState = endCallModal(state);
    const channel = getChannel(state, endCallState.targetID);

    let connectedDMUser;
    if (channel && isDMChannel(channel)) {
        const otherID = getUserIdFromDM(channel.name, getCurrentUserId(state));
        connectedDMUser = getUser(state, otherID);
    }

    return {
        show: endCallModal(state).show,
        numParticipants: profilesInCallInChannel(state, endCallState.targetID).length,
        connectedDMUser,
        channel,
    };
};

const mapDispatchToProps = (dispatch: Dispatch) => bindActionCreators({
    hideEndCallModal,
}, dispatch);

export default connect(mapStateToProps, mapDispatchToProps)(EndCallModal);
