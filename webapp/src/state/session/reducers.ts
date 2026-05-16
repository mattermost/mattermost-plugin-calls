// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {UserSessionState} from '@mattermost/calls-common/lib/types';
import {Channel} from '@mattermost/types/channels';
import {Reducer} from 'redux';

import {
    CALL_ENDED,
    SESSIONS_RECEIVED,
    UN_INITIALIZED,
    USER_JOINED,
    USER_LEFT,
    USER_MUTED,
    USER_UNMUTED,
    USERS_VOICE_ACTIVITY_CHANGED,
} from './action_types';
import {Actions} from './actions';

type State = {
    [channelID: Channel['id']]: {
        [session_id: string]: UserSessionState;
    }
}

const emptyState: State = {};

export const sessionsReducer: Reducer<State, Actions> = (initialState = emptyState, action) : State => {
    switch (action.type) {
    case UN_INITIALIZED:{
        return emptyState;
    }

    case SESSIONS_RECEIVED:{
        return {
            ...initialState,
            [action.data.channelID]: action.data.sessions,
        };
    }

    case USER_JOINED: {
        return {
            ...initialState,
            [action.data.channelID]: {
                ...initialState[action.data.channelID],
                [action.data.session_id]: {
                    session_id: action.data.session_id,
                    user_id: action.data.userID,
                    unmuted: false,
                    voice: false,
                    video: false,
                    raised_hand: 0,
                },
            },
        };
    }

    case USERS_VOICE_ACTIVITY_CHANGED: {
        const allSessions = initialState[action.data.channelID];

        if (!allSessions) {
            return initialState;
        }

        // With this flag we avoid creating a new state object if no changes are made
        let stateChanged = false;

        const nextState: State[Channel['id']] = {};

        // Walk every session in the channel — sessions present in the active-speakers list
        // get voice: true, sessions absent from it get voice: false.
        for (const sessionID of Object.keys(allSessions)) {
            const currentSession = allSessions[sessionID];
            const isSessionInActiveSpeakersList = action.data.session_ids.includes(sessionID);

            // If the voice flag already matches the new speaking state, reuse the existing session object reference.
            if (currentSession.voice === isSessionInActiveSpeakersList) {
                nextState[sessionID] = currentSession;
            } else {
                // Else, voice flag flipped — create a new session object with the updated value.
                nextState[sessionID] = {...currentSession, voice: isSessionInActiveSpeakersList};
                stateChanged = true;
            }
        }

        if (!stateChanged) {
            return initialState;
        }

        return {
            ...initialState,
            [action.data.channelID]: nextState,
        };
    }

    case USER_MUTED:{
        const allSessions = initialState[action.data.channelID];
        const currentSession = allSessions?.[action.data.session_id];

        if (!currentSession) {
            return initialState;
        }

        return {
            ...initialState,
            [action.data.channelID]: {
                ...allSessions,
                [action.data.session_id]: {
                    ...currentSession,
                    unmuted: false,
                },
            },
        };
    }

    case USER_UNMUTED:{
        const allSessions = initialState[action.data.channelID];
        const currentSession = allSessions?.[action.data.session_id];

        if (!currentSession) {
            return initialState;
        }

        return {
            ...initialState,
            [action.data.channelID]: {
                ...allSessions,
                [action.data.session_id]: {
                    ...currentSession,
                    unmuted: true,
                },
            },
        };
    }

    case USER_LEFT:{
        if (!initialState[action.data.channelID]?.[action.data.session_id]) {
            return initialState;
        }

        const nextChannelSessions = {...initialState[action.data.channelID]};
        delete nextChannelSessions[action.data.session_id];

        return {
            ...initialState,
            [action.data.channelID]: nextChannelSessions,
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