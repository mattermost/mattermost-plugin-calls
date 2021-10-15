import {GlobalState} from 'mattermost-redux/types/store';
import {connect} from 'react-redux';
import {getCurrentUserId} from 'mattermost-redux/selectors/entities/users';

import ScreenWindow from './component';

const mapStateToProps = (state: GlobalState) => {
    return {
        currentUserID: getCurrentUserId(state),
    };
};

export default connect(mapStateToProps)(ScreenWindow);
