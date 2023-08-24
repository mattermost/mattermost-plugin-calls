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
    CALLS_CALL_END,
    CALLS_CALL_HOST,
    CALLS_CALL_REC_PROMPT_DISMISSED,
    CALLS_CALL_RECORDING_STATE,
    CALLS_CALL_START,
    CALLS_PROFILE_CONNECTED,
    CALLS_PROFILES_CONNECTED,
    CALLS_ROOT_POST,
    CALLS_UNINIT,
    CALLS_USER_CONNECTED,
    CALLS_USER_DISCONNECTED,
    CALLS_USER_MUTED,
    CALLS_USER_RAISE_HAND,
    CALLS_USER_REACTED,
    CALLS_USER_REACTED_TIMEOUT,
    CALLS_USER_SCREEN_OFF,
    CALLS_USER_SCREEN_ON,
    CALLS_USER_UNMUTED,
    CALLS_USER_UNRAISE_HAND,
    CALLS_USER_VOICE_OFF,
    CALLS_USER_VOICE_ON,
    CALLS_USERS_CONNECTED,
    CALLS_USERS_CONNECTED_STATES,
    CALLS_USER_JOINED_TIMEOUT,
    RECORDINGS_ENABLED,
    ADD_INCOMING_CALL,
    REMOVE_INCOMING_CALL,
    DID_RING_FOR_CALL,
    RTCD_ENABLED,
    DID_NOTIFY_FOR_CALL,
    RINGING_FOR_CALL,
    DISMISS_CALL,
} from './action_types';

interface channelStateAction {
    type: string,
    data: ChannelState,
}

const channelState = (state: { [channelID: string]: ChannelState } = {}, action: channelStateAction) => {
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

interface connectedProfilesState {
    [channelID: string]: UserProfile[],
}

interface connectedProfilesAction {
    type: string,
    data: {
        channelID: string,
        userID?: string,
        profile?: UserProfile,
        profiles?: UserProfile[]
    },
}

// Profiles (as in whole User objects) connected to calls.
const connectedProfiles = (state: connectedProfilesState = {}, action: connectedProfilesAction) => {
    switch (action.type) {
    case CALLS_UNINIT:
        return {};
    case CALLS_PROFILES_CONNECTED:
        return {
            ...state,
            [action.data.channelID]: action.data.profiles,
        };
    case CALLS_PROFILE_CONNECTED:
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
    case CALLS_USER_DISCONNECTED:
        return {
            ...state,
            [action.data.channelID]: state[action.data.channelID]?.filter((val) => val.id !== action.data.userID),
        };
    case CALLS_CALL_END:
        return {
            ...state,
            [action.data.channelID]: [],
        };
    default:
        return state;
    }
};

interface connectedChannelsState {
    [channelID: string]: string[],
}

interface connectedChannelsAction {
    type: string,
    data: {
        channelID: string,
        userID?: string,
        users?: string[],
    },
}

const connectedChannels = (state: connectedChannelsState = {}, action: connectedChannelsAction) => {
    switch (action.type) {
    case CALLS_UNINIT:
        return {};
    case CALLS_USER_CONNECTED:
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
    case CALLS_USER_DISCONNECTED:
        return {
            ...state,
            [action.data.channelID]: state[action.data.channelID]?.filter((val) => val !== action.data.userID),
        };
    case CALLS_USERS_CONNECTED:
        return {
            ...state,
            [action.data.channelID]: action.data.users,
        };
    case CALLS_CALL_END:
        return {
            ...state,
            [action.data.channelID]: [],
        };
    default:
        return state;
    }
};

const connectedChannelID = (state: string | null = null, action: { type: string, data: { channelID: string, currentUserID: string, userID: string } }) => {
    switch (action.type) {
    case CALLS_UNINIT:
        return null;
    case DESKTOP_WIDGET_CONNECTED:
        return action.data.channelID;
    case CALLS_USER_CONNECTED: {
        const callsClient = window.callsClient || window.opener?.callsClient;
        if (action.data.currentUserID === action.data.userID && callsClient?.channelID === action.data.channelID) {
            return action.data.channelID;
        }
        return state;
    }
    case CALLS_USER_DISCONNECTED:
        if (action.data.currentUserID === action.data.userID && state === action.data.channelID) {
            return null;
        }
        return state;
    case CALLS_CALL_END:
        if (state === action.data.channelID) {
            return null;
        }
        return state;
    default:
        return state;
    }
};

export interface UsersStatusesState {
    [channelID: string]: {
        [userID: string]: UserState,
    },
}

interface usersStatusesAction {
    type: string,
    data: {
        channelID: string,
        userID: string,
        raised_hand?: number,
        reaction?: Reaction,
        states: { [userID: string]: UserState },
    },
}

interface userReactionsState {
    [channelID: string]: {
        reactions: Reaction[],
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

const reactionStatus = (state: userReactionsState = {}, action: usersStatusesAction) => {
    switch (action.type) {
    case CALLS_USER_REACTED:
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
    case CALLS_USER_REACTED_TIMEOUT:
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
    case CALLS_USER_DISCONNECTED:
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

const voiceUsersStatuses = (state: UsersStatusesState = {}, action: usersStatusesAction) => {
    switch (action.type) {
    case CALLS_UNINIT:
        return {};
    case CALLS_USER_CONNECTED:
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
    case CALLS_USER_DISCONNECTED:
        if (state[action.data.channelID]) {
            // eslint-disable-next-line
            const {[action.data.userID]: omit, ...res} = state[action.data.channelID];
            return {
                ...state,
                [action.data.channelID]: res,
            };
        }
        return state;
    case CALLS_USERS_CONNECTED_STATES:
        return {
            ...state,
            [action.data.channelID]: action.data.states,
        };
    case CALLS_USER_MUTED:
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
    case CALLS_USER_UNMUTED:
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
    case CALLS_USER_VOICE_ON:
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
    case CALLS_USER_VOICE_OFF:
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
    case CALLS_USER_RAISE_HAND:
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
    case CALLS_USER_UNRAISE_HAND:
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
    case CALLS_USER_REACTED:
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
    case CALLS_USER_REACTED_TIMEOUT: {
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

type callRecordingStateAction = {
    type: string,
    data: {
        callID: string,
        recState: CallRecordingState | null,
    },
}

type userDisconnectedAction = {
    type: string,
    data: {
        channelID: string,
        userID: string,
        currentUserID: string,
    },
}

type disclaimerDismissedAction = {
    type: string,
    data: {
        callID: string,
        dismissedAt: number,
    }
}

const callsRecordings = (state: { [callID: string]: CallRecordingState } = {}, action: callRecordingStateAction | userDisconnectedAction | disclaimerDismissedAction) => {
    switch (action.type) {
    case CALLS_UNINIT:
        return {};
    case CALLS_USER_DISCONNECTED: {
        const theAction = action as userDisconnectedAction;
        if (theAction.data.currentUserID === theAction.data.userID) {
            const nextState = {...state};
            delete nextState[theAction.data.channelID];
            return nextState;
        }
        return state;
    }
    case CALLS_CALL_RECORDING_STATE: {
        const theAction = action as callRecordingStateAction;
        return {
            ...state,
            [theAction.data.callID]: {
                ...state[theAction.data.callID],
                ...theAction.data.recState,
            },
        };
    }
    case CALLS_CALL_REC_PROMPT_DISMISSED: {
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

export interface callState {
    ID?: string,
    channelID: string,
    startAt?: number,
    ownerID?: string,
    hostID: string,
    hostChangeAt?: number,
    dismissedNotification: { [userID: string]: boolean },
}

export interface callStateAction {
    type: string,
    data: callState,
}

const voiceChannelCalls = (state: { [channelID: string]: callState } = {}, action: callStateAction) => {
    switch (action.type) {
    case CALLS_UNINIT:
        return {};
    case CALLS_CALL_HOST:
        return {
            ...state,
            [action.data.channelID]: {
                ...state[action.data.channelID],
                hostID: action.data.hostID,
                hostChangeAt: action.data.hostChangeAt || state[action.data.channelID].hostChangeAt,
            },
        };
    case CALLS_CALL_START:
        return {
            ...state,
            [action.data.channelID]: {
                ...action.data,
                hostChangeAt: action.data.startAt,
                dismissedNotification: action.data.dismissedNotification,
            },
        };
    default:
        return state;
    }
};

const voiceChannelRootPost = (state: { [channelID: string]: string } = {}, action: { type: string, data: { channelID: string, rootPost: string } }) => {
    switch (action.type) {
    case CALLS_ROOT_POST:
        return {
            ...state,
            [action.data.channelID]: action.data.rootPost,
        };
    default:
        return state;
    }
};

const voiceChannelScreenSharingID = (state: { [channelID: string]: string } = {}, action: { type: string, data: { channelID: string, userID?: string } }) => {
    switch (action.type) {
    case CALLS_UNINIT:
        return {};
    case CALLS_USER_SCREEN_ON:
        return {
            ...state,
            [action.data.channelID]: action.data.userID,
        };
    case CALLS_USER_DISCONNECTED: {
        // If the user who disconnected matches the one sharing we
        // want to fallthrough and clear the state.
        if (action.data.userID !== state[action.data.channelID]) {
            return state;
        }
    }
    // eslint-disable-next-line no-fallthrough
    case CALLS_CALL_END:
    case CALLS_USER_SCREEN_OFF:
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
    case CALLS_UNINIT:
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
    case CALLS_UNINIT:
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
    case CALLS_UNINIT:
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

interface recentlyJoinedUsersState {
    [channelID: string]: string[],
}

const recentlyJoinedUsers = (state: recentlyJoinedUsersState = {}, action: connectedChannelsAction) => {
    switch (action.type) {
    case CALLS_UNINIT:
        return {};
    case CALLS_USER_CONNECTED:
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
    case CALLS_USER_DISCONNECTED:
        return {
            ...state,
            [action.data.channelID]: state[action.data.channelID]?.filter((val) => val !== action.data.userID),
        };
    case CALLS_CALL_END:
        return {
            ...state,
            [action.data.channelID]: [],
        };
    case CALLS_USER_JOINED_TIMEOUT:
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
    },
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
    }
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
    channelState,
    connectedChannels,
    connectedChannelID,
    connectedProfiles,
    reactionStatus,
    voiceUsersStatuses,
    voiceChannelCalls,
    voiceChannelScreenSharingID,
    expandedView,
    switchCallModal,
    endCallModal,
    screenSourceModal,
    voiceChannelRootPost,
    callsConfig,
    rtcdEnabled,
    callsUserPreferences,
    callsRecordings,
    recentlyJoinedUsers,
    incomingCalls,
    ringingForCalls,
    didRingForCalls,
    didNotifyForCalls,
    dismissedCalls,
});
