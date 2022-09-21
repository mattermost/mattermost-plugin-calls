/* eslint-disable max-lines */

import {combineReducers} from 'redux';

import {UserProfile} from '@mattermost/types/users';

import {Checklist, ChecklistItemsFilter, emptyChecklist} from './types/checklist';
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
    SHOW_NEXT_STEPS_MODAL,
    HIDE_NEXT_STEPS_MODAL,
    SHOW_SWITCH_CALL_MODAL,
    HIDE_SWITCH_CALL_MODAL,
    SHOW_SCREEN_SOURCE_MODAL,
    HIDE_SCREEN_SOURCE_MODAL,
    RECEIVED_CALLS_CONFIG,
    SHOW_END_CALL_MODAL,
    HIDE_END_CALL_MODAL,
    RECEIVED_CHANNEL_STATE,
    RECEIVED_CALLS_USER_PREFERENCES,
    SET_CHECKLIST_ITEMS_FILTER,
    SetChecklistCollapsedState,
    SetAllChecklistsCollapsedState,
    SetEachChecklistCollapsedState,
    SET_CHECKLIST_COLLAPSED_STATE,
    SET_ALL_CHECKLISTS_COLLAPSED_STATE,
    SET_EACH_CHECKLIST_COLLAPSED_STATE,
    SetChecklistItemsFilter,
    SetChecklist,
    SET_CHECKLIST,
    SET_CHECKLIST_ITEM,
    SetChecklistItem,
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
        states: { [userID: string]: UserState },
    },
}

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

const nextStepsModal = (state = {
    show: false,
    targetID: '',
}, action: { type: string, data?: { targetID: string } }) => {
    switch (action.type) {
    case VOICE_CHANNEL_UNINIT:
        return {show: false, targetID: ''};
    case SHOW_NEXT_STEPS_MODAL:
        return {show: true, targetID: action.data?.targetID};
    case HIDE_NEXT_STEPS_MODAL:
        return {show: false, targetID: ''};
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

const checklistsByChannel = (state: Record<string, Checklist> = {}, action: SetChecklist | SetChecklistItem) => {
    switch (action.type) {
    case SET_CHECKLIST: {
        const setAction = action as SetChecklist;
        return {
            ...state,
            [action.channelId]: setAction.nextState,
        };
    }
    case SET_CHECKLIST_ITEM: {
        const setAction = action as SetChecklistItem;
        const newList = state[action.channelId] ? {...state[action.channelId]} : emptyChecklist();
        newList.items = [...newList.items];
        const newItem = setAction.item;
        const index = newList.items.findIndex((it) => it.id === newItem.id);
        if (index === -1) {
            newList.items.push(newItem);
        } else {
            newList.items[index] = newItem;
        }

        return {
            ...state,
            [action.channelId]: newList,
        };
    }
    default:
        return state;
    }
};

const checklistItemsFilterByChannel = (state: Record<string, ChecklistItemsFilter> = {}, action: SetChecklistItemsFilter) => {
    switch (action.type) {
    case SET_CHECKLIST_ITEMS_FILTER:
        return {
            ...state,
            [action.channelId]: action.nextState,
        };
    default:
        return state;
    }
};

// checklistCollapsedState keeps a map of channelId -> checklist number -> collapsed
const checklistCollapsedState = (
    state: Record<string, Record<number, boolean>> = {},
    action:
    | SetChecklistCollapsedState
    | SetAllChecklistsCollapsedState
    | SetEachChecklistCollapsedState,
) => {
    switch (action.type) {
    case SET_CHECKLIST_COLLAPSED_STATE: {
        const setAction = action as SetChecklistCollapsedState;
        return {
            ...state,
            [setAction.channelId]: {
                ...state[setAction.channelId],
                [setAction.checklistIndex]: setAction.collapsed,
            },
        };
    }
    case SET_ALL_CHECKLISTS_COLLAPSED_STATE: {
        const setAction = action as SetAllChecklistsCollapsedState;
        const newState: Record<number, boolean> = {};
        for (let i = 0; i < setAction.numOfChecklists; i++) {
            newState[i] = setAction.collapsed;
        }
        return {
            ...state,
            [setAction.channelId]: newState,
        };
    }
    case SET_EACH_CHECKLIST_COLLAPSED_STATE: {
        const setAction = action as SetEachChecklistCollapsedState;
        return {
            ...state,
            [setAction.channelId]: setAction.state,
        };
    }
    default:
        return state;
    }
};

export default combineReducers({
    channelState,
    voiceConnectedChannels,
    connectedChannelID,
    voiceConnectedProfiles,
    voiceUsersStatuses,
    voiceChannelCalls,
    voiceChannelScreenSharingID,
    expandedView,
    nextStepsModal,
    switchCallModal,
    endCallModal,
    screenSourceModal,
    voiceChannelRootPost,
    callsConfig,
    callsUserPreferences,
    checklistItemsFilterByChannel,
    checklistCollapsedState,
    checklistsByChannel,
});
