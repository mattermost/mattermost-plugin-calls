/* eslint-disable max-lines */
import {CallRecordingState, CallsConfig, Reaction, UserState} from '@calls/common/lib/types';
import {UserProfile} from '@mattermost/types/users';
import {combineReducers} from 'redux';

import {MAX_NUM_REACTIONS_IN_REACTION_STREAM} from 'src/constants';
import {
    CallsConfigDefault,
    CallsUserPreferences,
    CallsUserPreferencesDefault,
    ChannelState,
    ChannelType,
    IncomingCallNotification,
} from 'src/types/types';

import {
    DESKTOP_WIDGET_CONNECTED,
    HIDE_END_CALL_MODAL,
    HIDE_EXPANDED_VIEW,
    HIDE_SCREEN_SOURCE_MODAL,
    HIDE_SWITCH_CALL_MODAL,
    RECEIVED_CALLS_CONFIG,
    RECEIVED_CALLS_USER_PREFERENCES,
    RECEIVED_CHANNEL_STATE,
    SHOW_END_CALL_MODAL,
    SHOW_EXPANDED_VIEW,
    SHOW_SCREEN_SOURCE_MODAL,
    SHOW_SWITCH_CALL_MODAL,
    CALL_END,
    CALL_REC_PROMPT_DISMISSED,
    CALL_RECORDING_STATE,
    CALL_STATE,
    CALL_HOST,
    PROFILE_CONNECTED,
    PROFILES_CONNECTED,
    UNINIT,
    USER_CONNECTED,
    USER_DISCONNECTED,
    USER_MUTED,
    USER_RAISE_HAND,
    USER_REACTED,
    USER_REACTED_TIMEOUT,
    USER_SCREEN_OFF,
    USER_SCREEN_ON,
    USER_UNMUTED,
    USER_UNRAISE_HAND,
    USER_VOICE_OFF,
    USER_VOICE_ON,
    USERS_CONNECTED,
    USERS_CONNECTED_STATES,
    USER_JOINED_TIMEOUT,
    RECORDINGS_ENABLED,
    ADD_INCOMING_CALL,
    REMOVE_INCOMING_CALL,
    DID_RING_FOR_CALL,
    RTCD_ENABLED,
    DID_NOTIFY_FOR_CALL,
    RINGING_FOR_CALL,
    DISMISS_CALL,
} from './action_types';

type channelsState = {
    [channelID: string]: ChannelState;
}

type channelsStateAction = {
    type: string;
    data: ChannelState;
}

const channels = (state: channelsState = {}, action: channelsStateAction) => {
    switch (action.type) {
    case RECEIVED_CHANNEL_STATE:
        return {
            ...state,
            [action.data.id]: action.data,
        };
    default:
        return state;
    }
};

type profilesState = {
    [channelID: string]: UserProfile[],
}

type profilesAction = {
    type: string;
    data: {
        channelID: string;
        userID?: string;
        profile?: UserProfile;
        profiles?: UserProfile[];
    };
}

// Profiles (as in whole User objects) connected to calls.
const profiles = (state: profilesState = {}, action: profilesAction) => {
    switch (action.type) {
    case UNINIT:
        return {};
    case PROFILES_CONNECTED:
        return {
            ...state,
            [action.data.channelID]: action.data.profiles,
        };
    case PROFILE_CONNECTED:
        if (!state[action.data.channelID]) {
            return {
                ...state,
                [action.data.channelID]: [action.data.profile],
            };
        }

        // avoid duplicates
        for (const profile of state[action.data.channelID]) {
            if (profile.id === action.data.profile?.id) {
                return state;
            }
        }
        return {
            ...state,
            [action.data.channelID]: [
                ...state[action.data.channelID],
                action.data.profile,
            ],
        };
    case USER_DISCONNECTED:
        return {
            ...state,
            [action.data.channelID]: state[action.data.channelID]?.filter((val) => val.id !== action.data.userID),
        };
    case CALL_END:
        return {
            ...state,
            [action.data.channelID]: [],
        };
    default:
        return state;
    }
};

export type usersState = {
    [channelID: string]: string[];
}

type usersAction = {
    type: string;
    data: {
        channelID: string;
        userID?: string;
        users?: string[];
    };
}

const users = (state: usersState = {}, action: usersAction) => {
    switch (action.type) {
    case UNINIT:
        return {};
    case USER_CONNECTED:
        if (!state[action.data.channelID]) {
            return {
                ...state,
                [action.data.channelID]: [action.data.userID],
            };
        }
        return {
            ...state,
            [action.data.channelID]: [
                ...state[action.data.channelID],
                action.data.userID,
            ],
        };
    case USER_DISCONNECTED:
        return {
            ...state,
            [action.data.channelID]: state[action.data.channelID]?.filter((val) => val !== action.data.userID),
        };
    case USERS_CONNECTED:
        return {
            ...state,
            [action.data.channelID]: action.data.users,
        };
    case CALL_END:
        return {
            ...state,
            [action.data.channelID]: [],
        };
    default:
        return state;
    }
};

type channelIDState = string | null;

type channelIDAction = {
    type: string;
    data: {
        channelID: string;
        currentUserID: string;
        userID: string;
    };
}

// channelID is the channel ID of the call the current user is connected to.
const channelID = (state: channelIDState = null, action: channelIDAction) => {
    switch (action.type) {
    case UNINIT:
        return null;
    case DESKTOP_WIDGET_CONNECTED:
        return action.data.channelID;
    case USER_CONNECTED: {
        const callsClient = window.callsClient || window.opener?.callsClient;
        if (action.data.currentUserID === action.data.userID && callsClient?.channelID === action.data.channelID) {
            return action.data.channelID;
        }
        return state;
    }
    case USER_DISCONNECTED:
        if (action.data.currentUserID === action.data.userID && state === action.data.channelID) {
            return null;
        }
        return state;
    case CALL_END:
        if (state === action.data.channelID) {
            return null;
        }
        return state;
    default:
        return state;
    }
};

export type usersStatusesState = {
    [channelID: string]: {
        [userID: string]: UserState;
    };
}

type usersStatusesAction = {
    type: string;
    data: {
        channelID: string;
        userID: string;
        raised_hand?: number;
        reaction?: Reaction;
        states: { [userID: string]: UserState };
    };
}

const usersStatuses = (state: usersStatusesState = {}, action: usersStatusesAction) => {
    switch (action.type) {
    case UNINIT:
        return {};
    case USER_CONNECTED:
        if (state[action.data.channelID]) {
            return {
                ...state,
                [action.data.channelID]: {
                    ...state[action.data.channelID],
                    [action.data.userID]: {
                        id: action.data.userID,
                        unmuted: false,
                        voice: false,
                        raised_hand: 0,
                    },
                },
            };
        }
        return state;
    case USER_DISCONNECTED:
        if (state[action.data.channelID]) {
            // eslint-disable-next-line
            const {[action.data.userID]: omit, ...res} = state[action.data.channelID];
            return {
                ...state,
                [action.data.channelID]: res,
            };
        }
        return state;
    case USERS_CONNECTED_STATES:
        return {
            ...state,
            [action.data.channelID]: action.data.states,
        };
    case USER_MUTED:
        if (!state[action.data.channelID]) {
            return {
                ...state,
                [action.data.channelID]: {
                    [action.data.userID]: {
                        id: action.data.userID,
                        unmuted: false,
                        voice: false,
                        raised_hand: 0,
                    },
                },
            };
        }
        return {
            ...state,
            [action.data.channelID]: {
                ...state[action.data.channelID],
                [action.data.userID]: {
                    ...state[action.data.channelID][action.data.userID],
                    unmuted: false,
                },
            },
        };
    case USER_UNMUTED:
        if (!state[action.data.channelID]) {
            return {
                ...state,
                [action.data.channelID]: {
                    [action.data.userID]: {
                        id: action.data.userID,
                        unmuted: true,
                        voice: false,
                        raised_hand: 0,
                    },
                },
            };
        }
        return {
            ...state,
            [action.data.channelID]: {
                ...state[action.data.channelID],
                [action.data.userID]: {
                    ...state[action.data.channelID][action.data.userID],
                    unmuted: true,
                },
            },
        };
    case USER_VOICE_ON:
        if (!state[action.data.channelID]) {
            return {
                ...state,
                [action.data.channelID]: {
                    [action.data.userID]: {
                        id: action.data.userID,
                        unmuted: false,
                        voice: true,
                        raised_hand: 0,
                    },
                },
            };
        }
        return {
            ...state,
            [action.data.channelID]: {
                ...state[action.data.channelID],
                [action.data.userID]: {
                    ...state[action.data.channelID][action.data.userID],
                    voice: true,
                },
            },
        };
    case USER_VOICE_OFF:
        if (!state[action.data.channelID]) {
            return {
                ...state,
                [action.data.channelID]: {
                    [action.data.userID]: {
                        id: action.data.userID,
                        unmuted: false,
                        voice: false,
                        raised_hand: 0,
                    },
                },
            };
        }
        return {
            ...state,
            [action.data.channelID]: {
                ...state[action.data.channelID],
                [action.data.userID]: {
                    ...state[action.data.channelID][action.data.userID],
                    voice: false,
                },
            },
        };
    case USER_RAISE_HAND:
        if (!state[action.data.channelID]) {
            return {
                ...state,
                [action.data.channelID]: {
                    [action.data.userID]: {
                        id: action.data.userID,
                        unmuted: false,
                        voice: false,
                        raised_hand: action.data.raised_hand,
                    },
                },
            };
        }
        return {
            ...state,
            [action.data.channelID]: {
                ...state[action.data.channelID],
                [action.data.userID]: {
                    ...state[action.data.channelID][action.data.userID],
                    raised_hand: action.data.raised_hand,
                },
            },
        };
    case USER_UNRAISE_HAND:
        if (!state[action.data.channelID]) {
            return {
                ...state,
                [action.data.channelID]: {
                    [action.data.userID]: {
                        id: action.data.userID,
                        voice: false,
                        unmuted: false,
                        raised_hand: action.data.raised_hand,
                    },
                },
            };
        }
        return {
            ...state,
            [action.data.channelID]: {
                ...state[action.data.channelID],
                [action.data.userID]: {
                    ...state[action.data.channelID][action.data.userID],
                    raised_hand: action.data.raised_hand,
                },
            },
        };
    case USER_REACTED:
        if (!state[action.data.channelID]) {
            return {
                ...state,
                [action.data.channelID]: {
                    [action.data.userID]: {
                        id: action.data.userID,
                        voice: false,
                        unmuted: false,
                        raised_hand: 0,
                        reaction: action.data.reaction,
                    },
                },
            };
        }
        return {
            ...state,
            [action.data.channelID]: {
                ...state[action.data.channelID],
                [action.data.userID]: {
                    ...state[action.data.channelID][action.data.userID],
                    reaction: action.data.reaction,
                },
            },
        };
    case USER_REACTED_TIMEOUT: {
        const storedReaction = state[action.data.channelID]?.[action.data.userID]?.reaction;
        if (!storedReaction || !action.data.reaction) {
            return state;
        }
        if (storedReaction.timestamp > action.data.reaction.timestamp) {
            return state;
        }
        return {
            ...state,
            [action.data.channelID]: {
                ...state[action.data.channelID],
                [action.data.userID]: {
                    ...state[action.data.channelID][action.data.userID],
                    reaction: null,
                },
            },
        };
    }
    default:
        return state;
    }
};

export type usersReactionsState = {
    [channelID: string]: {
        reactions: Reaction[];
    };
}

const queueReactions = (state: Reaction[], reaction: Reaction) => {
    const result = state?.length ? [...state] : [];
    result.push(reaction);
    if (result.length > MAX_NUM_REACTIONS_IN_REACTION_STREAM) {
        result.shift();
    }
    return result;
};

const removeReaction = (reactions: Reaction[], reaction: Reaction) => {
    return reactions.filter((r) => r.user_id !== reaction.user_id || r.timestamp > reaction.timestamp);
};

const reactions = (state: usersReactionsState = {}, action: usersStatusesAction) => {
    switch (action.type) {
    case USER_REACTED:
        if (action.data.reaction) {
            if (!state[action.data.channelID]) {
                return {
                    ...state,
                    [action.data.channelID]: {reactions: [action.data.reaction]},
                };
            }
            return {
                ...state,
                [action.data.channelID]: {
                    reactions: queueReactions(state[action.data.channelID].reactions, action.data.reaction),
                },
            };
        }
        return state;
    case USER_REACTED_TIMEOUT:
        if (!state[action.data.channelID]?.reactions || !action.data.reaction) {
            return state;
        }
        return {
            ...state,
            [action.data.channelID]: {
                reactions: removeReaction(
                    state[action.data.channelID].reactions,
                    {
                        ...action.data.reaction,
                        user_id: action.data.userID,
                    }),
            },
        };
    case USER_DISCONNECTED:
        if (!state[action.data.channelID] || !state[action.data.channelID].reactions) {
            return state;
        }

        return {
            ...state,
            [action.data.channelID]: {
                reactions: state[action.data.channelID].reactions.filter((r) => {
                    return r.user_id !== action.data.userID;
                }),
            },
        };
    default:
        return state;
    }
};

export type callsRecordingsState = {
    [callID: string]: CallRecordingState;
}

type userDisconnectedAction = {
    type: string;
    data: {
        channelID: string;
        userID: string;
        currentUserID: string;
    };
}

type recordingStateAction = {
    type: string;
    data: {
        callID: string;
        recState: CallRecordingState | null;
    };
}

type disclaimerDismissedAction = {
    type: string;
    data: {
        callID: string;
        dismissedAt: number;
    };
}

const recordings = (state: callsRecordingsState = {}, action: recordingStateAction | userDisconnectedAction | disclaimerDismissedAction) => {
    switch (action.type) {
    case UNINIT:
        return {};
    case USER_DISCONNECTED: {
        const theAction = action as userDisconnectedAction;
        if (theAction.data.currentUserID === theAction.data.userID) {
            const nextState = {...state};
            delete nextState[theAction.data.channelID];
            return nextState;
        }
        return state;
    }
    case CALL_RECORDING_STATE: {
        const theAction = action as recordingStateAction;
        return {
            ...state,
            [theAction.data.callID]: {
                ...state[theAction.data.callID],
                ...theAction.data.recState,
            },
        };
    }
    case CALL_REC_PROMPT_DISMISSED: {
        const theAction = action as disclaimerDismissedAction;
        return {
            ...state,
            [theAction.data.callID]: {
                ...state[theAction.data.callID],
                prompt_dismissed_at: theAction.data.dismissedAt,
            },
        };
    }
    default:
        return state;
    }
};

// callState should only hold immutable data, meaning those
// fields that don't change for the whole duration of a call.
export type callState = {
    ID: string;
    startAt: number;
    channelID: string;
    threadID: string;
    ownerID: string;
}

type callStateAction = {
    type: string;
    data: callState;
}

type callsState = {
    [channelID: string]: callState;
}

const calls = (state: callsState = {}, action: callStateAction) => {
    switch (action.type) {
    case UNINIT:
        return {};
    case CALL_STATE:
        return {
            ...state,
            [action.data.channelID]: {
                ...action.data,
            },
        };
    default:
        return state;
    }
};

export type hostsState = {
    [channelID: string]: {
        hostID: string;
        hostChangeAt?: number;
    };
}

type hostsStateAction = {
    type: string;
    data: {
        channelID: string;
        hostID: string;
        hostChangeAt: number;
    };
}

const hosts = (state: hostsState = {}, action: hostsStateAction) => {
    switch (action.type) {
    case UNINIT:
        return {};
    case CALL_HOST:
        return {
            ...state,
            [action.data.channelID]: {
                hostID: action.data.hostID,
                hostChangeAt: action.data.hostChangeAt,
            },
        };
    default:
        return state;
    }
};

export type screenSharingIDsState = {
    [channelID: string]: string;
}

type screenSharingIDAction = {
    type: string;
    data: {
        channelID: string;
        userID?: string;
    }
}

const screenSharingIDs = (state: screenSharingIDsState = {}, action: screenSharingIDAction) => {
    switch (action.type) {
    case UNINIT:
        return {};
    case USER_SCREEN_ON:
        return {
            ...state,
            [action.data.channelID]: action.data.userID,
        };
    case USER_DISCONNECTED: {
        // If the user who disconnected matches the one sharing we
        // want to fallthrough and clear the state.
        if (action.data.userID !== state[action.data.channelID]) {
            return state;
        }
    }
    // eslint-disable-next-line no-fallthrough
    case CALL_END:
    case USER_SCREEN_OFF:
        return {
            ...state,
            [action.data.channelID]: '',
        };
    default:
        return state;
    }
};

const expandedView = (state = false, action: { type: string }) => {
    switch (action.type) {
    case UNINIT:
        return false;
    case SHOW_EXPANDED_VIEW:
        return true;
    case HIDE_EXPANDED_VIEW:
        return false;
    default:
        return state;
    }
};

const switchCallModal = (state = {
    show: false,
    targetID: '',
}, action: { type: string, data?: { targetID: string } }) => {
    switch (action.type) {
    case UNINIT:
        return {show: false, targetID: ''};
    case SHOW_SWITCH_CALL_MODAL:
        return {show: true, targetID: action.data?.targetID};
    case HIDE_SWITCH_CALL_MODAL:
        return {show: false, targetID: ''};
    default:
        return state;
    }
};

const endCallModal = (state = {
    show: false,
    targetID: '',
}, action: { type: string, data?: { targetID: string } }) => {
    switch (action.type) {
    case SHOW_END_CALL_MODAL:
        return {show: true, targetID: action.data?.targetID};
    case HIDE_END_CALL_MODAL:
        return {show: false, targetID: ''};
    default:
        return state;
    }
};

const screenSourceModal = (state = false, action: { type: string }) => {
    switch (action.type) {
    case UNINIT:
        return false;
    case SHOW_SCREEN_SOURCE_MODAL:
        return true;
    case HIDE_SCREEN_SOURCE_MODAL:
        return false;
    default:
        return state;
    }
};

const callsConfig = (state = CallsConfigDefault, action: { type: string, data: CallsConfig }) => {
    switch (action.type) {
    case RECEIVED_CALLS_CONFIG:
        return action.data;
    case RECORDINGS_ENABLED:
        return {...state, EnableRecordings: action.data};
    default:
        return state;
    }
};

const rtcdEnabled = (state = false, action: {type: string, data: boolean}) => {
    switch (action.type) {
    case RTCD_ENABLED:
        return action.data;
    default:
        return state;
    }
};

const callsUserPreferences = (state = CallsUserPreferencesDefault, action: { type: string, data: CallsUserPreferences }) => {
    switch (action.type) {
    case RECEIVED_CALLS_USER_PREFERENCES:
        return action.data;
    default:
        return state;
    }
};

export type recentlyJoinedUsersState = {
    [channelID: string]: string[];
}

const recentlyJoinedUsers = (state: recentlyJoinedUsersState = {}, action: usersAction) => {
    switch (action.type) {
    case UNINIT:
        return {};
    case USER_CONNECTED:
        if (!state[action.data.channelID]) {
            return {
                ...state,
                [action.data.channelID]: [action.data.userID],
            };
        }
        return {
            ...state,
            [action.data.channelID]: [
                ...state[action.data.channelID],
                action.data.userID,
            ],
        };
    case USER_DISCONNECTED:
        return {
            ...state,
            [action.data.channelID]: state[action.data.channelID]?.filter((val) => val !== action.data.userID),
        };
    case CALL_END:
        return {
            ...state,
            [action.data.channelID]: [],
        };
    case USER_JOINED_TIMEOUT:
        return {
            ...state,
            [action.data.channelID]: state[action.data.channelID]?.filter((val) => val !== action.data.userID),
        };
    default:
        return state;
    }
};

type IncomingCallAction = {
    type: string;
    data: {
        callID: string;
        channelID: string;
        callerID: string;
        startAt: number;
        type: ChannelType;
    };
};

const incomingCalls = (state: IncomingCallNotification[] = [], action: IncomingCallAction) => {
    switch (action.type) {
    case ADD_INCOMING_CALL:
        return [...state, {...action.data}];
    case REMOVE_INCOMING_CALL:
        return state.filter((ic) => ic.callID !== action.data.callID);
    default:
        return state;
    }
};

type RingNotifyForCallsAction = {
    type: string;
    data: {
        callID: string;
    };
}

const ringingForCalls = (state: { [callID: string]: boolean } = {}, action: RingNotifyForCallsAction) => {
    switch (action.type) {
    case RINGING_FOR_CALL:
        return {
            ...state,
            [action.data.callID]: true,
        };
    case DID_RING_FOR_CALL: {
        const nextState = {...state};
        delete nextState[action.data.callID];
        return nextState;
    }
    default:
        return state;
    }
};

const didRingForCalls = (state: { [callID: string]: boolean } = {}, action: RingNotifyForCallsAction) => {
    switch (action.type) {
    case DID_RING_FOR_CALL:
    case RINGING_FOR_CALL:
        return {
            ...state,
            [action.data.callID]: true,
        };
    default:
        return state;
    }
};

const didNotifyForCalls = (state: { [callID: string]: boolean } = {}, action: RingNotifyForCallsAction) => {
    switch (action.type) {
    case DID_NOTIFY_FOR_CALL:
        return {
            ...state,
            [action.data.callID]: true,
        };
    default:
        return state;
    }
};

const dismissedCalls = (state: { [callID: string]: boolean } = {}, action: RingNotifyForCallsAction) => {
    switch (action.type) {
    case DISMISS_CALL:
        return {
            ...state,
            [action.data.callID]: true,
        };
    default:
        return state;
    }
};

export default combineReducers({
    channels,
    users,
    channelID,
    profiles,

    // DEPRECATED - Needed to keep compatibility with older MM server
    // version.
    voiceConnectedProfiles: profiles,

    reactions,
    usersStatuses,
    calls,
    hosts,
    screenSharingIDs,
    expandedView,
    switchCallModal,
    endCallModal,
    screenSourceModal,
    callsConfig,
    rtcdEnabled,
    callsUserPreferences,
    recordings,
    recentlyJoinedUsers,
    incomingCalls,
    ringingForCalls,
    didRingForCalls,
    didNotifyForCalls,
    dismissedCalls,
});
