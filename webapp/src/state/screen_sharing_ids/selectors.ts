// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {UserSessionState} from '@mattermost/calls-common/lib/types';
import {GlobalState} from '@mattermost/types/store';
import {createSelector} from 'reselect';
import {RootState} from 'src/reducers';
import {channelIDForCurrentCall, pluginReduxStore} from 'src/state/root_selectors';
import {sessionsInCalls} from 'src/state/session/selectors';

const screenSharingIDsForCalls = (state: GlobalState): RootState['screenSharingIDs'] => {
    return pluginReduxStore(state).screenSharingIDs;
};

export const screenSharingSessionForCurrentCall: (state: GlobalState) => UserSessionState | undefined =
    createSelector(
        screenSharingIDsForCalls,
        channelIDForCurrentCall,
        sessionsInCalls,
        (ids, channelID, sessions) => sessions[channelID]?.[ids[channelID]],
    );
