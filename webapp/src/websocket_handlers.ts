import {
    CallHostChangedData,
    CallRecordingStateData,
    EmptyData,
    Reaction,
    UserJoinedData,
    UserLeftData,
    UserDismissedNotification,
    UserMutedUnmutedData,
    UserRaiseUnraiseHandData,
    UserReactionData,
    UserScreenOnOffData,
    UserVoiceOnOffData,
    CallStartData,
    CallStateData,
    CallState,
} from '@calls/common/lib/types';

import {WebSocketMessage} from '@mattermost/client/websocket';
import {getChannel} from 'mattermost-redux/selectors/entities/channels';
import {getCurrentUserId} from 'mattermost-redux/selectors/entities/users';
import {incomingCallOnChannel, removeIncomingCallNotification, userLeft, loadCallState} from 'src/actions';
import {JOINED_USER_NOTIFICATION_TIMEOUT, REACTION_TIMEOUT_IN_REACTION_STREAM} from 'src/constants';

import {
    USER_MUTED,
    USER_UNMUTED,
    USER_JOINED,
    PROFILE_JOINED,
    CALL_STATE,
    CALL_END,
    USER_VOICE_ON,
    USER_VOICE_OFF,
    USER_SCREEN_ON,
    USER_SCREEN_OFF,
    USER_RAISE_HAND,
    USER_LOWER_HAND,
    USER_REACTED,
    USER_REACTED_TIMEOUT,
    CALL_HOST,
    CALL_RECORDING_STATE,
    USER_JOINED_TIMEOUT,
    DISMISS_CALL,
} from './action_types';
import {logErr} from './log';
import {
    channelIDForCurrentCall,
    profilesInCurrentCallMap,
    ringingEnabled,
    shouldPlayJoinUserSound,
    calls,
} from './selectors';
import {Store} from './types/mattermost-webapp';
import {
    getProfilesByIds,
    playSound,
    followThread,
    getUserDisplayName,
    getCallsClient,
    notificationsStopRinging,
} from './utils';

export function handleCallEnd(store: Store, ev: WebSocketMessage<EmptyData>) {
    const channelID = ev.data.channelID || ev.broadcast.channel_id;
    if (channelIDForCurrentCall(store.getState()) === channelID) {
        window.callsClient?.disconnect();
    }

    store.dispatch({
        type: CALL_END,
        data: {
            channelID,
        },
    });

    if (ringingEnabled(store.getState())) {
        const callID = calls(store.getState())[channelID].ID || '';
        store.dispatch(removeIncomingCallNotification(callID));
    }
}

export async function handleCallState(store: Store, ev: WebSocketMessage<CallStateData>) {
    try {
        const call: CallState = JSON.parse(ev.data.call);
        await store.dispatch(loadCallState(ev.data.channel_id, call));
    } catch (err) {
        logErr(err);
    }
}

export function handleCallStart(store: Store, ev: WebSocketMessage<CallStartData>) {
    const channelID = ev.data.channelID || ev.broadcast.channel_id;

    // Clear the old recording state (if any).
    store.dispatch({
        type: CALL_RECORDING_STATE,
        data: {
            callID: channelID,
            recState: null,
        },
    });
    store.dispatch({
        type: CALL_STATE,
        data: {
            ID: ev.data.id,
            channelID,
            startAt: ev.data.start_at,
            ownerID: ev.data.owner_id,
            hostID: ev.data.host_id,
            threadID: ev.data.thread_id,
        },
    });
    store.dispatch({
        type: CALL_HOST,
        data: {
            channelID,
            hostID: ev.data.host_id,
            hostChangeAt: ev.data.start_at,
        },
    });

    if (getCallsClient()?.channelID === channelID) {
        const channel = getChannel(store.getState(), channelID);
        if (channel) {
            followThread(store, channel.id, channel.team_id);
        }
    } else if (ringingEnabled(store.getState())) {
        // the call that started is not the call we're currently in.
        store.dispatch(incomingCallOnChannel(channelID, ev.data.id, ev.data.owner_id, ev.data.start_at));
    }
}

export function handleUserLeft(store: Store, ev: WebSocketMessage<UserLeftData>) {
    const channelID = ev.data.channelID || ev.broadcast.channel_id;

    store.dispatch(userLeft(channelID, ev.data.user_id, ev.data.session_id));
}

export async function handleUserJoined(store: Store, ev: WebSocketMessage<UserJoinedData>) {
    const userID = ev.data.user_id;
    const channelID = ev.data.channelID || ev.broadcast.channel_id;
    const currentUserID = getCurrentUserId(store.getState());
    const sessionID = ev.data.session_id;

    if (window.callsClient?.channelID === channelID) {
        if (userID === currentUserID) {
            playSound('join_self');
        } else if (shouldPlayJoinUserSound(store.getState())) {
            playSound('join_user');
        }
    }

    if (ringingEnabled(store.getState()) && userID === currentUserID) {
        const callID = calls(store.getState())[channelID].ID || '';
        store.dispatch(removeIncomingCallNotification(callID));
        notificationsStopRinging(); // And stop ringing for _any_ incoming call.
    }

    store.dispatch({
        type: USER_JOINED,
        data: {
            channelID,
            userID,
            currentUserID,
            session_id: sessionID,
        },
    });

    setTimeout(() => {
        store.dispatch({
            type: USER_JOINED_TIMEOUT,
            data: {
                channelID,
                userID,
            },
        });
    }, JOINED_USER_NOTIFICATION_TIMEOUT);

    try {
        store.dispatch({
            type: PROFILE_JOINED,
            data: {
                profile: (await getProfilesByIds(store.getState(), [userID]))[0],
                session_id: sessionID,
                channelID,
            },
        });
    } catch (err) {
        logErr(err);
    }
}

export function handleUserMuted(store: Store, ev: WebSocketMessage<UserMutedUnmutedData>) {
    const channelID = ev.data.channelID || ev.broadcast.channel_id;
    store.dispatch({
        type: USER_MUTED,
        data: {
            channelID,
            userID: ev.data.userID,
            session_id: ev.data.session_id,
        },
    });
}

export function handleUserUnmuted(store: Store, ev: WebSocketMessage<UserMutedUnmutedData>) {
    const channelID = ev.data.channelID || ev.broadcast.channel_id;
    store.dispatch({
        type: USER_UNMUTED,
        data: {
            channelID,
            userID: ev.data.userID,
            session_id: ev.data.session_id,
        },
    });
}

export function handleUserVoiceOn(store: Store, ev: WebSocketMessage<UserVoiceOnOffData>) {
    const channelID = ev.data.channelID || ev.broadcast.channel_id;
    store.dispatch({
        type: USER_VOICE_ON,
        data: {
            channelID,
            userID: ev.data.userID,
            session_id: ev.data.session_id,
        },
    });
}

export function handleUserVoiceOff(store: Store, ev: WebSocketMessage<UserVoiceOnOffData>) {
    const channelID = ev.data.channelID || ev.broadcast.channel_id;
    store.dispatch({
        type: USER_VOICE_OFF,
        data: {
            channelID,
            userID: ev.data.userID,
            session_id: ev.data.session_id,
        },
    });
}

export function handleUserScreenOn(store: Store, ev: WebSocketMessage<UserScreenOnOffData>) {
    const channelID = ev.data.channelID || ev.broadcast.channel_id;
    store.dispatch({
        type: USER_SCREEN_ON,
        data: {
            channelID,
            userID: ev.data.userID,
            session_id: ev.data.session_id,
        },
    });
}

export function handleUserScreenOff(store: Store, ev: WebSocketMessage<UserScreenOnOffData>) {
    const channelID = ev.data.channelID || ev.broadcast.channel_id;
    store.dispatch({
        type: USER_SCREEN_OFF,
        data: {
            channelID,
            userID: ev.data.userID,
            session_id: ev.data.session_id,
        },
    });
}

export function handleUserRaisedHand(store: Store, ev: WebSocketMessage<UserRaiseUnraiseHandData>) {
    const channelID = ev.data.channelID || ev.broadcast.channel_id;
    store.dispatch({
        type: USER_RAISE_HAND,
        data: {
            channelID,
            userID: ev.data.userID,
            raised_hand: ev.data.raised_hand,
            session_id: ev.data.session_id,
        },
    });
}

export function handleUserUnraisedHand(store: Store, ev: WebSocketMessage<UserRaiseUnraiseHandData>) {
    const channelID = ev.data.channelID || ev.broadcast.channel_id;
    store.dispatch({
        type: USER_LOWER_HAND,
        data: {
            channelID,
            userID: ev.data.userID,
            raised_hand: ev.data.raised_hand,
            session_id: ev.data.session_id,
        },
    });
}

export function handleUserReaction(store: Store, ev: WebSocketMessage<UserReactionData>) {
    const channelID = ev.data.channelID || ev.broadcast.channel_id;

    if (channelIDForCurrentCall(store.getState()) !== channelID) {
        return;
    }

    const profiles = profilesInCurrentCallMap(store.getState());
    const displayName = getUserDisplayName(profiles[ev.data.user_id]);
    const reaction: Reaction = {
        ...ev.data,
        displayName,
    };
    store.dispatch({
        type: USER_REACTED,
        data: {
            channelID,
            userID: ev.data.user_id,
            reaction,
            session_id: ev.data.session_id,
        },
    });
    setTimeout(() => {
        store.dispatch({
            type: USER_REACTED_TIMEOUT,
            data: {
                channelID,
                userID: ev.data.user_id,
                reaction,
                session_id: ev.data.session_id,
            },
        });
    }, REACTION_TIMEOUT_IN_REACTION_STREAM);
}

export function handleCallHostChanged(store: Store, ev: WebSocketMessage<CallHostChangedData>) {
    const channelID = ev.data.channelID || ev.broadcast.channel_id;

    store.dispatch({
        type: CALL_HOST,
        data: {
            channelID,
            hostID: ev.data.hostID,
            hostChangeAt: Date.now(),
        },
    });
}

export function handleCallRecordingState(store: Store, ev: WebSocketMessage<CallRecordingStateData>) {
    if (ev.data.recState.err) {
        ev.data.recState.error_at = Date.now();
    }

    store.dispatch({
        type: CALL_RECORDING_STATE,
        data: {
            callID: ev.data.callID,
            recState: ev.data.recState,
        },
    });
}

export function handleUserDismissedNotification(store: Store, ev: WebSocketMessage<UserDismissedNotification>) {
    // For now we are only handling our own dismissed (and that's all we should be receiving).
    const userID = getCurrentUserId(store.getState());
    if (ev.data.userID !== userID) {
        return;
    }
    store.dispatch(removeIncomingCallNotification(ev.data.callID));
    store.dispatch({
        type: DISMISS_CALL,
        data: {
            callID: ev.data.callID,
        },
    });
}
