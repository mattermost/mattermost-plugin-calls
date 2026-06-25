// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {Channel} from '@mattermost/types/channels';
import {GlobalState} from '@mattermost/types/store';
import {getCurrentChannelId} from 'mattermost-redux/selectors/entities/common';
import {getPluginStore} from 'src/state/common_selectors';

export const getHostID = (state: GlobalState, channelID: Channel['id']) => {
    return getPluginStore(state).hosts[channelID]?.hostID;
};

export const getHostChangeAt = (state: GlobalState, channelID: Channel['id']) => {
    return getPluginStore(state).hosts[channelID]?.hostChangeAt;
};

export const getHostForCurrentCall = (state: GlobalState) => {
    const currentChannelID = getCurrentChannelId(state);
    return getPluginStore(state).hosts[currentChannelID];
};

export const getHostIDForCurrentChannel = (state: GlobalState) => {
    return getHostForCurrentCall(state)?.hostID;
};

export const getHostChangeAtForCurrentChannel = (state: GlobalState) => {
    return getHostForCurrentCall(state)?.hostChangeAt;
};
