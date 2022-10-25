import {getCurrentChannel, getCurrentChannelId} from 'mattermost-redux/selectors/entities/channels';
import {GlobalState} from '@mattermost/types/store';

import {getCurrentUserId, getUsers, getUserIdsInChannels} from 'mattermost-redux/selectors/entities/users';
import {getTeammateNameDisplaySetting} from 'mattermost-redux/selectors/entities/preferences';
import {getLicense} from 'mattermost-redux/selectors/entities/general';
import {createSelector} from 'reselect';

import {LicenseSkus} from '@mattermost/types/general';
import {Channel} from '@mattermost/types/channels';

import {getGroupDisplayNameFromUserIds, getUserIdFromChannelName, isDirectChannel, isGroupChannel} from 'mattermost-redux/utils/channel_utils';

import {displayUsername} from 'mattermost-redux/utils/user_utils';

import {getChannelURL, isDMChannel} from 'src/utils';

import {CallsConfig, CallsUserPreferences} from 'src/types/types';

import {pluginId} from './manifest';

//@ts-ignore GlobalState is not complete
const getPluginState = (state: GlobalState) => state['plugins-' + pluginId] || {};

export const voiceConnectedChannels = (state: GlobalState) => getPluginState(state).voiceConnectedChannels;
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

export const connectedChannelID = (state: GlobalState) => getPluginState(state).connectedChannelID;

const numUsersInConnectedChannel: (state: GlobalState) => number = createSelector(
    'numUsersInConnectedChannel',
    connectedChannelID,
    voiceConnectedChannels,
    (channelID, channels) => channels[channelID]?.length || 0,
);

export const voiceConnectedProfiles = (state: GlobalState) => {
    if (!getPluginState(state).voiceConnectedProfiles) {
        return [];
    }
    return getPluginState(state).voiceConnectedProfiles[connectedChannelID(state)] || [];
};

export const voiceConnectedProfilesInChannel = (state: GlobalState, channelID: string) => {
    if (!getPluginState(state).voiceConnectedProfiles) {
        return [];
    }
    return getPluginState(state).voiceConnectedProfiles[channelID] || [];
};

export const voiceUsersStatuses = (state: GlobalState) => {
    return getPluginState(state).voiceUsersStatuses[connectedChannelID(state)] || {};
};

export const voiceChannelCallStartAt = (state: GlobalState, channelID: string) => {
    return getPluginState(state).voiceChannelCalls[channelID]?.startAt;
};

export const voiceChannelCallOwnerID = (state: GlobalState, channelID: string) => {
    return getPluginState(state).voiceChannelCalls[channelID]?.ownerID;
};

export const voiceChannelScreenSharingID = (state: GlobalState, channelID: string) => {
    return getPluginState(state).voiceChannelScreenSharingID[channelID];
};

export const expandedView = (state: GlobalState) => {
    return getPluginState(state).expandedView;
};

export const switchCallModal = (state: GlobalState) => {
    return getPluginState(state).switchCallModal;
};

export const screenSourceModal = (state: GlobalState) => {
    return getPluginState(state).screenSourceModal;
};

export const voiceChannelRootPost = (state: GlobalState, channelID: string) => {
    return getPluginState(state).voiceChannelRootPost[channelID];
};

const callsConfig = (state: GlobalState): CallsConfig => {
    return getPluginState(state).callsConfig;
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
    'maxParticipants',
    callsConfig,
    (config) => config.NeedsTURNCredentials,
);

export const isLimitRestricted: (state: GlobalState) => boolean = createSelector(
    'isLimitRestricted',
    numCurrentVoiceConnectedUsers,
    maxParticipants,
    (numCurrentUsers, max) => max > 0 && numCurrentUsers >= max,
);

export const endCallModal = (state: GlobalState) => {
    return getPluginState(state).endCallModal;
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

export const channelState = (state: GlobalState, channelID: string) => getPluginState(state).channelState[channelID];

export const callsEnabled = (state: GlobalState, channelID: string) => Boolean(channelState(state, channelID)?.enabled);

export const callsUserPreferences = (state: GlobalState): CallsUserPreferences => {
    return getPluginState(state).callsUserPreferences;
};

export const shouldPlayJoinUserSound: (state: GlobalState) => boolean = createSelector(
    'shouldPlayJoinUserSound',
    numUsersInConnectedChannel,
    callsUserPreferences,
    (numUsers, preferences) => {
        return numUsers < preferences.joinSoundParticipantsThreshold;
    },
);

export const getClientError = (state: GlobalState) => getPluginState(state).clientErr;

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
            const userIdsInChannel = getUserIdsInChannels(state)[channel.id];
            channelDisplayName = getGroupDisplayNameFromUserIds(userIdsInChannel, users, currentUserID, teammateNameDisplaySetting);
        } else {
            channelDisplayName = channel.display_name;
        }
    }
    return {channelURL, channelDisplayName};
};
