import {connect} from 'react-redux';
import {GlobalState} from '@mattermost/types/store';

import {getCurrentChannelId} from 'mattermost-redux/selectors/entities/channels';

import {channelState} from '../../selectors';

import ChannelHeaderMenuButton from './component';

const mapStateToProps = (state: GlobalState) => ({
    enabled: Boolean(channelState(state, getCurrentChannelId(state))?.enabled),
});

export default connect(mapStateToProps)(ChannelHeaderMenuButton);
