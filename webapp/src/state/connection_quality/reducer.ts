// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {UserSessionState} from '@mattermost/calls-common/lib/types';
import {Channel} from '@mattermost/types/channels';
import {Reducer} from 'redux';
import {CONNECTION_QUALITY} from 'src/clients/call/constants';
import {CALL_END, LOCAL_SESSION_CLOSE, UN_INITIALIZED, USER_LEFT} from 'src/state/session/action_types';

import {LOCAL_SESSION_RECONNECTED, LOCAL_SESSION_RECONNECTING, SESSION_CONNECTION_QUALITY_CHANGED} from './action_types';
import {Actions} from './actions';

export type ConnectionState = 'good' | 'poor' | 'reconnecting';

// Sessions with a good connection are left out, so only degraded ones are stored.
type DegradedConnectionState = Exclude<ConnectionState, 'good'>;

type State = {
    [channelID: Channel['id']]: {
        [sessionID: UserSessionState['session_id']]: DegradedConnectionState;
    };
}

const emptyState: State = {};

// Unknown means LiveKit has no measurement yet, so it leaves the stored state as it is.
const CONNECTION_STATES: Record<CONNECTION_QUALITY, ConnectionState | null> = {
    [CONNECTION_QUALITY.Excellent]: 'good',
    [CONNECTION_QUALITY.Good]: 'good',
    [CONNECTION_QUALITY.Poor]: 'poor',
    [CONNECTION_QUALITY.Lost]: 'reconnecting',
    [CONNECTION_QUALITY.Unknown]: null,
};

const setSession = (state: State, channelID: Channel['id'], sessionID: UserSessionState['session_id'], connection: DegradedConnectionState): State => {
    if (state[channelID]?.[sessionID] === connection) {
        return state;
    }

    return {
        ...state,
        [channelID]: {
            ...state[channelID],
            [sessionID]: connection,
        },
    };
};

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

const applyConnectionState = (state: State, channelID: Channel['id'], sessionID: UserSessionState['session_id'], connection: ConnectionState): State => {
    if (connection === 'good') {
        return removeSession(state, channelID, sessionID);
    }
    return setSession(state, channelID, sessionID, connection);
};

export const reducer: Reducer<State, Actions> = (initialState = emptyState, action) : State => {
    switch (action.type) {
    case UN_INITIALIZED: {
        return emptyState;
    }

    case SESSION_CONNECTION_QUALITY_CHANGED: {
        const connection = CONNECTION_STATES[action.data.quality];
        if (!connection || !action.data.channelID || !action.data.session_id) {
            return initialState;
        }
        return applyConnectionState(initialState, action.data.channelID, action.data.session_id, connection);
    }

    case LOCAL_SESSION_RECONNECTING: {
        if (!action.data.channelID || !action.data.session_id) {
            return initialState;
        }
        return setSession(initialState, action.data.channelID, action.data.session_id, 'reconnecting');
    }

    case LOCAL_SESSION_RECONNECTED:
    case USER_LEFT: {
        return removeSession(initialState, action.data.channelID, action.data.session_id);
    }

    // Connection quality only comes from LiveKit, so it goes stale once this client leaves the room.
    case LOCAL_SESSION_CLOSE:
    case CALL_END: {
        return removeChannel(initialState, action.data.channelID);
    }

    default:
        return initialState;
    }
};
