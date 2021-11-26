import {bindActionCreators, Dispatch} from 'redux';
import {connect} from 'react-redux';
import {GlobalState} from 'mattermost-redux/types/store';
import {UserProfile} from 'mattermost-redux/types/users';

import {getChannel} from 'mattermost-redux/selectors/entities/channels';
import {getCurrentUserId} from 'mattermost-redux/selectors/entities/users';

import {Client4} from 'mattermost-redux/client';

import {UserState} from '../../types/types';

import {alphaSortProfiles, stateSortProfiles} from '../../utils';
import {hideExpandedView} from '../../actions';
import {expandedView, voiceChannelCallStartAt, connectedChannelID, voiceConnectedProfiles, voiceUsersStatuses, voiceChannelScreenSharingID} from '../../selectors';

import ExpandedView from './component';

const mapStateToProps = (state: GlobalState) => {
    const sortedProfiles = (profiles: UserProfile[], statuses: {[key: string]: UserState}) => {
        return [...profiles].sort(alphaSortProfiles(profiles)).sort(stateSortProfiles(profiles, statuses));
    };

    const statuses = voiceUsersStatuses(state);
    const profiles = sortedProfiles(voiceConnectedProfiles(state), statuses);

    const pictures: {[key: string]: string} = {};
    for (let i = 0; i < profiles.length; i++) {
        pictures[String(profiles[i].id)] = Client4.getProfilePictureUrl(profiles[i].id, profiles[i].last_picture_update);
    }
    const channel = getChannel(state, connectedChannelID(state));

    return {
        show: expandedView(state),
        currentUserID: getCurrentUserId(state),
        profiles,
        pictures,
        statuses,
        callStartAt: voiceChannelCallStartAt(state, channel?.id) || 0,
        screenSharingID: voiceChannelScreenSharingID(state, channel?.id) || '',
    };
};

const mapDispatchToProps = (dispatch: Dispatch) => bindActionCreators({
    hideExpandedView,
}, dispatch);

export default connect(mapStateToProps, mapDispatchToProps)(ExpandedView);
