
import {connect} from 'react-redux';

import {voiceConnectedUsers} from 'selectors';

import ChannelHeaderButton from './component';

const mapStateToProps = (state) => ({
    userCount: voiceConnectedUsers(state).length,
});

export default connect(mapStateToProps)(ChannelHeaderButton);
