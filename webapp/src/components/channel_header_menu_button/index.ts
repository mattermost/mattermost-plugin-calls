import {GlobalState} from '@mattermost/types/store';
import {connect} from 'react-redux';
import {callsEnabledInCurrentChannel} from 'src/selectors';

import ChannelHeaderMenuButton from './component';

const mapStateToProps = (state: GlobalState) => ({
    enabled: callsEnabledInCurrentChannel(state),
});

export default connect(mapStateToProps)(ChannelHeaderMenuButton);
