import {connect} from 'react-redux';
import {GlobalState} from '@mattermost/types/store';

import {getCurrentChannelId} from 'mattermost-redux/selectors/entities/channels';

import {callsShowButton} from 'src/selectors';

import ChannelHeaderMenuButton from './component';

const mapStateToProps = (state: GlobalState) => ({
    enabled: callsShowButton(state, getCurrentChannelId(state)),
});

export default connect(mapStateToProps)(ChannelHeaderMenuButton);
