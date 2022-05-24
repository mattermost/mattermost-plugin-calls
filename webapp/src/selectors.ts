import {getCurrentChannel, getCurrentChannelId} from 'mattermost-redux/selectors/entities/channels';
import {GlobalState} from 'mattermost-redux/types/store';

import {getLicense} from 'mattermost-redux/selectors/entities/general';
import {createSelector} from 'reselect';

import {LicenseSkus} from '@mattermost/types/general';

import {CLOUD_MAX_PARTICIPANTS} from 'src/constants';
import {isDMChannel} from 'src/utils';

import {pluginId} from './manifest';

//@ts-ignore GlobalState is not complete
const getPluginState = (state: GlobalState) => state['plugins-' + pluginId] || {};

export const isVoiceEnabled = (state: GlobalState) => getPluginState(state).isVoiceEnabled;
export const voiceConnectedChannels = (state: GlobalState) => getPluginState(state).voiceConnectedChannels;
export const voiceConnectedUsers = (state: GlobalState) => {
    const currentChannelID = getCurrentChannelId(state);
    const channels = voiceConnectedChannels(state);
    if (channels && channels[currentChannelID]) {
        return channels[currentChannelID];
    }
    return [];
};

export const voiceConnectedUsersInChannel = (state: GlobalState, channelID: string) => {
    const channels = voiceConnectedChannels(state);
    if (channels && channels[channelID]) {
        return channels[channelID];
    }
    return [];
};

export const connectedChannelID = (state: GlobalState) => getPluginState(state).connectedChannelID;

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
    return getPluginState(state).callStartAt[channelID];
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

//
// Selectors for Cloud and beta limits:
//
const cloudSku = (state: GlobalState): string => {
    return getPluginState(state).cloudInfo.sku_short_name;
};

export const retrievedCloudSku = (state: GlobalState): boolean => {
    return getPluginState(state).cloudInfo.retrieved;
};

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

export const isCloudProfessionalOrEnterprise: (state: GlobalState) => boolean = createSelector(
    'isCloudProfessionalOrEnterprise',
    isCloudProfessional,
    isCloudEnterprise,
    (isProf, isEnt) => isProf || isEnt,
);

// isCloudFeatureRestricted means: are you restricted from making a call because of your subscription?
export const isCloudFeatureRestricted: (state: GlobalState) => boolean = createSelector(
    'isCloudFeatureRestricted',
    isCloudStarter,
    getCurrentChannel,
    (isStarter, channel) => isStarter && !isDMChannel(channel),
);

// isCloudLimitRestricted means: are you restricted from joining a call because of our beta limits?
export const isCloudLimitRestricted: (state: GlobalState) => boolean = createSelector(
    'isCloudLimitRestricted',
    isCloudProfessionalOrEnterprise,
    voiceConnectedUsers,
    (isCloudPaid, users) => isCloudPaid && users.length >= CLOUD_MAX_PARTICIPANTS,
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

