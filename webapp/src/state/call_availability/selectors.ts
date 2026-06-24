// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {Channel} from '@mattermost/types/channels';
import {GlobalState} from '@mattermost/types/store';
import {getCurrentChannelId} from 'mattermost-redux/selectors/entities/common';
import {getPluginStore} from 'src/state/common_selectors';

export const callsAvailableInChannel = (state: GlobalState, channelID: Channel['id']) =>
    getPluginStore(state).callAvailability?.[channelID]?.enabled === true;

export const callsNotAvailableInChannel = (state: GlobalState, channelID: Channel['id']) =>
    getPluginStore(state).callAvailability?.[channelID]?.enabled === false;

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
