import {connect} from 'react-redux';

import {getChannel} from 'mattermost-redux/selectors/entities/channels';

import {connectedChannelID, isVoiceMuted} from 'selectors';

import {disconnectVoice} from 'actions';

import LeftSidebarHeader from './component';

const mapStateToProps = (state) => {
    return {
        channel: getChannel(state, connectedChannelID(state)),
    };
};

export default connect(mapStateToProps)(LeftSidebarHeader);

