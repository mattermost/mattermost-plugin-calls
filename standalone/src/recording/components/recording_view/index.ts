import {bindActionCreators, Dispatch} from 'redux';
import {connect} from 'react-redux';
import {GlobalState} from '@mattermost/types/store';
import {UserProfile} from '@mattermost/types/users';

import {getChannel} from 'mattermost-redux/selectors/entities/channels';
import {getCurrentUserId, getUser} from 'mattermost-redux/selectors/entities/users';

import {Client4} from 'mattermost-redux/client';

import {UserState} from 'plugin/types/types';

import {alphaSortProfiles, stateSortProfiles, isDMChannel, getUserIdFromDM} from 'plugin/utils';
import {
    voiceChannelCallStartAt,
    voiceConnectedProfilesInChannel,
    voiceUsersStatusesInChannel,
    voiceChannelScreenSharingID,
} from 'plugin/selectors';

import {callProfileImages} from 'src/recording/selectors';

import RecordingView from './component';

const mapStateToProps = (state: GlobalState) => {
    const channelID = window.callsClient?.channelID;
    const screenSharingID = voiceChannelScreenSharingID(state, channelID) || '';

    const sortedProfiles = (profiles: UserProfile[], statuses: {[key: string]: UserState}) => {
        return [...profiles].sort(alphaSortProfiles(profiles)).sort(stateSortProfiles(profiles, statuses, screenSharingID));
    };

    const statuses = voiceUsersStatusesInChannel(state, channelID);
    const profiles = sortedProfiles(voiceConnectedProfilesInChannel(state, channelID), statuses);

    const profileImages = callProfileImages(state, channelID);
    const pictures: {[key: string]: string} = {};

    if (profileImages) {
        for (let i = 0; i < profiles.length; i++) {
            pictures[String(profiles[i].id)] = profileImages[profiles[i].id];
        }
    }

    return {
        profiles,
        pictures,
        statuses,
        callStartAt: voiceChannelCallStartAt(state, channelID) || 0,
        screenSharingID,
        channel: getChannel(state, channelID),
    };
};

export default connect(mapStateToProps)(RecordingView);
