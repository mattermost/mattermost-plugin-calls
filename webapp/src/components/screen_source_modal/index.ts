import {GlobalState} from '@mattermost/types/store';
import {connect} from 'react-redux';
import {bindActionCreators, Dispatch} from 'redux';

import {hideScreenSourceModal} from '../../actions';
import {screenSourceModal, channelForCurrentCall} from '../../selectors';

import ScreenSourceModal from './component';

const mapStateToProps = (state: GlobalState) => {
    return {
        connectedChannel: channelForCurrentCall(state),
        show: screenSourceModal(state),
    };
};

const mapDispatchToProps = (dispatch: Dispatch) => bindActionCreators({
    hideScreenSourceModal,
}, dispatch);

export default connect(mapStateToProps, mapDispatchToProps)(ScreenSourceModal);
