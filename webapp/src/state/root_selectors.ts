// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {GlobalState} from '@mattermost/types/store';
import {pluginId} from 'src/manifest';
import {initialRootState, RootState} from 'src/reducers';
import {getCallsClientChannelID} from 'src/utils';

const pluginReduxStateKey = `plugins-${pluginId}`;

export const pluginReduxStore = (state: GlobalState): RootState =>
    (state[pluginReduxStateKey as keyof GlobalState] as unknown as RootState) ?? initialRootState;

// Not memoised: getCallsClientChannelID reads window.callsClient, which is outside the store and so
// invisible to reselect's input comparison. A stale value here would propagate to every selector
// keyed on the current call.
export const channelIDForCurrentCall = (state: GlobalState): string =>
    getCallsClientChannelID() || pluginReduxStore(state).clientStateReducer?.channelID || '';
