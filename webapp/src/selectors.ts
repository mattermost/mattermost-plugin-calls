import {getCurrentUserId} from 'mattermost-redux/selectors/entities/users';
import {getCurrentChannelId} from 'mattermost-redux/selectors/entities/channels';
import {GlobalState} from 'mattermost-redux/types/store';

import {id as pluginId} from './manifest';

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
    return getPluginState(state).voiceUsersStatuses[connectedChannelID(state)];
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
