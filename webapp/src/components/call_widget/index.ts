import {bindActionCreators, Dispatch} from 'redux';
import {connect} from 'react-redux';
import {GlobalState} from 'mattermost-redux/types/store';
import {UserProfile} from 'mattermost-redux/types/users';

import {getChannel} from 'mattermost-redux/selectors/entities/channels';
import {getCurrentUserId} from 'mattermost-redux/selectors/entities/users';
import {getTeam, getCurrentTeamId} from 'mattermost-redux/selectors/entities/teams';

import {Client4} from 'mattermost-redux/client';

import {UserState} from '../../types/types';

import {showExpandedView} from '../../actions';

import {connectedChannelID, voiceConnectedProfiles, voiceUsersStatuses, voiceChannelCallStartAt, voiceChannelScreenSharingID, expandedView} from '../../selectors';

import {getChannelURL, alphaSortProfiles, stateSortProfiles} from '../../utils';

import CallWidget from './component';

const mapStateToProps = (state: GlobalState) => {
    const channel = getChannel(state, connectedChannelID(state));

    const screenSharingID = voiceChannelScreenSharingID(state, channel?.id) || '';

    const sortedProfiles = (profiles: UserProfile[], statuses: {[key: string]: UserState}) => {
        return [...profiles].sort(alphaSortProfiles(profiles)).sort(stateSortProfiles(profiles, statuses, screenSharingID));
    };

    const statuses = voiceUsersStatuses(state);
    const profiles = sortedProfiles(voiceConnectedProfiles(state), statuses);

    const pictures = [];
    for (let i = 0; i < profiles.length; i++) {
        pictures.push(Client4.getProfilePictureUrl(profiles[i].id, profiles[i].last_picture_update));
    }

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
        screenSharingID,
        show: !expandedView(state),
    };
};

const mapDispatchToProps = (dispatch: Dispatch) => bindActionCreators({
    showExpandedView,
}, dispatch);

export default connect(mapStateToProps, mapDispatchToProps)(CallWidget);

