import {bindActionCreators, Dispatch} from 'redux';
import {connect} from 'react-redux';
import {GlobalState} from 'mattermost-redux/types/store';

import {getChannel} from 'mattermost-redux/selectors/entities/channels';
import {getCurrentUserId} from 'mattermost-redux/selectors/entities/users';
import {getTeam, getCurrentTeamId} from 'mattermost-redux/selectors/entities/teams';

import {Client4} from 'mattermost-redux/client';

import {showExpandedView} from '../../actions';

import {connectedChannelID, voiceConnectedProfiles, voiceUsersStatuses, voiceChannelCallStartAt, voiceChannelScreenSharingID, expandedView} from '../../selectors';

import {getChannelURL} from '../../utils';

import CallWidget from './component';

const mapStateToProps = (state: GlobalState) => {
    const profiles = voiceConnectedProfiles(state);
    const pictures = [];
    for (let i = 0; i < profiles.length; i++) {
        pictures.push(Client4.getProfilePictureUrl(profiles[i].id, profiles[i].last_picture_update));
    }

    const channel = getChannel(state, connectedChannelID(state));

    let channelURL = '';
    if (channel) {
        channelURL = getChannelURL(state, channel, channel.team_id);
    }

    return {
        currentUserID: getCurrentUserId(state),
        channel,
        team: getTeam(state, getCurrentTeamId(state)),
        channelURL,
        profiles,
        pictures,
        statuses: voiceUsersStatuses(state) || {},
        callStartAt: voiceChannelCallStartAt(state, channel?.id) || 0,
        screenSharingID: voiceChannelScreenSharingID(state, channel?.id) || '',
        show: !expandedView(state),
    };
};

const mapDispatchToProps = (dispatch: Dispatch) => bindActionCreators({
    showExpandedView,
}, dispatch);

export default connect(mapStateToProps, mapDispatchToProps)(CallWidget);

