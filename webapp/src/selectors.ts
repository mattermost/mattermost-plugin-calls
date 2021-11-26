
import {getCurrentUserId} from 'mattermost-redux/selectors/entities/users';
import {getCurrentChannelId} from 'mattermost-redux/selectors/entities/channels';

import {id as pluginId} from './manifest';

const getPluginState = (state) => state['plugins-' + pluginId] || {};

export const isVoiceEnabled = (state) => getPluginState(state).isVoiceEnabled;
export const voiceConnectedChannels = (state) => getPluginState(state).voiceConnectedChannels;
export const voiceConnectedUsers = (state) => {
    const currentChannelID = getCurrentChannelId(state);
    const channels = voiceConnectedChannels(state);
    if (channels && channels[currentChannelID]) {
        return channels[currentChannelID];
    }
    return [];
};

export const connectedChannelID = (state) => getPluginState(state).connectedChannelID;

export const voiceConnectedProfiles = (state) => {
    if (!getPluginState(state).voiceConnectedProfiles) {
        return [];
    }
    return getPluginState(state).voiceConnectedProfiles[connectedChannelID(state)] || [];
};

export const voiceUsersStatuses = (state) => {
    return getPluginState(state).voiceUsersStatuses[connectedChannelID(state)];
};
