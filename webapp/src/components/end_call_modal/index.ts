import {GlobalState} from '@mattermost/types/store';
import {getChannel} from 'mattermost-redux/selectors/entities/channels';
import {getCurrentUserId, getUser} from 'mattermost-redux/selectors/entities/users';
import {connect} from 'react-redux';
import {bindActionCreators, Dispatch} from 'redux';

import {hideEndCallModal} from '../../actions';
import {endCallModal, numProfilesInCallInChannel} from '../../selectors';
import {getUserIdFromDM, isDMChannel} from '../../utils';
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
        numParticipants: numProfilesInCallInChannel(state, endCallState.targetID),
        connectedDMUser,
        channel,
    };
};

const mapDispatchToProps = (dispatch: Dispatch) => bindActionCreators({
    hideEndCallModal,
}, dispatch);

export default connect(mapStateToProps, mapDispatchToProps)(EndCallModal);
