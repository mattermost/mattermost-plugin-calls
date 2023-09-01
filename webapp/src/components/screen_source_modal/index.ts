import {GlobalState} from '@mattermost/types/store';
import {getChannel} from 'mattermost-redux/selectors/entities/channels';
import {connect} from 'react-redux';
import {bindActionCreators, Dispatch} from 'redux';

import {hideScreenSourceModal} from '../../actions';
import {connectedChannelID, screenSourceModal} from '../../selectors';
import ScreenSourceModal from './component';

const mapStateToProps = (state: GlobalState) => {
    return {
        connectedChannel: getChannel(state, connectedChannelID(state) || ''),
        show: screenSourceModal(state),
    };
};

const mapDispatchToProps = (dispatch: Dispatch) => bindActionCreators({
    hideScreenSourceModal,
}, dispatch);

export default connect(mapStateToProps, mapDispatchToProps)(ScreenSourceModal);
