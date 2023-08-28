import {UserState} from '@calls/common/lib/types';
import {GlobalState} from '@mattermost/types/store';
import {UserProfile} from '@mattermost/types/users';
import {Client4} from 'mattermost-redux/client';
import {getChannel} from 'mattermost-redux/selectors/entities/channels';
import {getCurrentTeamId, getTeam} from 'mattermost-redux/selectors/entities/teams';
import {getThread} from 'mattermost-redux/selectors/entities/threads';
import {getCurrentUserId, getUser} from 'mattermost-redux/selectors/entities/users';
import {connect} from 'react-redux';
import {withRouter} from 'react-router-dom';

import {
    hideExpandedView,
    prefetchThread,
    recordingPromptDismissedAt,
    showScreenSourceModal,
    startCallRecording,
    trackEvent,
} from 'src/actions';
import {
    allowScreenSharing,
    callRecording,
    isRecording,
    connectedChannelID,
    expandedView,
    getChannelUrlAndDisplayName,
    recordingMaxDuration,
    recordingsEnabled,
    hostIDInCurrentCall,
    hostChangeAtInCurrentCall,
    callStartAt,
    callThreadID,
    callScreenSharingID,
    usersStatusesInCurrentCall,
    connectedProfilesInCurrentCall,
} from 'src/selectors';
import {alphaSortProfiles, getUserIdFromDM, isDMChannel, stateSortProfiles} from 'src/utils';
import {closeRhs, getIsRhsOpen, getRhsSelectedPostId, selectRhsPost} from 'src/webapp_globals';

import ExpandedView from './component';

const mapStateToProps = (state: GlobalState) => {
    const currentUserID = getCurrentUserId(state);
    const currentTeamID = getCurrentTeamId(state);
    const channel = getChannel(state, connectedChannelID(state) || '');
    const channelTeam = getTeam(state, channel?.team_id);
    const screenSharingID = callScreenSharingID(state, channel?.id) || '';
    const threadID = callThreadID(state, channel?.id);

    const sortedProfiles = (profiles: UserProfile[], statuses: { [key: string]: UserState }) => {
        return [...profiles].sort(alphaSortProfiles).sort(stateSortProfiles(profiles, statuses, screenSharingID, true));
    };

    const statuses = usersStatusesInCurrentCall(state);
    const profiles = sortedProfiles(connectedProfilesInCurrentCall(state), statuses);

    const pictures: { [key: string]: string } = {};
    for (let i = 0; i < profiles.length; i++) {
        pictures[String(profiles[i].id)] = Client4.getProfilePictureUrl(profiles[i].id, profiles[i].last_picture_update);
    }

    let connectedDMUser;
    if (channel && isDMChannel(channel)) {
        const otherID = getUserIdFromDM(channel.name, currentUserID);
        connectedDMUser = getUser(state, otherID);
    }

    const {channelDisplayName} = getChannelUrlAndDisplayName(state, channel);

    const thread = getThread(state, threadID);

    return {
        show: expandedView(state),
        currentUserID,
        currentTeamID,
        profiles,
        pictures,
        statuses,
        callStartAt: callStartAt(state, channel?.id) || 0,
        callHostID: hostIDInCurrentCall(state),
        callHostChangeAt: hostChangeAtInCurrentCall(state),
        callRecording: callRecording(state, channel?.id),
        isRecording: isRecording(state, channel?.id),
        screenSharingID,
        channel,
        channelTeam,
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
    recordingPromptDismissedAt,
};

export default withRouter(connect(mapStateToProps, mapDispatchToProps)(ExpandedView));
