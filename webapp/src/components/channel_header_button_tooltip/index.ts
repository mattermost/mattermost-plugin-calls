
import {connect} from 'react-redux';

import {getCurrentChannelId} from 'mattermost-redux/selectors/entities/channels';

import {connectedChannelID} from 'selectors';

import ChannelHeaderButtonTooltip from './component';

const mapStateToProps = (state) => ({
    channelID: connectedChannelID(state),
    currChannelID: getCurrentChannelId(state),
});

export default connect(mapStateToProps)(ChannelHeaderButtonTooltip);
