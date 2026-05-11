// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {Reaction, UserSessionState} from '@mattermost/calls-common/lib/types';
import {Participant} from 'livekit-client';

import {
    CALL_END,
    UNINIT,
    USER_JOINED,
    USER_LEFT,
    USER_LOWER_HAND,
    USER_MUTED,
    USER_RAISE_HAND,
    USER_REACTED,
    USER_REACTED_TIMEOUT,
    USER_UNMUTED,
    USER_VIDEO_OFF,
    USER_VIDEO_ON,
    USER_VOICE_OFF,
    USER_VOICE_ON,
    USERS_STATES,
    USERS_VOICE_ACTIVITY_CHANGED,
} from '../action_types';

export type sessionsState = {
    [channelID: string]: {
        [sessionID: string]: UserSessionState;
    };
}

type channelActionData = {
    channelID: string;
}

type sessionActionData = channelActionData & {
    userID: string;
    session_id: string;
}

type callEndAction = {
    type: typeof CALL_END;
    data: channelActionData & {
        callID: string;
    };
}

type userJoinedAction = {
    type: typeof USER_JOINED;
    data: sessionActionData & {
        currentUserID: string;
    };
}

type userLeftAction = {
    type: typeof USER_LEFT;
    data: sessionActionData;
}

type usersStatesAction = {
    type: typeof USERS_STATES;
    data: channelActionData & {
        states: sessionsState[string];
    };
}

type sessionStateAction = {
    type:
    | typeof USER_MUTED
    | typeof USER_UNMUTED
    | typeof USER_VOICE_ON
    | typeof USER_VOICE_OFF
    | typeof USER_VIDEO_ON
    | typeof USER_VIDEO_OFF;
    data: sessionActionData;
}

type usersVoiceActivityChangedAction = {
    type: typeof USERS_VOICE_ACTIVITY_CHANGED;
    data: channelActionData & {
        user_ids: Participant['identity'][];
        session_ids: Participant['sid'][];
    };
}

type userRaisedHandAction = {
    type: typeof USER_RAISE_HAND | typeof USER_LOWER_HAND;
    data: sessionActionData & {
        raised_hand: number;
    };
}

type userReactedAction = {
    type: typeof USER_REACTED | typeof USER_REACTED_TIMEOUT;
    data: sessionActionData & {
        reaction: Reaction;
    };
}

type uninitAction = {
    type: typeof UNINIT;
}

export type sessionsAction =
    | callEndAction
    | sessionStateAction
    | uninitAction
    | userJoinedAction
    | userLeftAction
    | userRaisedHandAction
    | userReactedAction
    | usersStatesAction
    | usersVoiceActivityChangedAction

export type sessionsReactionAction = {
    type: typeof USER_LEFT | typeof USER_REACTED | typeof USER_REACTED_TIMEOUT;
    data: sessionActionData & {
        reaction?: Reaction;
    };
}
type SessionsAction =
    | ReturnType<typeof userJoined>
    | ReturnType<typeof userLeft>;

type sessionsActionWithData =
    | callEndAction
    | sessionStateAction
    | userJoinedAction
    | userLeftAction
    | userRaisedHandAction
    | userReactedAction
    | usersStatesAction
    | usersVoiceActivityChangedAction

const initialState: sessionsState = {};

const hasActionData = (action: sessionsAction): action is sessionsActionWithData => {
    return action.type !== UNINIT;
};

const getCallEndData = (action: sessionsActionWithData): callEndAction['data'] => {
    return action.data as callEndAction['data'];
};

const getSessionData = (action: sessionsActionWithData): sessionActionData => {
    return action.data as sessionActionData;
};

const getUsersStatesData = (action: sessionsActionWithData): usersStatesAction['data'] => {
    return action.data as usersStatesAction['data'];
};

const getUsersVoiceActivityChangedData = (action: sessionsActionWithData): usersVoiceActivityChangedAction['data'] => {
    return action.data as usersVoiceActivityChangedAction['data'];
};

const getUserRaisedHandData = (action: sessionsActionWithData): userRaisedHandAction['data'] => {
    return action.data as userRaisedHandAction['data'];
};

const getUserReactionData = (action: sessionsActionWithData): userReactedAction['data'] => {
    return action.data as userReactedAction['data'];
};

export const sessions = (state: sessionsState = initialState, action: sessionsAction): sessionsState => {
    if (!hasActionData(action)) {
        return {};
    }

    switch (action.type) {
    case CALL_END: {
        const data = getCallEndData(action);
        const nextState = {...state};
        delete nextState[data.channelID];
        return nextState;
    }
    case USER_JOINED: {
        const data = getSessionData(action);
        return {
            ...state,
            [data.channelID]: {
                ...state[data.channelID],
                [data.session_id]: {
                    session_id: data.session_id,
                    user_id: data.userID,
                    unmuted: false,
                    voice: false,
                    video: false,
                    raised_hand: 0,
                },
            },
        };
    }
    case USER_LEFT: {
        const data = getSessionData(action);
        if (state[data.channelID]) {
            // eslint-disable-next-line
            const {[data.session_id]: omit, ...res} = state[data.channelID];
            return {
                ...state,
                [data.channelID]: res,
            };
        }
        return state;
    }
    case USERS_STATES: {
        const data = getUsersStatesData(action);
        return {
            ...state,
            [data.channelID]: data.states,
        };
    }
    case USER_MUTED: {
        const data = getSessionData(action);
        if (!state[data.channelID]) {
            return {
                ...state,
                [data.channelID]: {
                    [data.session_id]: {
                        session_id: data.session_id,
                        user_id: data.userID,
                        unmuted: false,
                        voice: false,
                        video: false,
                        raised_hand: 0,
                    },
                },
            };
        }
        return {
            ...state,
            [data.channelID]: {
                ...state[data.channelID],
                [data.session_id]: {
                    ...state[data.channelID][data.session_id],
                    unmuted: false,
                },
            },
        };
    }
    case USER_UNMUTED: {
        const data = getSessionData(action);
        if (!state[data.channelID]) {
            return {
                ...state,
                [data.channelID]: {
                    [data.session_id]: {
                        session_id: data.session_id,
                        user_id: data.userID,
                        unmuted: true,
                        voice: false,
                        video: false,
                        raised_hand: 0,
                    },
                },
            };
        }
        return {
            ...state,
            [data.channelID]: {
                ...state[data.channelID],
                [data.session_id]: {
                    ...state[data.channelID][data.session_id],
                    unmuted: true,
                },
            },
        };
    }
    case USER_VOICE_ON: {
        const data = getSessionData(action);
        if (!state[data.channelID]) {
            return {
                ...state,
                [data.channelID]: {
                    [data.session_id]: {
                        session_id: data.session_id,
                        user_id: data.userID,
                        unmuted: false,
                        voice: true,
                        video: false,
                        raised_hand: 0,
                    },
                },
            };
        }
        return {
            ...state,
            [data.channelID]: {
                ...state[data.channelID],
                [data.session_id]: {
                    ...state[data.channelID][data.session_id],
                    voice: true,
                },
            },
        };
    }
    case USER_VOICE_OFF: {
        const data = getSessionData(action);
        if (!state[data.channelID]) {
            return {
                ...state,
                [data.channelID]: {
                    [data.session_id]: {
                        session_id: data.session_id,
                        user_id: data.userID,
                        unmuted: false,
                        voice: false,
                        video: false,
                        raised_hand: 0,
                    },
                },
            };
        }
        return {
            ...state,
            [data.channelID]: {
                ...state[data.channelID],
                [data.session_id]: {
                    ...state[data.channelID][data.session_id],
                    voice: false,
                },
            },
        };
    }
    case USERS_VOICE_ACTIVITY_CHANGED: {
        const data = getUsersVoiceActivityChangedData(action);
        const channel = state[data.channelID];
        if (!channel) {
            return state;
        }

        let stateChanged = false;
        const nextState: typeof channel = {};

        // Walk every session in the channel — sessions present in the active-speakers list
        // get voice: true, sessions absent from it get voice: false.
        for (const session_id of Object.keys(channel)) {
            const isSessionInActiveSpeakersList = data.session_ids.includes(session_id);

            // If the voice flag already matches the new speaking state, reuse the existing session object reference.
            if (channel[session_id].voice === isSessionInActiveSpeakersList) {
                nextState[session_id] = channel[session_id];
            } else {
                // Else, voice flag flipped — create a new session object with the updated value.
                nextState[session_id] = {...channel[session_id], voice: isSessionInActiveSpeakersList};
                stateChanged = true;
            }
        }

        if (!stateChanged) {
            return state;
        }

        return {
            ...state,
            [data.channelID]: nextState,
        };
    }
    case USER_RAISE_HAND: {
        const data = getUserRaisedHandData(action);
        if (!state[data.channelID]) {
            return {
                ...state,
                [data.channelID]: {
                    [data.session_id]: {
                        session_id: data.session_id,
                        user_id: data.userID,
                        unmuted: false,
                        voice: false,
                        video: false,
                        raised_hand: data.raised_hand,
                    },
                },
            };
        }
        return {
            ...state,
            [data.channelID]: {
                ...state[data.channelID],
                [data.session_id]: {
                    ...state[data.channelID][data.session_id],
                    raised_hand: data.raised_hand,
                },
            },
        };
    }
    case USER_LOWER_HAND: {
        const data = getUserRaisedHandData(action);
        if (!state[data.channelID]) {
            return {
                ...state,
                [data.channelID]: {
                    [data.session_id]: {
                        session_id: data.session_id,
                        user_id: data.userID,
                        voice: false,
                        unmuted: false,
                        video: false,
                        raised_hand: data.raised_hand,
                    },
                },
            };
        }
        return {
            ...state,
            [data.channelID]: {
                ...state[data.channelID],
                [data.session_id]: {
                    ...state[data.channelID][data.session_id],
                    raised_hand: data.raised_hand,
                },
            },
        };
    }
    case USER_REACTED: {
        const data = getUserReactionData(action);
        if (!state[data.channelID]) {
            return {
                ...state,
                [data.channelID]: {
                    [data.session_id]: {
                        session_id: data.session_id,
                        user_id: data.userID,
                        voice: false,
                        unmuted: false,
                        raised_hand: 0,
                        video: false,
                        reaction: data.reaction,
                    },
                },
            };
        }
        return {
            ...state,
            [data.channelID]: {
                ...state[data.channelID],
                [data.session_id]: {
                    ...state[data.channelID][data.session_id],
                    reaction: data.reaction,
                },
            },
        };
    }
    case USER_REACTED_TIMEOUT: {
        const data = getUserReactionData(action);
        const storedReaction = state[data.channelID]?.[data.session_id]?.reaction;
        if (!storedReaction || !data.reaction) {
            return state;
        }
        if (storedReaction.timestamp > data.reaction.timestamp) {
            return state;
        }

        // Drop the optional reaction field entirely to match UserSessionState.
        const {reaction: _reaction, ...sessionWithoutReaction} = state[data.channelID][data.session_id];
        return {
            ...state,
            [data.channelID]: {
                ...state[data.channelID],
                [data.session_id]: {
                    ...sessionWithoutReaction,
                },
            },
        };
    }
    case USER_VIDEO_ON: {
        const data = getSessionData(action);
        if (!state[data.channelID]) {
            return {
                ...state,
                [data.channelID]: {
                    [data.session_id]: {
                        session_id: data.session_id,
                        user_id: data.userID,
                        unmuted: false,
                        voice: false,
                        raised_hand: 0,
                        video: true,
                    },
                },
            };
        }
        return {
            ...state,
            [data.channelID]: {
                ...state[data.channelID],
                [data.session_id]: {
                    ...state[data.channelID][data.session_id],
                    video: true,
                },
            },
        };
    }
    case USER_VIDEO_OFF: {
        const data = getSessionData(action);
        if (!state[data.channelID]) {
            return {
                ...state,
                [data.channelID]: {
                    [data.session_id]: {
                        session_id: data.session_id,
                        user_id: data.userID,
                        unmuted: true,
                        voice: false,
                        raised_hand: 0,
                        video: false,
                    },
                },
            };
        }
        return {
            ...state,
            [data.channelID]: {
                ...state[data.channelID],
                [data.session_id]: {
                    ...state[data.channelID][data.session_id],
                    video: false,
                },
            },
        };
    }
    default:
        return state;
    }
};
