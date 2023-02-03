import {connect} from 'react-redux';
import {GlobalState} from '@mattermost/types/store';
import {UserProfile} from '@mattermost/types/users';

import {getChannel} from 'mattermost-redux/selectors/entities/channels';
import {getCurrentUserId, getUser} from 'mattermost-redux/selectors/entities/users';
import {getCurrentTeamId, getTeam} from 'mattermost-redux/selectors/entities/teams';

import {Client4} from 'mattermost-redux/client';

import {withRouter} from 'react-router-dom';

import {getThread} from 'mattermost-redux/selectors/entities/threads';

import {UserState} from '@mmcalls/common/lib/types';

import {alphaSortProfiles, stateSortProfiles, isDMChannel, getUserIdFromDM} from 'src/utils';

import {
    closeRhs,
    selectRhsPost,
    getIsRhsOpen,
    getRhsSelectedPostId,
} from 'src/webapp_globals';
import {
    hideExpandedView,
    prefetchThread,
    showScreenSourceModal,
    trackEvent,
    startCallRecording,
} from 'src/actions';
import {
    expandedView,
    voiceChannelCallStartAt,
    connectedChannelID,
    voiceConnectedProfiles,
    voiceUsersStatuses,
    voiceChannelScreenSharingID,
    voiceChannelRootPost,
    getChannelUrlAndDisplayName,
    allowScreenSharing,
    voiceChannelCallHostID,
    callRecording,
    recordingsEnabled,
    recordingMaxDuration,
    voiceChannelCallHostChangeAt,
} from 'src/selectors';

import ExpandedView from './component';

const mapStateToProps = (state: GlobalState) => {
    const currentUserID = getCurrentUserId(state);
    const currentTeamID = getCurrentTeamId(state);
    const channel = getChannel(state, connectedChannelID(state));
    const channelTeam = getTeam(state, channel?.team_id);
    const screenSharingID = voiceChannelScreenSharingID(state, channel?.id) || '';
    const threadID = voiceChannelRootPost(state, channel?.id);

    const sortedProfiles = (profiles: UserProfile[], statuses: { [key: string]: UserState }) => {
        return [...profiles].sort(alphaSortProfiles).sort(stateSortProfiles(profiles, statuses, screenSharingID));
    };

    const statuses = voiceUsersStatuses(state);
    const profiles = sortedProfiles(voiceConnectedProfiles(state), statuses);

    const pictures: { [key: string]: string } = {};
    for (let i = 0; i < profiles.length; i++) {
        pictures[String(profiles[i].id)] = Client4.getProfilePictureUrl(profiles[i].id, profiles[i].last_picture_update);
    }

    let connectedDMUser;
    if (channel && isDMChannel(channel)) {
        const otherID = getUserIdFromDM(channel.name, currentUserID);
        connectedDMUser = getUser(state, otherID);
    }

    const {channelURL, channelDisplayName} = getChannelUrlAndDisplayName(state, channel);

    const thread = getThread(state, threadID);

    return {
        show: expandedView(state),
        currentUserID,
        currentTeamID,
        profiles,
        pictures,
        statuses,
        callStartAt: voiceChannelCallStartAt(state, channel?.id) || 0,
        callHostID: voiceChannelCallHostID(state, channel?.id) || '',
        callHostChangeAt: voiceChannelCallHostChangeAt(state, channel?.id) || 0,
        callRecording: callRecording(state, channel?.id),
        screenSharingID,
        channel,
        channelTeam,
        channelURL,
        channelDisplayName,
        connectedDMUser,
        threadID,
        threadUnreadReplies: thread?.unread_replies,
        threadUnreadMentions: thread?.unread_mentions,
        rhsSelectedThreadID: getRhsSelectedPostId?.(state),
        isRhsOpen: getIsRhsOpen?.(state),
        allowScreenSharing: allowScreenSharing(state),
        recordingsEnabled: recordingsEnabled(state),
        recordingMaxDuration: recordingMaxDuration(state),
    };
};

const mapDispatchToProps = {
    hideExpandedView,
    showScreenSourceModal,
    closeRhs,
    selectRhsPost,
    prefetchThread,
    trackEvent,
    startCallRecording,
};

export default withRouter(connect(mapStateToProps, mapDispatchToProps)(ExpandedView));
