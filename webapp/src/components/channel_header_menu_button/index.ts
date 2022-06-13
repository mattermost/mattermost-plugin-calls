import {connect} from 'react-redux';
import {GlobalState} from '@mattermost/types/store';

import {isVoiceEnabled} from '../../selectors';

import ChannelHeaderMenuButton from './component';

const mapStateToProps = (state: GlobalState) => ({
    enabled: isVoiceEnabled(state),
});

export default connect(mapStateToProps)(ChannelHeaderMenuButton);
