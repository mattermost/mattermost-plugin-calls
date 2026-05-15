// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {UserSessionState} from '@mattermost/calls-common/lib/types';
import {Reducer} from 'redux';
import {CALL_ENDED, UN_INITIALIZED, USER_LEFT} from 'src/state/session/action_types';

import {USER_SCREEN_OFF, USER_SCREEN_ON} from './action_types';
import {Actions} from './actions';

type State = {
    [channelID: string]: UserSessionState['session_id'];
}

const emptyState: State = {};

export const reducer: Reducer<State, Actions> = (initialState = emptyState, action) : State => {
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
        if (action.data.session_id !== initialState[action.data.channelID]) {
            return initialState;
        }

        return {
            ...initialState,
            [action.data.channelID]: '',
        };
    }

    case USER_LEFT: {
        // If the user who disconnected was the one sharing, clear it.
        // Otherwise keep state — they weren't the sharer.
        if (action.data.session_id !== initialState[action.data.channelID]) {
            return initialState;
        }

        return {
            ...initialState,
            [action.data.channelID]: '',
        };
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