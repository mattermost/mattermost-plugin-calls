// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {type UserSessionState} from '@mattermost/calls-common/lib/types';
import {type Reducer} from 'redux';
import {CALL_ENDED, UN_INITIALIZED} from 'src/state/common_action_types';
import {USER_LEFT} from 'src/state/sessions/action_types';

import {USER_SCREEN_OFF, USER_SCREEN_ON} from './action_types';
import {type Actions} from './actions';

type ScreenSharingIDs = {
    [channelID: string]: UserSessionState['session_id'];
}

const emptyState: ScreenSharingIDs = {};

export const reducer: Reducer<ScreenSharingIDs, Actions> = (initialState = emptyState, action) : ScreenSharingIDs => {
    switch (action.type) {
    case UN_INITIALIZED:{
        return emptyState;
    }

    case USER_SCREEN_ON:{
        return {
            ...initialState,
            [action.data.channelID]: action.data.session_id,
        };
    }

    case USER_SCREEN_OFF: {
        const currentScreenSharerSessionID = initialState[action.data.channelID];
        if (!currentScreenSharerSessionID) {
            return initialState;
        }

        if (action.data.session_id !== currentScreenSharerSessionID) {
            return initialState;
        }

        const nextState = {...initialState};
        delete nextState[action.data.channelID];
        return nextState;
    }

    case USER_LEFT: {
        const currentScreenSharerSessionID = initialState[action.data.channelID];
        if (!currentScreenSharerSessionID) {
            return initialState;
        }

        // If the user who disconnected was not the sharer, keep state.
        if (action.data.session_id !== currentScreenSharerSessionID) {
            return initialState;
        }

        // If the user who disconnected was the one sharing, clear it.
        const nextState = {...initialState};
        delete nextState[action.data.channelID];
        return nextState;
    }

    case CALL_ENDED: {
        const nextState = {...initialState};
        delete nextState[action.data.channelID];

        return nextState;
    }

    default:
        return initialState;
    }
};
