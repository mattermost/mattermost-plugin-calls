import {bindActionCreators, Dispatch} from 'redux';
import {connect} from 'react-redux';
import {GlobalState} from 'mattermost-redux/types/store';
import {getChannel, getCurrentChannelId} from 'mattermost-redux/selectors/entities/channels';

import {hideSwitchCallModal} from '../../actions';
import {connectedChannelID, switchCallModal} from '../../selectors';

import SwitchCallModal from './component';

const mapStateToProps = (state: GlobalState) => {
    return {
        connectedChannel: getChannel(state, connectedChannelID(state)),
        currentChannel: getChannel(state, getCurrentChannelId(state)),
        show: switchCallModal(state),
    };
};

const mapDispatchToProps = (dispatch: Dispatch) => bindActionCreators({
    hideSwitchCallModal,
}, dispatch);

export default connect(mapStateToProps, mapDispatchToProps)(SwitchCallModal);
