/* eslint-disable max-lines */
import {CallRecordingState, CallsConfig, Reaction, UserState} from '@calls/common/lib/types';

import {UserProfile} from '@mattermost/types/users';
import {combineReducers} from 'redux';

import {MAX_NUM_REACTIONS_IN_REACTION_STREAM} from 'src/constants';

import {CallsConfigDefault, CallsUserPreferences, CallsUserPreferencesDefault, ChannelState} from 'src/types/types';

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
    VOICE_CHANNEL_CALL_END,
    VOICE_CHANNEL_CALL_HOST,
    VOICE_CHANNEL_CALL_REC_PROMPT_DISMISSED,
    VOICE_CHANNEL_CALL_RECORDING_STATE,
    VOICE_CHANNEL_CALL_START,
    VOICE_CHANNEL_PROFILE_CONNECTED,
    VOICE_CHANNEL_PROFILES_CONNECTED,
    VOICE_CHANNEL_ROOT_POST,
    VOICE_CHANNEL_UNINIT,
    VOICE_CHANNEL_USER_CONNECTED,
    VOICE_CHANNEL_USER_DISCONNECTED,
    VOICE_CHANNEL_USER_MUTED,
    VOICE_CHANNEL_USER_RAISE_HAND,
    VOICE_CHANNEL_USER_REACTED,
    VOICE_CHANNEL_USER_REACTED_TIMEOUT,
    VOICE_CHANNEL_USER_SCREEN_OFF,
    VOICE_CHANNEL_USER_SCREEN_ON,
    VOICE_CHANNEL_USER_UNMUTED,
    VOICE_CHANNEL_USER_UNRAISE_HAND,
    VOICE_CHANNEL_USER_VOICE_OFF,
    VOICE_CHANNEL_USER_VOICE_ON,
    VOICE_CHANNEL_USERS_CONNECTED,
    VOICE_CHANNEL_USERS_CONNECTED_STATES,
    VOICE_CHANNEL_USER_JOINED_TIMEOUT,
    RECORDINGS_ENABLED,
    RTCD_ENABLED,
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

const voiceConnectedProfiles = (state: connectedProfilesState = {}, action: connectedProfilesAction) => {
    switch (action.type) {
    case VOICE_CHANNEL_UNINIT:
        return {};
    case VOICE_CHANNEL_PROFILES_CONNECTED:
        return {
            ...state,
            [action.data.channelID]: action.data.profiles,
        };
    case VOICE_CHANNEL_PROFILE_CONNECTED:
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
    case VOICE_CHANNEL_USER_DISCONNECTED:
        return {
            ...state,
            [action.data.channelID]: state[action.data.channelID]?.filter((val) => val.id !== action.data.userID),
        };
    case VOICE_CHANNEL_CALL_END:
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

const voiceConnectedChannels = (state: connectedChannelsState = {}, action: connectedChannelsAction) => {
    switch (action.type) {
    case VOICE_CHANNEL_UNINIT:
        return {};
    case VOICE_CHANNEL_USER_CONNECTED:
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
    case VOICE_CHANNEL_USER_DISCONNECTED:
        return {
            ...state,
            [action.data.channelID]: state[action.data.channelID]?.filter((val) => val !== action.data.userID),
        };
    case VOICE_CHANNEL_USERS_CONNECTED:
        return {
            ...state,
            [action.data.channelID]: action.data.users,
        };
    case VOICE_CHANNEL_CALL_END:
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
    case VOICE_CHANNEL_UNINIT:
        return null;
    case DESKTOP_WIDGET_CONNECTED:
        return action.data.channelID;
    case VOICE_CHANNEL_USER_CONNECTED: {
        const callsClient = window.callsClient || window.opener?.callsClient;
        if (action.data.currentUserID === action.data.userID && callsClient?.channelID === action.data.channelID) {
            return action.data.channelID;
        }
        return state;
    }
    case VOICE_CHANNEL_USER_DISCONNECTED:
        if (action.data.currentUserID === action.data.userID && state === action.data.channelID) {
            return null;
        }
        return state;
    case VOICE_CHANNEL_CALL_END:
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
    case VOICE_CHANNEL_USER_REACTED:
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
    case VOICE_CHANNEL_USER_REACTED_TIMEOUT:
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
    default:
        return state;
    }
};

const voiceUsersStatuses = (state: UsersStatusesState = {}, action: usersStatusesAction) => {
    switch (action.type) {
    case VOICE_CHANNEL_UNINIT:
        return {};
    case VOICE_CHANNEL_USER_CONNECTED:
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
    case VOICE_CHANNEL_USER_DISCONNECTED:
        if (state[action.data.channelID]) {
            // eslint-disable-next-line
            const {[action.data.userID]: omit, ...res} = state[action.data.channelID];
            return {
                ...state,
                [action.data.channelID]: res,
            };
        }
        return state;
    case VOICE_CHANNEL_USERS_CONNECTED_STATES:
        return {
            ...state,
            [action.data.channelID]: action.data.states,
        };
    case VOICE_CHANNEL_USER_MUTED:
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
    case VOICE_CHANNEL_USER_UNMUTED:
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
    case VOICE_CHANNEL_USER_VOICE_ON:
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
    case VOICE_CHANNEL_USER_VOICE_OFF:
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
    case VOICE_CHANNEL_USER_RAISE_HAND:
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
    case VOICE_CHANNEL_USER_UNRAISE_HAND:
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
    case VOICE_CHANNEL_USER_REACTED:
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
    case VOICE_CHANNEL_USER_REACTED_TIMEOUT: {
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
    case VOICE_CHANNEL_UNINIT:
        return {};
    case VOICE_CHANNEL_USER_DISCONNECTED: {
        const theAction = action as userDisconnectedAction;
        if (theAction.data.currentUserID === theAction.data.userID) {
            const nextState = {...state};
            delete nextState[theAction.data.channelID];
            return nextState;
        }
        return state;
    }
    case VOICE_CHANNEL_CALL_RECORDING_STATE: {
        const theAction = action as callRecordingStateAction;
        return {
            ...state,
            [theAction.data.callID]: {
                ...state[theAction.data.callID],
                ...theAction.data.recState,
            },
        };
    }
    case VOICE_CHANNEL_CALL_REC_PROMPT_DISMISSED: {
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

interface callState {
    channelID: string,
    startAt?: number,
    ownerID?: string,
    hostID: string,
    hostChangeAt?: number,
}

interface callStateAction {
    type: string,
    data: callState,
}

const voiceChannelCalls = (state: { [channelID: string]: callState } = {}, action: callStateAction) => {
    switch (action.type) {
    case VOICE_CHANNEL_UNINIT:
        return {};
    case VOICE_CHANNEL_CALL_HOST:
        return {
            ...state,
            [action.data.channelID]: {
                ...state[action.data.channelID],
                hostID: action.data.hostID,
                hostChangeAt: action.data.hostChangeAt || state[action.data.channelID].hostChangeAt,
            },
        };
    case VOICE_CHANNEL_CALL_START:
        return {
            ...state,
            [action.data.channelID]: {
                channelID: action.data.channelID,
                startAt: action.data.startAt,
                ownerID: action.data.ownerID,
                hostID: action.data.hostID,
                hostChangeAt: action.data.startAt,
            },
        };
    default:
        return state;
    }
};

const voiceChannelRootPost = (state: { [channelID: string]: string } = {}, action: { type: string, data: { channelID: string, rootPost: string } }) => {
    switch (action.type) {
    case VOICE_CHANNEL_ROOT_POST:
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
    case VOICE_CHANNEL_UNINIT:
        return {};
    case VOICE_CHANNEL_USER_SCREEN_ON:
        return {
            ...state,
            [action.data.channelID]: action.data.userID,
        };
    case VOICE_CHANNEL_USER_DISCONNECTED: {
        // If the user who disconnected matches the one sharing we
        // want to fallthrough and clear the state.
        if (action.data.userID !== state[action.data.channelID]) {
            return state;
        }
    }
    // eslint-disable-next-line no-fallthrough
    case VOICE_CHANNEL_CALL_END:
    case VOICE_CHANNEL_USER_SCREEN_OFF:
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
    case VOICE_CHANNEL_UNINIT:
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
    case VOICE_CHANNEL_UNINIT:
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
    case VOICE_CHANNEL_UNINIT:
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
    case VOICE_CHANNEL_UNINIT:
        return {};
    case VOICE_CHANNEL_USER_CONNECTED:
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
    case VOICE_CHANNEL_USER_DISCONNECTED:
        return {
            ...state,
            [action.data.channelID]: state[action.data.channelID]?.filter((val) => val !== action.data.userID),
        };
    case VOICE_CHANNEL_CALL_END:
        return {
            ...state,
            [action.data.channelID]: [],
        };
    case VOICE_CHANNEL_USER_JOINED_TIMEOUT:
        return {
            ...state,
            [action.data.channelID]: state[action.data.channelID]?.filter((val) => val !== action.data.userID),
        };
    default:
        return state;
    }
};

export default combineReducers({
    channelState,
    voiceConnectedChannels,
    connectedChannelID,
    voiceConnectedProfiles,
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
});
