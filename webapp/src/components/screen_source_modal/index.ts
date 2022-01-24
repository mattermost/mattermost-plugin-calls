import {bindActionCreators, Dispatch} from 'redux';
import {connect} from 'react-redux';
import {GlobalState} from 'mattermost-redux/types/store';
import {getChannel, getCurrentChannelId} from 'mattermost-redux/selectors/entities/channels';

import {hideScreenSourceModal} from '../../actions';
import {connectedChannelID, screenSourceModal} from '../../selectors';

import ScreenSourceModal from './component';

const mapStateToProps = (state: GlobalState) => {
    return {
        connectedChannel: getChannel(state, connectedChannelID(state)),
        show: screenSourceModal(state),
    };
};

const mapDispatchToProps = (dispatch: Dispatch) => bindActionCreators({
    hideScreenSourceModal,
}, dispatch);

export default connect(mapStateToProps, mapDispatchToProps)(ScreenSourceModal);
