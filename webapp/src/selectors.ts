import {CallsConfig, Reaction, UserState} from '@calls/common/lib/types';
import {Channel} from '@mattermost/types/channels';
import {LicenseSkus} from '@mattermost/types/general';
import {GlobalState} from '@mattermost/types/store';
import {Team} from '@mattermost/types/teams';
import {UserProfile} from '@mattermost/types/users';
import {getAllChannels, getChannel, getCurrentChannelId} from 'mattermost-redux/selectors/entities/channels';
import {getMyChannelMemberships} from 'mattermost-redux/selectors/entities/common';
import {getLicense} from 'mattermost-redux/selectors/entities/general';
import {getTeammateNameDisplaySetting} from 'mattermost-redux/selectors/entities/preferences';
import {getMyChannelRoles, getMyTeamRoles} from 'mattermost-redux/selectors/entities/roles';
import {getCurrentTeamId, getTeams} from 'mattermost-redux/selectors/entities/teams';
import {
    getCurrentUserId,
    getUsers,
    getUserIdsInChannels,
    isCurrentUserSystemAdmin,
    getUserStatuses,
} from 'mattermost-redux/selectors/entities/users';
import {
    getGroupDisplayNameFromUserIds,
    getUserIdFromChannelName,
    isDirectChannel,
    isGroupChannel,
} from 'mattermost-redux/utils/channel_utils';
import {displayUsername} from 'mattermost-redux/utils/user_utils';
import {createSelector} from 'reselect';

import {
    callState,
    connectedChannelsState,
    usersStatusesState,
    usersReactionsState,
    hostsState,
    screenSharingIDsState,
} from 'src/reducers';
import {CallRecordingReduxState, CallsUserPreferences, ChannelState, IncomingCallNotification} from 'src/types/types';
import {getChannelURL} from 'src/utils';

import {pluginId} from './manifest';

//@ts-ignore GlobalState is not complete
const pluginState = (state: GlobalState) => state['plugins-' + pluginId] || {};

export const connectedChannels = (state: GlobalState): connectedChannelsState =>
    pluginState(state).connectedChannels;

export const connectedUsersInCurrentChannel: (state: GlobalState) => string[] =
    createSelector(
        'connectedUsersInCurrentChannel',
        connectedChannels,
        getCurrentChannelId,
        (channels, currChannelId) => channels[currChannelId] || [],
    );

const numConnectedUsersInCurrentChannel = (state: GlobalState) =>
    connectedUsersInCurrentChannel(state).length;

export const connectedUsersInChannel = (state: GlobalState, channelId: string): string[] => {
    const channels = connectedChannels(state);
    if (channels && channels[channelId]) {
        return channels[channelId];
    }
    return [];
};

export const channelHasCall = (state: GlobalState, channelId: string): boolean => {
    const users = connectedUsersInChannel(state, channelId);
    return users && users.length > 0;
};

export const connectedChannelID = (state: GlobalState): string =>
    pluginState(state).connectedChannelID || '';

export const connectedChannel: (state: GlobalState) => Channel | null =
    createSelector(
        'connectedChannel',
        getAllChannels,
        connectedChannelID,
        (channels, id) => channels[id],
    );

export const calls = (state: GlobalState): { [channelID: string]: callState} =>
    pluginState(state).calls;

export const connectedCallID: (state: GlobalState) => string | undefined =
    createSelector(
        'connectedCallID',
        calls,
        connectedChannelID,
        (callsStates, channelID) => callsStates[channelID]?.ID,
    );

export const connectedTeam: (state: GlobalState) => Team | null =
    createSelector(
        'connectedTeam',
        getTeams,
        connectedChannel,
        getCurrentTeamId,
        (teams, channel, currentTeamID) => {
            const teamID = channel?.team_id || currentTeamID;
            return teams[teamID];
        },
    );

const numUsersInConnectedChannel : (state: GlobalState) => number =
    createSelector(
        'numUsersInConnectedChannel',
        connectedChannelID,
        connectedChannels,
        (channelID, channels) => {
            return channels[String(channelID)]?.length || 0;
        },
    );

const connectedProfiles = (state: GlobalState) => pluginState(state).connectedProfiles;

export const connectedProfilesInCurrentCall : (state: GlobalState) => UserProfile[] =
    createSelector(
        'connectedProfilesInCurrentCall',
        connectedProfiles,
        connectedChannelID,
        (profiles, channelID) => profiles[channelID] || [],
    );

export const connectedProfilesInCurrentChannel: (state: GlobalState) => UserProfile[] =
    createSelector(
        'connectedProfilesInCurrentChannel',
        connectedProfiles,
        getCurrentChannelId,
        (profiles, currChannelId) => profiles[currChannelId] || [],
    );

// idToProfileInCurrentCall creates an id->UserProfile object for the currently connected call.
export const idToProfileInCurrentCall: (state: GlobalState) => { [id: string]: UserProfile } =
    createSelector(
        'idToProfileInCurrentCall',
        connectedProfilesInCurrentCall,
        (profiles) => makeIdToObject(profiles),
    );

export const connectedProfilesInChannel: (state: GlobalState, channelId: string) => UserProfile[] =
    (state, channelID) => {
        return connectedProfiles(state)[channelID] || [];
    };

const usersStatuses = (state: GlobalState): usersStatusesState => {
    return pluginState(state).usersStatuses;
};

export const usersStatusesInCurrentCall: (state: GlobalState) => { [id: string]: UserState } =
    createSelector(
        'usersStatusesInCurrentCall',
        usersStatuses,
        connectedChannelID,
        (statuses, channelID) => statuses[channelID] || {},
    );

const callsReactions = (state: GlobalState): usersReactionsState => {
    return pluginState(state).reactions;
};

export const reactionsInCurrentCall: (state: GlobalState) => Reaction[] =
    createSelector(
        'reactionsInCurrentCall',
        callsReactions,
        connectedChannelID,
        (reactions, channelID) => reactions[channelID]?.reactions || [],
    );

export const callStartAt = (state: GlobalState, channelID: string): number | undefined => {
    return pluginState(state).calls[channelID]?.startAt;
};

export const callInCurrentChannel: (state: GlobalState) => callState =
    createSelector(
        'callStartAtInCurrentChannel',
        calls,
        getCurrentChannelId,
        (callsStates, currChannelId) => callsStates[currChannelId],
    );

export const getCallID = (state: GlobalState, channelID: string): string | undefined => {
    return pluginState(state).calls[channelID]?.ID;
};

export const callOwnerID = (state: GlobalState, channelID: string): string | undefined => {
    return pluginState(state).calls[channelID]?.ownerID;
};

const callsHosts = (state: GlobalState): hostsState => {
    return pluginState(state).hosts;
};

export const hostIDInCurrentCall: (state: GlobalState) => string =
    createSelector(
        'hostIDInCurrentCall',
        callsHosts,
        connectedChannelID,
        (hosts, channelID) => hosts[channelID]?.hostID || '',
    );

export const hostChangeAtInCurrentCall: (state: GlobalState) => number =
    createSelector(
        'hostChangeAtInCurrentCall',
        callsHosts,
        connectedChannelID,
        (hosts, channelID) => hosts[channelID]?.hostChangeAt || 0,
    );

export const callDismissedNotification = (state: GlobalState, channelID: string) => {
    return Boolean(pluginState(state).dismissedCalls[channelID]);
};

const callsScreenSharingIDs = (state: GlobalState): screenSharingIDsState => {
    return pluginState(state).screenSharingIDs;
};

export const screenSharingIDInCurrentCall: (state: GlobalState) => string =
    createSelector(
        'screenSharingIDInCurrentCall',
        callsScreenSharingIDs,
        connectedChannelID,
        (ids, channelID) => ids[channelID] || '',
    );

export const callThreadID = (state: GlobalState, channelID: string) => {
    return pluginState(state).calls[channelID]?.threadID || '';
};

export const callRecording = (state: GlobalState, callID: string): CallRecordingReduxState => {
    return pluginState(state).recordings[callID];
};

export const recentlyJoinedUsers = (state: GlobalState, channelID: string): string[] => {
    return pluginState(state).recentlyJoinedUsers[channelID] || [];
};

export const isRecording = (state: GlobalState, callID: string): boolean => {
    const recording = callRecording(state, callID);
    if (!recording) {
        return false;
    }

    // Toggle wise (start/stop) we don't care whether the recording job is actually running.
    // We should be able to stop a recording even during the initialization phase.

    return recording.init_at > recording.end_at;
};

export const incomingCalls = (state: GlobalState): IncomingCallNotification[] =>
    pluginState(state).incomingCalls;

export const sortedIncomingCalls: (state: GlobalState) => IncomingCallNotification[] =
    createSelector(
        'sortedIncomingCalls',
        incomingCalls,
        (callsStates) => [...callsStates].sort((a, b) => b.startAt - a.startAt),
    );

export const dismissedCalls = (state: GlobalState): { [callID: string]: boolean } =>
    pluginState(state).dismissedCalls;

export const dismissedCallForCurrentChannel: (state: GlobalState) => boolean =
    createSelector(
        'dismissedCallForCurrentChannel',
        dismissedCalls,
        callInCurrentChannel,
        (dismissed, call) => Boolean(dismissed[call?.ID || '']),
    );

export const ringingForCall = (state: GlobalState, callID: string): boolean =>
    pluginState(state).ringingForCalls[callID] || false;

export const currentlyRinging = (state: GlobalState): boolean => {
    for (const val of Object.values(pluginState(state).ringingForCalls)) {
        if (val) {
            return true;
        }
    }
    return false;
};

export const didRingForCall = (state: GlobalState, callID: string): boolean =>
    pluginState(state).didRingForCalls[callID] || false;

export const didNotifyForCall = (state: GlobalState, callID: string): boolean =>
    pluginState(state).didNotifyForCalls[callID] || false;

//
// Config logic
//
export const callsConfig = (state: GlobalState): CallsConfig =>
    pluginState(state).callsConfig;

export const iceServers = (state: GlobalState): RTCIceServer[] =>
    callsConfig(state).ICEServersConfigs || [];

export const defaultEnabled = (state: GlobalState) =>
    callsConfig(state).DefaultEnabled;

export const maxParticipants = (state: GlobalState) =>
    callsConfig(state).MaxCallParticipants;

export const needsTURNCredentials = (state: GlobalState) =>
    callsConfig(state).NeedsTURNCredentials;

export const isLimitRestricted = (state: GlobalState): boolean => {
    const numCurrentUsers = numConnectedUsersInCurrentChannel(state);
    const max = maxParticipants(state);
    return max > 0 && numCurrentUsers >= max;
};

export const allowScreenSharing = (state: GlobalState) =>
    callsConfig(state).AllowScreenSharing;

export const recordingsEnabled = (state: GlobalState) =>
    callsConfig(state).EnableRecordings;

export const recordingMaxDuration = (state: GlobalState) =>
    callsConfig(state).MaxRecordingDuration;

export const rtcdEnabled = (state: GlobalState) =>
    pluginState(state).rtcdEnabled;

export const ringingEnabled = (state: GlobalState) =>
    callsConfig(state).EnableRinging;

//
// Calls enabled/disabled logic
//
export const channelState = (state: GlobalState, channelId: string): ChannelState =>
    pluginState(state).channels[channelId];

export const callsExplicitlyEnabled = (state: GlobalState, channelId: string): boolean =>
    Boolean(channelState(state, channelId)?.enabled);

export const callsExplicitlyDisabled = (state: GlobalState, channelId: string): boolean => {
    const enabled = channelState(state, channelId)?.enabled;
    return (typeof enabled !== 'undefined') && !enabled;
};

export const callsEnabledInCurrentChannel = (state: GlobalState): boolean => {
    const channelId = getCurrentChannelId(state);
    if (callsExplicitlyDisabled(state, channelId)) {
        return false;
    }
    return callsExplicitlyEnabled(state, channelId) || defaultEnabled(state) || isCurrentUserSystemAdmin(state);
};

export const endCallModal = (state: GlobalState) => {
    return pluginState(state).endCallModal;
};

export const callsShowButton = (state: GlobalState, channelId: string): boolean =>
    !callsExplicitlyDisabled(state, channelId);

export const hasPermissionsToEnableCalls = (state: GlobalState, channelId: string): boolean => {
    if (isCurrentUserSystemAdmin(state)) {
        return true;
    }
    if (!defaultEnabled(state)) {
        return false;
    }

    const channelRoles = getMyChannelRoles(state);
    const channel = getChannel(state, channelId);
    const teamRoles = getMyTeamRoles(state)[channel.team_id];
    const cm = getMyChannelMemberships(state)[channelId];

    return (isDirectChannel(channel) || isGroupChannel(channel)) ||
        cm?.scheme_admin === true ||
        channelRoles[channel.id]?.has('channel_admin') ||
        teamRoles.has('team_admin');
};

//
// Selectors for Cloud and beta limits:
//
const cloudSku = (state: GlobalState): string =>
    callsConfig(state).sku_short_name;

export const isCloud = (state: GlobalState): boolean =>
    getLicense(state)?.Cloud === 'true';

export const isCloudStarter = (state: GlobalState): boolean =>
    isCloud(state) && cloudSku(state) === LicenseSkus.Starter;

export const isCloudProfessional = (state: GlobalState): boolean =>
    isCloud(state) && cloudSku(state) === LicenseSkus.Professional;

export const isCloudEnterprise = (state: GlobalState): boolean =>
    isCloud(state) && cloudSku(state) === LicenseSkus.Enterprise;

const getSubscription = (state: GlobalState) => state.entities.cloud.subscription;

export const isCloudTrial = (state: GlobalState): boolean =>
    getSubscription(state)?.is_free_trial === 'true';

export const isCloudProfessionalOrEnterpriseOrTrial = (state: GlobalState): boolean =>
    isCloudProfessional(state) || isCloudEnterprise(state) || isCloudTrial(state);

export const isCloudTrialCompleted = (state: GlobalState): boolean => {
    const subscription = getSubscription(state);
    return subscription?.is_free_trial === 'false' && subscription?.trial_end_at > 0;
};

export const isCloudTrialNeverStarted = (state: GlobalState): boolean =>
    getSubscription(state)?.trial_end_at === 0;

export const callsUserPreferences = (state: GlobalState): CallsUserPreferences =>
    pluginState(state).callsUserPreferences;

export const shouldPlayJoinUserSound = (state: GlobalState): boolean =>
    numUsersInConnectedChannel(state) < callsUserPreferences(state).joinSoundParticipantsThreshold;

export const isOnPremNotEnterprise = (state: GlobalState): boolean => {
    const license = getLicense(state);
    const enterprise = license.SkuShortName === LicenseSkus.E20 || license.SkuShortName === LicenseSkus.Enterprise;
    return !isCloud(state) && !enterprise;
};

export const adminStats = (state: GlobalState) => state.entities.admin.analytics;

export const getChannelUrlAndDisplayName = (state: GlobalState, channel: Channel) => {
    const currentUserID = getCurrentUserId(state);
    const teammateNameDisplaySetting = getTeammateNameDisplaySetting(state);
    const users = getUsers(state);

    let channelURL = '';
    let channelDisplayName = '';
    if (channel) {
        channelURL = getChannelURL(state, channel, channel.team_id);

        if (isDirectChannel(channel)) {
            const otherUserID = getUserIdFromChannelName(currentUserID, channel.name);
            const otherUser = users[otherUserID];
            channelDisplayName = displayUsername(otherUser, teammateNameDisplaySetting, false);
        } else if (isGroupChannel(channel)) {
            const userIdsInChannel = getUserIdsInChannels(state)?.[channel.id];
            channelDisplayName = userIdsInChannel && getGroupDisplayNameFromUserIds(userIdsInChannel, users, currentUserID, teammateNameDisplaySetting);
        } else {
            channelDisplayName = channel.display_name;
        }
    }
    return {channelURL, channelDisplayName};
};

export const getStatusForCurrentUser: (state: GlobalState) => string =
    createSelector(
        'getStatusForCurrentUser',
        getCurrentUserId,
        getUserStatuses,
        (id, statuses) => statuses[id],
    );

export function makeIdToObject<HasId extends { id: string }>(arr: HasId[]) {
    return arr.reduce((acc: { [id: string]: HasId }, e) => {
        acc[e.id] = e;
        return acc;
    }, {});
}

// modals

export const expandedView = (state: GlobalState) => {
    return pluginState(state).expandedView;
};

export const switchCallModal = (state: GlobalState) => {
    return pluginState(state).switchCallModal;
};

export const screenSourceModal = (state: GlobalState) => {
    return pluginState(state).screenSourceModal;
};
