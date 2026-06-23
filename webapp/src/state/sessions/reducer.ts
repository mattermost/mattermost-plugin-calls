// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {type UserSessionState} from '@mattermost/calls-common/lib/types';
import {type Channel} from '@mattermost/types/channels';
import {type Reducer} from 'redux';
import {CALL_ENDED, UN_INITIALIZED} from 'src/state/common_action_types';

import {
    SESSIONS_RECEIVED,
    USER_HAND_LOWERED,
    USER_HAND_RAISED,
    USER_JOINED,
    USER_LEFT,
    USER_MUTED,
    USER_REACTED,
    USER_REACTED_TIMEOUT,
    USER_UNMUTED,
    USERS_VOICE_ACTIVITY_CHANGED,
} from './action_types';
import {type Actions} from './actions';

type State = {
    [channelID: Channel['id']]: {
        [session_id: UserSessionState['session_id']]: UserSessionState;
    }
}

const emptyState: State = {};

export const reducer: Reducer<State, Actions> = (initialState = emptyState, action) : State => {
    switch (action.type) {
    case UN_INITIALIZED: {
        return emptyState;
    }

    case SESSIONS_RECEIVED: {
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

    case USER_MUTED: {
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

    case USER_UNMUTED: {
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

    case USER_HAND_RAISED: {
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
                    raised_hand: action.data.raised_hand,
                },
            },
        };
    }

    case USER_HAND_LOWERED: {
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
                    raised_hand: 0,
                },
            },
        };
    }

    case USER_REACTED: {
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
                    reaction: action.data.reaction,
                },
            },
        };
    }

    case USER_REACTED_TIMEOUT: {
        const allSessions = initialState[action.data.channelID];
        const currentSession = allSessions?.[action.data.session_id];

        // Only clear if the timing-out reaction is still the one displayed — a newer
        // reaction within the window must not be cleared by an older reaction's timeout.
        if (!currentSession || currentSession.reaction?.timestamp !== action.data.reaction.timestamp) {
            return initialState;
        }

        return {
            ...initialState,
            [action.data.channelID]: {
                ...allSessions,
                [action.data.session_id]: {
                    ...currentSession,
                    reaction: undefined,
                },
            },
        };
    }

    case USER_LEFT: {
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