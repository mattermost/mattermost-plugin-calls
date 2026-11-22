// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {Channel} from '@mattermost/types/channels';
import {GlobalState} from '@mattermost/types/store';
import {createSelector} from 'reselect';
import {RootState} from 'src/reducers';
import {channelIDForCurrentCall, pluginReduxStore} from 'src/selectors';

const cameraOnIDsForCalls = (state: GlobalState): RootState['cameraOnIDs'] => {
    return pluginReduxStore(state).cameraOnIDs;
};

export const cameraOnIdsForCurrentCall: (state: GlobalState) => RootState['cameraOnIDs'][Channel['id']] =
    createSelector(
        cameraOnIDsForCalls,
        channelIDForCurrentCall,
        (ids, channelID) => ids[channelID] || {},
    );

export const isCameraOnForSession = (state: GlobalState, sessionID: string): boolean => {
    return Boolean(cameraOnIdsForCurrentCall(state)[sessionID]);
};
