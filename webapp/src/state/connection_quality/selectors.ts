// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {Channel} from '@mattermost/types/channels';
import {GlobalState} from '@mattermost/types/store';
import {createSelector} from 'reselect';
import {RootState} from 'src/reducers';
import {channelIDForCurrentCall, pluginReduxStore} from 'src/state/root_selectors';

import {ConnectionState} from './reducer';

const connectionQualityForCalls = (state: GlobalState): RootState['connectionQuality'] => {
    return pluginReduxStore(state).connectionQuality;
};

// Only sessions with a degraded connection are listed; any other session's connection is good.
export const degradedConnectionsForCurrentCall: (state: GlobalState) => RootState['connectionQuality'][Channel['id']] =
    createSelector(
        connectionQualityForCalls,
        channelIDForCurrentCall,
        (connections, channelID) => connections[channelID] || {},
    );

export const connectionStateForSession = (state: GlobalState, sessionID: string): ConnectionState => {
    return degradedConnectionsForCurrentCall(state)[sessionID] ?? 'good';
};
