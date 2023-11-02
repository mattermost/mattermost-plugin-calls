import {connect} from 'react-redux';

import {GlobalState} from '@mattermost/types/store';
import {callsEnabledInCurrentChannel} from 'src/selectors';

import ChannelHeaderMenuButton from './component';

const mapStateToProps = (state: GlobalState) => ({
    enabled: callsEnabledInCurrentChannel(state),
});

export default connect(mapStateToProps)(ChannelHeaderMenuButton);
