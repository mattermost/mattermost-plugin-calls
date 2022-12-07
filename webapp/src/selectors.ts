import {getCurrentChannel, getCurrentChannelId} from 'mattermost-redux/selectors/entities/channels';
import {
    getCurrentUserId,
    getUsers,
    getUserIdsInChannels,
} from 'mattermost-redux/selectors/entities/users';
import {getTeammateNameDisplaySetting} from 'mattermost-redux/selectors/entities/preferences';
import {getLicense} from 'mattermost-redux/selectors/entities/general';
import {createSelector} from 'reselect';

import {GlobalState} from '@mattermost/types/store';
import {LicenseSkus} from '@mattermost/types/general';
import {Channel} from '@mattermost/types/channels';
import {UserProfile} from '@mattermost/types/users';

import {
    getGroupDisplayNameFromUserIds,
    getUserIdFromChannelName,
    isDirectChannel,
    isGroupChannel,
} from 'mattermost-redux/utils/channel_utils';
import {displayUsername} from 'mattermost-redux/utils/user_utils';

import {getChannelURL, isDMChannel} from 'src/utils';
import {CallsConfig, CallsUserPreferences, Reaction, UserState} from 'src/types/types';

import {pluginId} from './manifest';

//@ts-ignore GlobalState is not complete
const pluginState = (state: GlobalState) => state['plugins-' + pluginId] || {};

export const voiceConnectedChannels = (state: GlobalState) => pluginState(state).voiceConnectedChannels;
export const voiceConnectedUsers = (state: GlobalState) => {
    const currentChannelID = getCurrentChannelId(state);
    const channels = voiceConnectedChannels(state);
    if (channels && channels[currentChannelID]) {
        return channels[currentChannelID];
    }
    return [];
};

const numCurrentVoiceConnectedUsers: (state: GlobalState) => number = createSelector(
    'numCurrentVoiceConnectedUsers',
    voiceConnectedUsers,
    (connectedUsers) => connectedUsers.length,
);

export const voiceConnectedUsersInChannel = (state: GlobalState, channelID: string) => {
    const channels = voiceConnectedChannels(state);
    if (channels && channels[channelID]) {
        return channels[channelID];
    }
    return [];
};

export const connectedChannelID = (state: GlobalState) => pluginState(state).connectedChannelID;

const numUsersInConnectedChannel: (state: GlobalState) => number = createSelector(
    'numUsersInConnectedChannel',
    connectedChannelID,
    voiceConnectedChannels,
    (channelID, channels) => channels[channelID]?.length || 0,
);

export const voiceConnectedProfiles: (state: GlobalState) => UserProfile[] = (state) => {
    if (!pluginState(state).voiceConnectedProfiles) {
        return [];
    }
    return pluginState(state).voiceConnectedProfiles[connectedChannelID(state)] || [];
};

// idToProfileInCurrentChannel creates an id->UserProfile object for the currently connected channel.
export const idToProfileInConnectedChannel: (state: GlobalState) => { [id: string]: UserProfile } =
    createSelector(
        'idToProfileInCurrentChannel',
        voiceConnectedProfiles,
        (profiles) => makeIdToObject(profiles),
    );

export const voiceConnectedProfilesInChannel: (state: GlobalState, channelId: string) => UserProfile[] =
    (state, channelID) => {
        if (!pluginState(state).voiceConnectedProfiles) {
            return [];
        }
        return pluginState(state).voiceConnectedProfiles[channelID] || [];
    };

export const voiceUsersStatuses: (state: GlobalState) => { [id: string]: UserState } = (state: GlobalState) => {
    return pluginState(state).voiceUsersStatuses[connectedChannelID(state)] || {};
};

export const voiceReactions: (state: GlobalState) => Reaction[] = (state: GlobalState) => {
    return pluginState(state).reactionStatus[connectedChannelID(state)]?.reactions || [];
};

export const voiceUsersStatusesInChannel = (state: GlobalState, channelID: string) => {
    return pluginState(state).voiceUsersStatuses[channelID] || {};
};

export const voiceChannelCallStartAt = (state: GlobalState, channelID: string) => {
    return pluginState(state).voiceChannelCalls[channelID]?.startAt;
};

export const voiceChannelCallOwnerID = (state: GlobalState, channelID: string) => {
    return pluginState(state).voiceChannelCalls[channelID]?.ownerID;
};

export const voiceChannelCallHostID = (state: GlobalState, channelID: string) => {
    return pluginState(state).voiceChannelCalls[channelID]?.hostID;
};

export const voiceChannelCallHostChangeAt = (state: GlobalState, channelID: string) => {
    return pluginState(state).voiceChannelCalls[channelID]?.hostChangeAt;
};

export const voiceChannelScreenSharingID = (state: GlobalState, channelID: string) => {
    return pluginState(state).voiceChannelScreenSharingID[channelID];
};

export const callRecording = (state: GlobalState, callID: string) => {
    return pluginState(state).callsRecordings[callID];
};

export const expandedView = (state: GlobalState) => {
    return pluginState(state).expandedView;
};

export const switchCallModal = (state: GlobalState) => {
    return pluginState(state).switchCallModal;
};

export const screenSourceModal = (state: GlobalState) => {
    return pluginState(state).screenSourceModal;
};

export const voiceChannelRootPost = (state: GlobalState, channelID: string) => {
    return pluginState(state).voiceChannelRootPost[channelID];
};

const callsConfig = (state: GlobalState): CallsConfig => {
    return pluginState(state).callsConfig;
};

export const iceServers: (state: GlobalState) => RTCIceServer[] = createSelector(
    'iceServers',
    callsConfig,
    (config) => config.ICEServersConfigs || [],
);

export const allowEnableCalls: (state: GlobalState) => boolean = createSelector(
    'allowEnableCalls',
    callsConfig,
    (config) => config.AllowEnableCalls,
);

export const maxParticipants: (state: GlobalState) => number = createSelector(
    'maxParticipants',
    callsConfig,
    (config) => config.MaxCallParticipants,
);

export const needsTURNCredentials: (state: GlobalState) => boolean = createSelector(
    'needsTURNCredentials',
    callsConfig,
    (config) => config.NeedsTURNCredentials,
);

export const isLimitRestricted: (state: GlobalState) => boolean = createSelector(
    'isLimitRestricted',
    numCurrentVoiceConnectedUsers,
    maxParticipants,
    (numCurrentUsers, max) => max > 0 && numCurrentUsers >= max,
);

export const allowScreenSharing: (state: GlobalState) => boolean = createSelector(
    'allowScreenSharing',
    callsConfig,
    (config) => config.AllowScreenSharing,
);

export const recordingsEnabled: (state: GlobalState) => boolean = createSelector(
    'recordingsEnabled',
    callsConfig,
    (config) => config.EnableRecordings,
);

export const recordingMaxDuration: (state: GlobalState) => number = createSelector(
    'recordingMaxDuration',
    callsConfig,
    (config) => config.MaxRecordingDuration,
);

export const endCallModal = (state: GlobalState) => {
    return pluginState(state).endCallModal;
};

//
// Selectors for Cloud and beta limits:
//
const cloudSku: (state: GlobalState) => string = createSelector(
    'cloudSku',
    callsConfig,
    (config) => config.sku_short_name,
);

export const isCloud: (state: GlobalState) => boolean = createSelector(
    'isCloud',
    getLicense,
    (license) => license?.Cloud === 'true',
);

export const isCloudStarter: (state: GlobalState) => boolean = createSelector(
    'isCloudStarter',
    isCloud,
    cloudSku,
    (cloud, sku) => cloud && sku === LicenseSkus.Starter,
);

export const isCloudProfessional: (state: GlobalState) => boolean = createSelector(
    'isCloudProfessional',
    isCloud,
    cloudSku,
    (cloud, sku) => cloud && sku === LicenseSkus.Professional,
);

export const isCloudEnterprise: (state: GlobalState) => boolean = createSelector(
    'isCloudEnterprise',
    isCloud,
    cloudSku,
    (cloud, sku) => cloud && sku === LicenseSkus.Enterprise,
);

const getSubscription = (state: GlobalState) => {
    return state.entities.cloud.subscription;
};

export const isCloudTrial: (state: GlobalState) => boolean = createSelector(
    'isCloudTrial',
    getSubscription,
    (subscription) => {
        return subscription?.is_free_trial === 'true';
    },
);

export const isCloudProfessionalOrEnterpriseOrTrial: (state: GlobalState) => boolean = createSelector(
    'isCloudProfessionalOrEnterprise',
    isCloudProfessional,
    isCloudEnterprise,
    isCloudTrial,
    (isProf, isEnt, isTrial) => isProf || isEnt || isTrial,
);

// isCloudFeatureRestricted means: are you restricted from making a call because of your subscription?
export const isCloudFeatureRestricted: (state: GlobalState) => boolean = createSelector(
    'isCloudFeatureRestricted',
    isCloudStarter,
    isCloudTrial,
    getCurrentChannel,
    (isStarter, isTrial, channel) => isStarter && !isTrial && !isDMChannel(channel),
);

export const isCloudTrialCompleted: (state: GlobalState) => boolean = createSelector(
    'isCompletedCloudTrial',
    getSubscription,
    (subscription) => {
        return subscription?.is_free_trial === 'false' && subscription?.trial_end_at > 0;
    },
);

export const isCloudTrialNeverStarted: (state: GlobalState) => boolean = createSelector(
    'isCloudTrial',
    getSubscription,
    (subscription) => {
        return subscription?.trial_end_at === 0;
    },
);

export const channelState = (state: GlobalState, channelID: string) => pluginState(state).channelState[channelID];

export const callsEnabled = (state: GlobalState, channelID: string) => Boolean(channelState(state, channelID)?.enabled);

export const callsUserPreferences = (state: GlobalState): CallsUserPreferences => {
    return pluginState(state).callsUserPreferences;
};

export const shouldPlayJoinUserSound: (state: GlobalState) => boolean = createSelector(
    'shouldPlayJoinUserSound',
    numUsersInConnectedChannel,
    callsUserPreferences,
    (numUsers, preferences) => {
        return numUsers < preferences.joinSoundParticipantsThreshold;
    },
);

export const getClientError = (state: GlobalState) => pluginState(state).clientErr;

export const isOnPremNotEnterprise: (state: GlobalState) => boolean = createSelector(
    'isOnPremNotEnterprise',
    isCloud,
    getLicense,
    (cloud, license) => {
        const enterprise = license.SkuShortName === LicenseSkus.E20 || license.SkuShortName === LicenseSkus.Enterprise;
        return !cloud && !enterprise;
    },
);

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

export function makeIdToObject<HasId extends { id: string }>(arr: HasId[]) {
    return arr.reduce((acc: { [id: string]: HasId }, e) => {
        acc[e.id] = e;
        return acc;
    }, {});
}
