import {CallsConfig, Reaction, UserSessionState} from '@mattermost/calls-common/lib/types';
import {Channel} from '@mattermost/types/channels';
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
    getUserIdsInChannels,
    getUsers,
    getUserStatuses,
    isCurrentUserSystemAdmin,
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
    callsJobState,
    callState,
    hostControlNoticeState,
    hostsState,
    liveCaptionState,
    recentlyJoinedUsersState,
    screenSharingIDsState,
    sessionsState,
    usersReactionsState,
} from 'src/reducers';
import {
    CallJobReduxState,
    CallsUserPreferences,
    ChannelState,
    HostControlNotice,
    IncomingCallNotification,
    LiveCaptions,
} from 'src/types/types';
import {getCallsClientChannelID, getCallsClientInitTime, getCallsClientSessionID, getChannelURL} from 'src/utils';

import {pluginId} from './manifest';

//@ts-ignore GlobalState is not complete
const pluginState = (state: GlobalState) => state['plugins-' + pluginId] || {};

const clientState = (state: GlobalState) => pluginState(state).clientStateReducer;

export const channelIDForCurrentCall: (state: GlobalState) => string =
    createSelector(
        'channelIDForCurrentCall',
        getCallsClientChannelID,
        clientState,
        (channelID, cState) => channelID || cState?.channelID || '',
    );

export const channelForCurrentCall: (state: GlobalState) => Channel | undefined =
    createSelector(
        'channelForCurrentCall',
        getAllChannels,
        channelIDForCurrentCall,
        (channels, id) => channels[id],
    );

export const calls = (state: GlobalState): { [channelID: string]: callState } =>
    pluginState(state).calls;

export const idForCurrentCall: (state: GlobalState) => string | undefined =
    createSelector(
        'idForCurrentCall',
        calls,
        channelIDForCurrentCall,
        (callsStates, channelID) => callsStates[channelID]?.ID,
    );

export const threadIDForCurrentCall: (state: GlobalState) => string | undefined =
    createSelector(
        'threadIDForCurrentCall',
        calls,
        channelIDForCurrentCall,
        (callsStates, channelID) => callsStates[channelID]?.threadID,
    );

export const teamForCurrentCall: (state: GlobalState) => Team | null =
    createSelector(
        'teamForCurrentCall',
        getTeams,
        channelForCurrentCall,
        getCurrentTeamId,
        (teams, channel, currentTeamID) => {
            const teamID = channel?.team_id || currentTeamID;
            return teams[teamID];
        },
    );

const sessionsInCalls = (state: GlobalState): sessionsState => {
    return pluginState(state).sessions;
};

const userProfiles = (state: GlobalState) => state.entities.users.profiles;

const getProfilesMapFromSessions = (sessions: Record<string, UserSessionState>, profiles: Record<string, UserProfile>) => {
    const profilesMap: Record<string, UserProfile> = {};
    for (const session of Object.values(sessions || {})) {
        if (profiles[session.user_id]) {
            profilesMap[session.user_id] = profiles[session.user_id];
        }
    }
    return profilesMap;
};

export const profilesInCurrentCall: (state: GlobalState) => UserProfile[] =
    createSelector(
        'profilesInCurrentCall',
        userProfiles,
        sessionsInCalls,
        channelIDForCurrentCall,
        (profiles, sessions, channelID) => {
            return Object.values(getProfilesMapFromSessions(sessions[channelID], profiles));
        },
    );

export const profilesInCallInCurrentChannel: (state: GlobalState) => UserProfile[] =
    createSelector(
        'profilesInCallInCurrentChannel',
        userProfiles,
        sessionsInCalls,
        getCurrentChannelId,
        (profiles, sessions, currChannelId) => {
            return Object.values(getProfilesMapFromSessions(sessions[currChannelId], profiles));
        },
    );

// profilesInCurrentCallMap creates an id->UserProfile object for the currently connected call.
export const profilesInCurrentCallMap: (state: GlobalState) => { [id: string]: UserProfile } =
    createSelector(
        'profilesInCurrentCallMap',
        userProfiles,
        sessionsInCalls,
        channelIDForCurrentCall,
        (profiles, sessions, channelID) => {
            return getProfilesMapFromSessions(sessions[channelID], profiles);
        },
    );

export const profilesInCallInChannel = (state: GlobalState, channelID: string): UserProfile[] => {
    return Object.values(getProfilesMapFromSessions(sessionsInCalls(state)[channelID], userProfiles(state)));
};

export const numProfilesInCallInChannel = (state: GlobalState, channelID: string): number => {
    return profilesInCallInChannel(state, channelID).length;
};

export const numSessionsInCallInChannel = (state: GlobalState, channelID: string): number => {
    return Object.keys(sessionsInCalls(state)[channelID] || {}).length;
};

export const channelHasCall = (state: GlobalState, channelId: string): boolean => {
    return Boolean(calls(state)[channelId]);
};

export const currentChannelHasCall: (state: GlobalState) => boolean =
    createSelector(
        'currentChannelHasCall',
        calls,
        getCurrentChannelId,
        (callsStates, currChannelId) => Boolean(callsStates[currChannelId]),
    );

export const sessionsInCurrentCall: (state: GlobalState) => UserSessionState[] =
    createSelector(
        'sessionsInCurrentCall',
        sessionsInCalls,
        channelIDForCurrentCall,
        (sessions, channelID) => Object.values(sessions[channelID] || {}),
    );

export const sessionsInCurrentCallMap: (state: GlobalState) => { [sessionID: string]: UserSessionState } =
    createSelector(
        'sessionsInCurrentCallMap',
        sessionsInCalls,
        channelIDForCurrentCall,
        (sessions, channelID) => sessions[channelID],
    );

export const sessionForCurrentCall: (state: GlobalState) => UserSessionState =
    createSelector(
        'sessionsInCurrentCall',
        sessionsInCalls,
        channelIDForCurrentCall,
        getCallsClientSessionID,
        (sessions, channelID, sessionID) => sessions[channelID]?.[sessionID],
    );

const reactionsInCalls = (state: GlobalState): usersReactionsState => {
    return pluginState(state).reactions;
};

export const reactionsInCurrentCall: (state: GlobalState) => Reaction[] =
    createSelector(
        'reactionsInCurrentCall',
        reactionsInCalls,
        channelIDForCurrentCall,
        (reactions, channelID) => reactions[channelID]?.reactions || [],
    );

const liveCaptionsInCalls = (state: GlobalState): liveCaptionState => {
    return pluginState(state).liveCaptions;
};

export const liveCaptionsInCurrentCall: (state: GlobalState) => LiveCaptions =
    createSelector(
        'liveCaptionsInCurrentCall',
        liveCaptionsInCalls,
        channelIDForCurrentCall,
        (liveCaptions, channelID) => liveCaptions[channelID] || {},
    );

export const callStartAtForCallInChannel = (state: GlobalState, channelID: string): number => {
    return pluginState(state).calls[channelID]?.startAt || 0;
};

export const callStartAtForCurrentCall: (state: GlobalState) => number =
    createSelector(
        'callStartAtForCurrentCall',
        calls,
        channelIDForCurrentCall,
        getCallsClientInitTime,
        (callsStates, channelID, initTime) => callsStates[channelID]?.startAt || initTime || 0,
    );

export const callInCurrentChannel: (state: GlobalState) => callState | undefined =
    createSelector(
        'callInCurrentChannel',
        calls,
        getCurrentChannelId,
        (callsStates, currChannelId) => callsStates[currChannelId],
    );

export const idForCallInChannel = (state: GlobalState, channelID: string): string | undefined => {
    return pluginState(state).calls[channelID]?.ID;
};

export const callOwnerIDForCallInChannel = (state: GlobalState, channelID: string): string | undefined => {
    return pluginState(state).calls[channelID]?.ownerID;
};

const hostsInCalls = (state: GlobalState): hostsState => {
    return pluginState(state).hosts;
};

export const hostIDForCallInChannel = (state: GlobalState, channelID: string): string | undefined => {
    return hostsInCalls(state)[channelID]?.hostID;
};

export const hostIDForCurrentCall: (state: GlobalState) => string =
    createSelector(
        'hostIDForCurrentCall',
        hostsInCalls,
        channelIDForCurrentCall,
        (hosts, channelID) => hosts[channelID]?.hostID || '',
    );

export const hostChangeAtForCurrentCall: (state: GlobalState) => number =
    createSelector(
        'hostChangeAtForCurrentCall',
        hostsInCalls,
        channelIDForCurrentCall,
        (hosts, channelID) => hosts[channelID]?.hostChangeAt || 0,
    );

export const callDismissedNotification = (state: GlobalState, channelID: string) => {
    return Boolean(pluginState(state).dismissedCalls[channelID]);
};

const screenSharingIDsForCalls = (state: GlobalState): screenSharingIDsState => {
    return pluginState(state).screenSharingIDs;
};

export const screenSharingSessionForCurrentCall: (state: GlobalState) => UserSessionState | undefined =
    createSelector(
        'screenSharingSessionForCurrentCall',
        screenSharingIDsForCalls,
        channelIDForCurrentCall,
        sessionsInCalls,
        (ids, channelID, sessions) => sessions[channelID]?.[ids[channelID]],
    );

export const threadIDForCallInChannel = (state: GlobalState, channelID: string) => {
    return pluginState(state).calls[channelID]?.threadID || '';
};

const recordingsForCalls = (state: GlobalState): callsJobState => {
    return pluginState(state).recordings;
};

export const recordingForCurrentCall: (state: GlobalState) => CallJobReduxState =
    createSelector(
        'recordingForCurrentCall',
        recordingsForCalls,
        channelIDForCurrentCall,
        (recordings, channelID) => recordings[channelID] || {},
    );

export const hostControlNoticesForCalls = (state: GlobalState): hostControlNoticeState => {
    return pluginState(state).hostControlNotices;
};

export const hostControlNoticesForCurrentCall: (state: GlobalState) => HostControlNotice[] =
    createSelector(
        'hostControlNoticesForCurrentCall',
        hostControlNoticesForCalls,
        idForCurrentCall,
        (notices, id) => (id ? notices[id] || [] : []),
    );

const liveCaptionsStateForCalls = (state: GlobalState): callsJobState => {
    return pluginState(state).callLiveCaptionsState;
};

export const liveCaptionsStateForCurrentCall: (state: GlobalState) => CallJobReduxState =
    createSelector(
        'liveCaptionsStateForCurrentCall',
        liveCaptionsStateForCalls,
        channelIDForCurrentCall,
        (liveCaptions, channelID) => liveCaptions[channelID] || {},
    );

export const areLiveCaptionsAvailableInCurrentCall: (state: GlobalState) => boolean =
    createSelector(
        'areLiveCaptionsAvailableInCurrentCall',
        liveCaptionsStateForCurrentCall,
        (liveCaptions) => {
            if (!liveCaptions?.start_at) {
                return false;
            }
            return liveCaptions.start_at > liveCaptions.end_at;
        },
    );

const recentlyJoinedUsersInCalls = (state: GlobalState): recentlyJoinedUsersState => {
    return pluginState(state).recentlyJoinedUsers;
};

export const recentlyJoinedUsersInCurrentCall: (state: GlobalState) => string[] =
    createSelector(
        'recentlyJoinedUsersInCurrentCall',
        recentlyJoinedUsersInCalls,
        channelIDForCurrentCall,
        (users, channelID) => users[channelID] || [],
    );

export const isRecordingInCurrentCall: (state: GlobalState) => boolean =
    createSelector(
        'isRecordingInCurrentCall',
        recordingsForCalls,
        channelIDForCurrentCall,
        (recordings, channelID) => {
            const recording = recordings[channelID];
            if (!recording) {
                return false;
            }

            // Toggle wise (start/stop) we don't care whether the recording job is actually running.
            // We should be able to stop a recording even during the initialization phase.

            return recording.init_at > recording.end_at;
        },
    );

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
    const numCurrentUsers = profilesInCallInCurrentChannel(state).length;
    const max = maxParticipants(state);
    return max > 0 && numCurrentUsers >= max;
};

export const allowScreenSharing = (state: GlobalState) =>
    callsConfig(state).AllowScreenSharing;

export const recordingsEnabled = (state: GlobalState) =>
    callsConfig(state).EnableRecordings;

export const transcriptionsEnabled = (state: GlobalState) =>
    callsConfig(state).EnableTranscriptions;

export const liveCaptionsEnabled = (state: GlobalState) =>
    callsConfig(state).EnableLiveCaptions;

export const recordingMaxDuration = (state: GlobalState) =>
    callsConfig(state).MaxRecordingDuration;

export const rtcdEnabled = (state: GlobalState) =>
    pluginState(state).rtcdEnabled;

export const ringingEnabled = (state: GlobalState) =>
    callsConfig(state).EnableRinging;

export const transcribeAPI = (state: GlobalState) =>
    callsConfig(state).TranscribeAPI;

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

export const callsShowButton = (state: GlobalState, channelId?: string): boolean =>
    !callsExplicitlyDisabled(state, channelId || '');

export const hasPermissionsToEnableCalls = (state: GlobalState, channelId: string): boolean => {
    if (isCurrentUserSystemAdmin(state)) {
        return true;
    }
    if (!defaultEnabled(state)) {
        return false;
    }

    const channelRoles = getMyChannelRoles(state);
    const channel = getChannel(state, channelId);
    if (!channel) {
        return false;
    }

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
// Having trouble importing this, so embed.
enum LicenseSkus {
    E10 = 'E10',
    E20 = 'E20',
    Starter = 'starter',
    Professional = 'professional',
    Enterprise = 'enterprise',
}

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
    profilesInCurrentCall(state).length < callsUserPreferences(state).joinSoundParticipantsThreshold;

export const isOnPremNotEnterprise = (state: GlobalState): boolean => {
    const license = getLicense(state);
    const enterprise = license.SkuShortName === LicenseSkus.E20 || license.SkuShortName === LicenseSkus.Enterprise;
    return !isCloud(state) && !enterprise;
};

export const isAtLeastProfessional = (state: GlobalState): boolean => {
    const sku = callsConfig(state).sku_short_name;
    const enterprise = sku === LicenseSkus.E20 || sku === LicenseSkus.Enterprise;
    const professional = sku === LicenseSkus.E10 || sku === LicenseSkus.Professional;

    return enterprise || professional || isCloudProfessionalOrEnterpriseOrTrial(state);
};

export const areHostControlsAllowed = (state: GlobalState): boolean => callsConfig(state).HostControlsAllowed;

export const adminStats = (state: GlobalState) => state.entities.admin.analytics;

export const getChannelUrlAndDisplayName = (state: GlobalState, channel?: Channel) => {
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

export const clientConnecting = (state: GlobalState) => {
    return pluginState(state).clientConnecting;
};
