import {connect} from 'react-redux';
import {GlobalState} from '@mattermost/types/store';

import {getCurrentChannelId} from 'mattermost-redux/selectors/entities/channels';

import {callsEnabled} from 'src/selectors';

import ChannelHeaderMenuButton from './component';

const mapStateToProps = (state: GlobalState) => ({
    enabled: callsEnabled(state, getCurrentChannelId(state)),
});

export default connect(mapStateToProps)(ChannelHeaderMenuButton);
