
import {connect} from 'react-redux';

import {isVoiceEnabled} from 'selectors';

import ChannelHeaderMenuButton from './component';

const mapStateToProps = (state) => ({
    enabled: isVoiceEnabled(state),
});

export default connect(mapStateToProps)(ChannelHeaderMenuButton);
