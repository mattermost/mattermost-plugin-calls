// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {Channel} from '@mattermost/types/channels';
import {GlobalState} from '@mattermost/types/store';
import {getChannel, getCurrentChannelId, getMyChannelMemberships} from 'mattermost-redux/selectors/entities/channels';
import {getMyChannelRoles, getMyTeamRoles} from 'mattermost-redux/selectors/entities/roles';
import {isCurrentUserSystemAdmin} from 'mattermost-redux/selectors/entities/users';
import {isDirectChannel, isGroupChannel} from 'mattermost-redux/utils/channel_utils';
import {defaultEnabled} from 'src/selectors';
import {getPluginStore} from 'src/state/common_selectors';

export const callsAvailableInChannel = (state: GlobalState, channelID: Channel['id']) =>
    getPluginStore(state).callsAvailability?.[channelID]?.enabled === true;

export const callsNotAvailableInChannel = (state: GlobalState, channelID: Channel['id']) =>
    getPluginStore(state).callsAvailability?.[channelID]?.enabled === false;

export const callsAvailableInChannelWithDefault = (state: GlobalState, channelID: Channel['id']): boolean => {
    if (callsNotAvailableInChannel(state, channelID)) {
        return false;
    }

    const callsDefaultEnabled = getPluginStore(state).callsConfig?.DefaultEnabled === true;
    return callsAvailableInChannel(state, channelID) || callsDefaultEnabled;
};

export const callsAvailableInCurrentChannelWithDefault = (state: GlobalState): boolean => {
    const currentChannelID = getCurrentChannelId(state);
    return callsAvailableInChannelWithDefault(state, currentChannelID);
};

/**
 * Shows the calls button unless the channel has been explicitly disabled.
 * Channels enabled by the default config may not have a per-channel availability record in Store.
 */
export const shouldShowCallsButtonInChannelHeader = (state: GlobalState, channelId?: Channel['id']) =>
    !callsNotAvailableInChannel(state, channelId || '');

export const hasPermissionToRenderCallsButtonInChannelHeader = (state: GlobalState, channelId: Channel['id']) => {
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
    const channelMemberships = getMyChannelMemberships(state)[channelId];

    return (isDirectChannel(channel) || isGroupChannel(channel)) ||
        channelMemberships?.scheme_admin === true ||
        channelRoles[channel.id]?.has('channel_admin') ||
        teamRoles.has('team_admin');
};

