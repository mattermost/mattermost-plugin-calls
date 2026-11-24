// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {UserSessionState} from '@mattermost/calls-common/lib/types';
import {Channel} from '@mattermost/types/channels';
import {Reducer} from 'redux';
import {CALL_END, LOCAL_SESSION_CLOSE, UN_INITIALIZED, USER_LEFT} from 'src/state/session/action_types';

import {USER_CAMERA_OFF, USER_CAMERA_ON} from './action_types';
import {Actions} from './actions';

type State = {
    [channelID: Channel['id']]: {
        [sessionID: UserSessionState['session_id']]: true;
    };
}

const emptyState: State = {};

const removeSession = (state: State, channelID: Channel['id'], sessionID: UserSessionState['session_id']): State => {
    const channelSessions = state[channelID];
    if (!channelSessions?.[sessionID]) {
        return state;
    }

    const nextChannelSessions = {...channelSessions};
    delete nextChannelSessions[sessionID];

    const nextState = {...state};
    if (Object.keys(nextChannelSessions).length === 0) {
        delete nextState[channelID];
    } else {
        nextState[channelID] = nextChannelSessions;
    }
    return nextState;
};

const removeChannel = (state: State, channelID: Channel['id']): State => {
    if (!state[channelID]) {
        return state;
    }

    const nextState = {...state};
    delete nextState[channelID];
    return nextState;
};

export const reducer: Reducer<State, Actions> = (initialState = emptyState, action) : State => {
    switch (action.type) {
    case UN_INITIALIZED: {
        return emptyState;
    }

    case USER_CAMERA_ON: {
        if (initialState[action.data.channelID]?.[action.data.session_id]) {
            return initialState;
        }

        return {
            ...initialState,
            [action.data.channelID]: {
                ...initialState[action.data.channelID],
                [action.data.session_id]: true,
            },
        };
    }

    case USER_CAMERA_OFF:
    case USER_LEFT: {
        return removeSession(initialState, action.data.channelID, action.data.session_id);
    }

    // Camera state only comes from LiveKit, so it goes stale once this client leaves the room.
    case LOCAL_SESSION_CLOSE:
    case CALL_END: {
        return removeChannel(initialState, action.data.channelID);
    }

    default:
        return initialState;
    }
};
