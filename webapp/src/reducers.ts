/* eslint-disable max-lines */
import {CallJobState, CallsConfig, LiveCaption, Reaction, UserSessionState} from '@mattermost/calls-common/lib/types';
import {combineReducers} from 'redux';
import {MAX_NUM_REACTIONS_IN_REACTION_STREAM} from 'src/constants';
import {
    CallsConfigDefault,
    CallsUserPreferences,
    CallsUserPreferencesDefault,
    ChannelState,
    ChannelType,
    HostControlNotice,
    HostControlNoticeTimeout,
    IncomingCallNotification,
    LiveCaptions,
} from 'src/types/types';

import {
    ADD_INCOMING_CALL,
    CALL_END,
    CALL_HOST,
    CALL_LIVE_CAPTIONS_STATE,
    CALL_REC_PROMPT_DISMISSED,
    CALL_RECORDING_STATE,
    CALL_STATE,
    CLIENT_CONNECTING,
    DESKTOP_WIDGET_CONNECTED,
    DID_NOTIFY_FOR_CALL,
    DID_RING_FOR_CALL,
    DISMISS_CALL,
    HIDE_END_CALL_MODAL,
    HIDE_EXPANDED_VIEW,
    HIDE_SCREEN_SOURCE_MODAL,
    HIDE_SWITCH_CALL_MODAL,
    HOST_CONTROL_NOTICE,
    HOST_CONTROL_NOTICE_TIMEOUT_EVENT,
    LIVE_CAPTION,
    LIVE_CAPTION_TIMEOUT_EVENT,
    LIVE_CAPTIONS_ENABLED,
    RECEIVED_CALLS_CONFIG,
    RECEIVED_CALLS_USER_PREFERENCES,
    RECEIVED_CHANNEL_STATE,
    RECORDINGS_ENABLED,
    REMOVE_INCOMING_CALL,
    RINGING_FOR_CALL,
    RTCD_ENABLED,
    SHOW_END_CALL_MODAL,
    SHOW_EXPANDED_VIEW,
    SHOW_SCREEN_SOURCE_MODAL,
    SHOW_SWITCH_CALL_MODAL,
    TRANSCRIBE_API,
    TRANSCRIPTIONS_ENABLED,
    UNINIT,
    USER_JOINED,
    USER_JOINED_TIMEOUT,
    USER_LEFT,
    USER_LOWER_HAND,
    USER_MUTED,
    USER_RAISE_HAND,
    USER_REACTED,
    USER_REACTED_TIMEOUT,
    USER_SCREEN_OFF,
    USER_SCREEN_ON,
    USER_UNMUTED,
    USER_VOICE_OFF,
    USER_VOICE_ON,
    USERS_STATES,
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

type clientState = {
    channelID: string;
    sessionID: string;
} | null;
type clientStateAction = {
    type: string;
    data: clientStateData;
}
type clientStateData = {
    channel_id: string;
    session_id: string;
}
type callEndAction = {
    type: string;
    data: callEndData;
}
type callEndData = {
    channelID: string;
    callID: string;
}

// clientStateReducer holds the channel and session ID for the call the current user is connected to.
// This reducer is only needed by the Desktop app client to be aware that the user is
// connected through the global widget.
const clientStateReducer = (state: clientState = null, action: clientStateAction | callEndAction) => {
    switch (action.type) {
    case UNINIT:
        return null;
    case DESKTOP_WIDGET_CONNECTED: {
        const data = action.data as clientStateData;
        return {
            channelID: data.channel_id,
            sessionID: data.session_id,
        };
    }
    case USER_LEFT: {
        const data = action.data as clientStateData;
        if (data.session_id === state?.sessionID) {
            return null;
        }
        return state;
    }
    case CALL_END: {
        const data = action.data as callEndData;
        if (data.channelID === state?.channelID) {
            return null;
        }
        return state;
    }
    default:
        return state;
    }
};

export type sessionsState = {
    [channelID: string]: {
        [sessionID: string]: UserSessionState;
    };
}

type sessionsAction = {
    type: string;
    data: {
        channelID: string;
        userID: string;
        session_id: string;
        raised_hand?: number;
        reaction?: Reaction;
        states: { [userID: string]: UserSessionState };
    };
}

const sessions = (state: sessionsState = {}, action: sessionsAction) => {
    switch (action.type) {
    case UNINIT:
        return {};
    case CALL_END: {
        const nextState = {...state};
        delete nextState[action.data.channelID];
        return nextState;
    }
    case USER_JOINED:
        return {
            ...state,
            [action.data.channelID]: {
                ...state[action.data.channelID],
                [action.data.session_id]: {
                    session_id: action.data.session_id,
                    user_id: action.data.userID,
                    unmuted: false,
                    voice: false,
                    raised_hand: 0,
                },
            },
        };
    case USER_LEFT:
        if (state[action.data.channelID]) {
            // eslint-disable-next-line
            const {[action.data.session_id]: omit, ...res} = state[action.data.channelID];
            return {
                ...state,
                [action.data.channelID]: res,
            };
        }
        return state;
    case USERS_STATES:
        return {
            ...state,
            [action.data.channelID]: action.data.states,
        };
    case USER_MUTED:
        if (!state[action.data.channelID]) {
            return {
                ...state,
                [action.data.channelID]: {
                    [action.data.session_id]: {
                        session_id: action.data.session_id,
                        user_id: action.data.userID,
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
                [action.data.session_id]: {
                    ...state[action.data.channelID][action.data.session_id],
                    unmuted: false,
                },
            },
        };
    case USER_UNMUTED:
        if (!state[action.data.channelID]) {
            return {
                ...state,
                [action.data.channelID]: {
                    [action.data.session_id]: {
                        session_id: action.data.session_id,
                        user_id: action.data.userID,
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
                [action.data.session_id]: {
                    ...state[action.data.channelID][action.data.session_id],
                    unmuted: true,
                },
            },
        };
    case USER_VOICE_ON:
        if (!state[action.data.channelID]) {
            return {
                ...state,
                [action.data.channelID]: {
                    [action.data.session_id]: {
                        session_id: action.data.session_id,
                        user_id: action.data.userID,
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
                [action.data.session_id]: {
                    ...state[action.data.channelID][action.data.session_id],
                    voice: true,
                },
            },
        };
    case USER_VOICE_OFF:
        if (!state[action.data.channelID]) {
            return {
                ...state,
                [action.data.channelID]: {
                    [action.data.session_id]: {
                        session_id: action.data.session_id,
                        user_id: action.data.userID,
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
                [action.data.session_id]: {
                    ...state[action.data.channelID][action.data.session_id],
                    voice: false,
                },
            },
        };
    case USER_RAISE_HAND:
        if (!state[action.data.channelID]) {
            return {
                ...state,
                [action.data.channelID]: {
                    [action.data.session_id]: {
                        session_id: action.data.session_id,
                        user_id: action.data.userID,
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
                [action.data.session_id]: {
                    ...state[action.data.channelID][action.data.session_id],
                    raised_hand: action.data.raised_hand,
                },
            },
        };
    case USER_LOWER_HAND:
        if (!state[action.data.channelID]) {
            return {
                ...state,
                [action.data.channelID]: {
                    [action.data.session_id]: {
                        session_id: action.data.session_id,
                        user_id: action.data.userID,
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
                [action.data.session_id]: {
                    ...state[action.data.channelID][action.data.session_id],
                    raised_hand: action.data.raised_hand,
                },
            },
        };
    case USER_REACTED:
        if (!state[action.data.channelID]) {
            return {
                ...state,
                [action.data.channelID]: {
                    [action.data.session_id]: {
                        session_id: action.data.session_id,
                        user_id: action.data.userID,
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
                [action.data.session_id]: {
                    ...state[action.data.channelID][action.data.session_id],
                    reaction: action.data.reaction,
                },
            },
        };
    case USER_REACTED_TIMEOUT: {
        const storedReaction = state[action.data.channelID]?.[action.data.session_id]?.reaction;
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
                [action.data.session_id]: {
                    ...state[action.data.channelID][action.data.session_id],
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

const reactions = (state: usersReactionsState = {}, action: sessionsAction) => {
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
    case USER_LEFT:
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

export type liveCaptionState = {
    [channelID: string]: LiveCaptions;
}

type liveCaptionData = LiveCaption & {
    caption_id: string;
}

type liveCaptionAction = {
    type: string;
    data: liveCaptionData;
}

type liveCaptionTimeoutData = {
    channel_id: string;
    session_id: string;
    caption_id: string;
}

type liveCaptionTimeoutAction = {
    type: string;
    data: liveCaptionTimeoutData;
}

// Add caption to channel, overwriting session's current caption (if any).
const addCaption = (channelState: LiveCaptions, data: liveCaptionData) => {
    const state = {...(channelState || {})};
    state[data.session_id] = data;
    return state;
};

// Remove expired caption if it is still active.
const captionTimeout = (channelState: LiveCaptions, data: liveCaptionTimeoutData) => {
    const state = {...(channelState || {})};
    if (state[data.session_id] && state[data.session_id].caption_id === data.caption_id) {
        delete state[data.session_id];
    }
    return state;
};

const liveCaptions = (state: liveCaptionState = {}, action: liveCaptionAction | liveCaptionTimeoutAction) => {
    switch (action.type) {
    case LIVE_CAPTION: {
        const data = action.data as liveCaptionData;
        return {
            ...state,
            [data.channel_id]: addCaption(state[data.channel_id], data),
        };
    }
    case LIVE_CAPTION_TIMEOUT_EVENT: {
        const data = action.data as liveCaptionTimeoutData;
        return {
            ...state,
            [data.channel_id]: captionTimeout(state[data.channel_id], data),
        };
    }
    default:
        return state;
    }
};

export type callsJobState = {
    [callID: string]: CallJobState;
}

type userDisconnectedAction = {
    type: string;
    data: {
        channelID: string;
        userID: string;
        currentUserID: string;
    };
}

type jobStateAction = {
    type: string;
    data: {
        callID: string;
        jobState: CallJobState | null;
    };
}

type disclaimerDismissedAction = {
    type: string;
    data: {
        callID: string;
        dismissedAt: number;
    };
}

const recordings = (state: callsJobState = {}, action: jobStateAction | userDisconnectedAction | disclaimerDismissedAction) => {
    switch (action.type) {
    case UNINIT:
        return {};
    case USER_LEFT: {
        const theAction = action as userDisconnectedAction;
        if (theAction.data.currentUserID === theAction.data.userID) {
            const nextState = {...state};
            delete nextState[theAction.data.channelID];
            return nextState;
        }
        return state;
    }
    case CALL_RECORDING_STATE: {
        const theAction = action as jobStateAction;
        return {
            ...state,
            [theAction.data.callID]: {
                ...state[theAction.data.callID],
                ...theAction.data.jobState,
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

const callLiveCaptionsState = (state: callsJobState = {}, action: jobStateAction) => {
    switch (action.type) {
    case CALL_LIVE_CAPTIONS_STATE: {
        return {
            ...state,
            [action.data.callID]: {
                ...state[action.data.callID],
                ...action.data.jobState,
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
    case CALL_END: {
        const nextState = {...state};
        delete nextState[action.data.channelID];
        return nextState;
    }
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
        session_id: string;
    }
}

const screenSharingIDs = (state: screenSharingIDsState = {}, action: screenSharingIDAction) => {
    switch (action.type) {
    case UNINIT:
        return {};
    case USER_SCREEN_ON:
        return {
            ...state,
            [action.data.channelID]: action.data.session_id,
        };
    case USER_LEFT: {
        // If the user who disconnected matches the one sharing we
        // want to fallthrough and clear the state.
        if (action.data.session_id !== state[action.data.channelID]) {
            return state;
        }
    }
    // eslint-disable-next-line no-fallthrough
    case CALL_END:
    case USER_SCREEN_OFF:
        if (action.data.session_id !== state[action.data.channelID]) {
            return state;
        }
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
    case TRANSCRIPTIONS_ENABLED:
        return {...state, EnableTranscriptions: action.data};
    case LIVE_CAPTIONS_ENABLED:
        return {...state, EnableLiveCaptions: action.data};
    case TRANSCRIBE_API:
        return {...state, TranscribeAPI: action.data};
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

type recentlyJoinedUsersAction = {
    type: string;
    data: {
        channelID: string;
        userID: string;
    };
}

const recentlyJoinedUsers = (state: recentlyJoinedUsersState = {}, action: recentlyJoinedUsersAction) => {
    switch (action.type) {
    case UNINIT:
        return {};
    case USER_JOINED:
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
    case USER_LEFT:
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

const clientConnecting = (state = false, action: { type: string, data: boolean }) => {
    switch (action.type) {
    case UNINIT:
        return false;
    case CLIENT_CONNECTING:
        return action.data;
    default:
        return state;
    }
};

type hostControlNoticeAction = {
    type: string;
    data: HostControlNotice;
}

type hostControlNoticeTimeoutAction = {
    type: string;
    data: HostControlNoticeTimeout;
}

export type hostControlNoticeState = {
    [callID: string]: HostControlNotice[];
}

const addHostControlNotice = (notices: HostControlNotice[] | undefined,
    notice: HostControlNotice) => {
    const ret = notices?.length ? [...notices] : [];
    ret.push(notice);
    return ret;
};

const removeHostControlNotice = (notices: HostControlNotice[], noticeID: string) => {
    return notices.filter((n) => n.noticeID !== noticeID);
};

const hostControlNotices = (state: hostControlNoticeState = {},
    action: hostControlNoticeAction | hostControlNoticeTimeoutAction) => {
    switch (action.type) {
    case HOST_CONTROL_NOTICE: {
        const data = action.data as HostControlNotice;
        return {
            ...state,
            [data.callID]: addHostControlNotice(state[data.callID], data),
        };
    }
    case HOST_CONTROL_NOTICE_TIMEOUT_EVENT: {
        const data = action.data as HostControlNoticeTimeout;
        return {
            ...state,
            [data.callID]: removeHostControlNotice(state[data.callID], data.noticeID),
        };
    }
    default:
        return state;
    }
};

export default combineReducers({
    channels,
    clientStateReducer,
    reactions,
    sessions,
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
    callLiveCaptionsState,
    recentlyJoinedUsers,
    incomingCalls,
    ringingForCalls,
    didRingForCalls,
    didNotifyForCalls,
    dismissedCalls,
    liveCaptions,
    clientConnecting,
    hostControlNotices,
});
