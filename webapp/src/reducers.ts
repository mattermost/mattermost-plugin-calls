import {combineReducers} from 'redux';

import {UserProfile} from '@mattermost/types/users';

import {
    CallsConfigDefault,
    CallsConfig,
    UserState,
    CallsUserPreferences,
    CallsUserPreferencesDefault,
} from './types/types';

import {
    VOICE_CHANNEL_USER_CONNECTED,
    VOICE_CHANNEL_USER_DISCONNECTED,
    VOICE_CHANNEL_USERS_CONNECTED,
    VOICE_CHANNEL_USERS_CONNECTED_STATES,
    VOICE_CHANNEL_PROFILES_CONNECTED,
    VOICE_CHANNEL_PROFILE_CONNECTED,
    VOICE_CHANNEL_USER_MUTED,
    VOICE_CHANNEL_USER_UNMUTED,
    VOICE_CHANNEL_USER_VOICE_ON,
    VOICE_CHANNEL_USER_VOICE_OFF,
    VOICE_CHANNEL_CALL_START,
    VOICE_CHANNEL_CALL_END,
    VOICE_CHANNEL_USER_SCREEN_ON,
    VOICE_CHANNEL_USER_SCREEN_OFF,
    VOICE_CHANNEL_USER_RAISE_HAND,
    VOICE_CHANNEL_USER_UNRAISE_HAND,
    VOICE_CHANNEL_UNINIT,
    VOICE_CHANNEL_ROOT_POST,
    SHOW_EXPANDED_VIEW,
    HIDE_EXPANDED_VIEW,
    SHOW_SWITCH_CALL_MODAL,
    HIDE_SWITCH_CALL_MODAL,
    SHOW_SCREEN_SOURCE_MODAL,
    HIDE_SCREEN_SOURCE_MODAL,
    RECEIVED_CALLS_CONFIG,
    SHOW_END_CALL_MODAL,
    HIDE_END_CALL_MODAL,
    RECEIVED_CHANNEL_STATE,
    RECEIVED_CALLS_USER_PREFERENCES,
    VOICE_CHANNEL_USER_REACTION,
} from './action_types';

interface channelState {
    id: string,
    enabled: boolean,
}

interface channelStateAction {
    type: string,
    data: channelState,
}

const channelState = (state: {[channelID: string]: channelState} = {}, action: channelStateAction) => {
    switch (action.type) {
    case RECEIVED_CHANNEL_STATE:
        return {
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

interface usersStatusesState {
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
        reaction?: {emoji: string, timestamp: number},
        states: { [userID: string]: UserState },
    },
}

interface userReactionsState {
    [channelID: string]: {
        reactions: {emoji: string, timestamp: number, userID: string}[],
    }
}

const queueReactions = (state: {emoji: string, timestamp: number, userID: string}[], reaction: {emoji: string, timestamp: number}, userID: string) => {
    const result = [...state];
    result.push({...reaction, userID});
    if (result.length > 8) { // TODO: random size, this should probably be configurable
        result.shift();
    }
    return result;
};

const reactionStatus = (state: userReactionsState = {}, action: usersStatusesAction) => {
    switch (action.type) {
    case VOICE_CHANNEL_USER_REACTION:
        if (action.data.reaction) {
            return queueReactions(state[action.data.channelID].reactions, action.data.reaction, action.data.userID);
        }
        return state;
    default:
        return state;
    }
};

const voiceUsersStatuses = (state: usersStatusesState = {}, action: usersStatusesAction) => {
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
    case VOICE_CHANNEL_USER_REACTION:
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
    default:
        return state;
    }
};

interface callState {
    channelID: string,
    startAt: number,
    ownerID: string,
}

interface callStartAction {
    type: string,
    data: callState,
}

const voiceChannelCalls = (state: {[channelID: string]: callState} = {}, action: callStartAction) => {
    switch (action.type) {
    case VOICE_CHANNEL_UNINIT:
        return {};
    case VOICE_CHANNEL_CALL_START:
        return {
            ...state,
            [action.data.channelID]: {
                channelID: action.data.channelID,
                startAt: action.data.startAt,
                ownerID: action.data.ownerID,
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
    default:
        return state;
    }
};

const callsUserPreferences = (state = CallsUserPreferencesDefault, action: { type: string, data: CallsUserPreferences}) => {
    switch (action.type) {
    case RECEIVED_CALLS_USER_PREFERENCES:
        return action.data;
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
    callsUserPreferences,
});
