import {getCurrentUserId} from 'mattermost-redux/selectors/entities/users';
import {getChannel} from 'mattermost-redux/selectors/entities/channels';
import {WebSocketMessage} from '@mattermost/types/websocket';

import {
    CallHostChangedData,
    CallRecordingStateData,
    CallStartData,
    EmptyData,
    Reaction,
    UserConnectedData,
    UserDisconnectedData,
    UserDismissedNotification,
    UserMutedUnmutedData,
    UserRaiseUnraiseHandData,
    UserReactionData,
    UserScreenOnOffData,
    UserVoiceOnOffData,
} from '@calls/common/lib/types';

import {incomingCallOnChannel, removeIncomingCallNotification, userDisconnected} from 'src/actions';

import {JOINED_USER_NOTIFICATION_TIMEOUT, REACTION_TIMEOUT_IN_REACTION_STREAM} from 'src/constants';
import {notificationSounds} from 'src/webapp_globals';

import {Store} from './types/mattermost-webapp';
import {
    VOICE_CHANNEL_USER_MUTED,
    VOICE_CHANNEL_USER_UNMUTED,
    VOICE_CHANNEL_USER_CONNECTED,
    VOICE_CHANNEL_PROFILE_CONNECTED,
    VOICE_CHANNEL_CALL_START,
    VOICE_CHANNEL_CALL_END,
    VOICE_CHANNEL_ROOT_POST,
    VOICE_CHANNEL_USER_VOICE_ON,
    VOICE_CHANNEL_USER_VOICE_OFF,
    VOICE_CHANNEL_USER_SCREEN_ON,
    VOICE_CHANNEL_USER_SCREEN_OFF,
    VOICE_CHANNEL_USER_RAISE_HAND,
    VOICE_CHANNEL_USER_UNRAISE_HAND,
    VOICE_CHANNEL_USER_REACTED,
    VOICE_CHANNEL_USER_REACTED_TIMEOUT,
    VOICE_CHANNEL_CALL_HOST,
    VOICE_CHANNEL_CALL_RECORDING_STATE,
    VOICE_CHANNEL_USER_JOINED_TIMEOUT,
    DISMISS_CALL,
} from './action_types';
import {
    getProfilesByIds,
    playSound,
    followThread,
    getUserDisplayName,
    getCallsClient,
} from './utils';
import {
    connectedChannelID,
    idToProfileInConnectedChannel,
    ringingEnabled,
    shouldPlayJoinUserSound,
    voiceChannelCalls,
} from './selectors';

import {logErr} from './log';

export function handleCallEnd(store: Store, ev: WebSocketMessage<EmptyData>) {
    const channelID = ev.data.channelID || ev.broadcast.channel_id;
    if (connectedChannelID(store.getState()) === channelID) {
        window.callsClient?.disconnect();
    }

    store.dispatch({
        type: VOICE_CHANNEL_CALL_END,
        data: {
            channelID,
        },
    });

    if (ringingEnabled(store.getState())) {
        const callID = voiceChannelCalls(store.getState())[channelID].ID || '';
        store.dispatch(removeIncomingCallNotification(callID));
    }
}

export function handleCallStart(store: Store, ev: WebSocketMessage<CallStartData>) {
    const channelID = ev.data.channelID || ev.broadcast.channel_id;

    // Clear the old recording state (if any).
    store.dispatch({
        type: VOICE_CHANNEL_CALL_RECORDING_STATE,
        data: {
            callID: channelID,
            recState: null,
        },
    });
    store.dispatch({
        type: VOICE_CHANNEL_CALL_START,
        data: {
            ID: ev.data.id,
            channelID,
            startAt: ev.data.start_at,
            ownerID: ev.data.owner_id,
            hostID: ev.data.host_id,
        },
    });
    store.dispatch({
        type: VOICE_CHANNEL_ROOT_POST,
        data: {
            channelID,
            rootPost: ev.data.thread_id,
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

export function handleUserDisconnected(store: Store, ev: WebSocketMessage<UserDisconnectedData>) {
    const channelID = ev.data.channelID || ev.broadcast.channel_id;

    store.dispatch(userDisconnected(channelID, ev.data.userID));
}

export async function handleUserConnected(store: Store, ev: WebSocketMessage<UserConnectedData>) {
    const userID = ev.data.userID;
    const channelID = ev.data.channelID || ev.broadcast.channel_id;
    const currentUserID = getCurrentUserId(store.getState());

    if (window.callsClient?.channelID === channelID) {
        if (userID === currentUserID) {
            playSound('join_self');
        } else if (shouldPlayJoinUserSound(store.getState())) {
            playSound('join_user');
        }
    }

    if (ringingEnabled(store.getState()) && userID === currentUserID) {
        const callID = voiceChannelCalls(store.getState())[channelID].ID || '';
        store.dispatch(removeIncomingCallNotification(callID));
        notificationSounds?.stopRing(); // And stop ringing for _any_ incoming call.
    }

    store.dispatch({
        type: VOICE_CHANNEL_USER_CONNECTED,
        data: {
            channelID,
            userID,
            currentUserID,
        },
    });

    setTimeout(() => {
        store.dispatch({
            type: VOICE_CHANNEL_USER_JOINED_TIMEOUT,
            data: {
                channelID,
                userID,
            },
        });
    }, JOINED_USER_NOTIFICATION_TIMEOUT);

    try {
        store.dispatch({
            type: VOICE_CHANNEL_PROFILE_CONNECTED,
            data: {
                profile: (await getProfilesByIds(store.getState(), [ev.data.userID]))[0],
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
        type: VOICE_CHANNEL_USER_MUTED,
        data: {
            channelID,
            userID: ev.data.userID,
        },
    });
}

export function handleUserUnmuted(store: Store, ev: WebSocketMessage<UserMutedUnmutedData>) {
    const channelID = ev.data.channelID || ev.broadcast.channel_id;
    store.dispatch({
        type: VOICE_CHANNEL_USER_UNMUTED,
        data: {
            channelID,
            userID: ev.data.userID,
        },
    });
}

export function handleUserVoiceOn(store: Store, ev: WebSocketMessage<UserVoiceOnOffData>) {
    const channelID = ev.data.channelID || ev.broadcast.channel_id;
    store.dispatch({
        type: VOICE_CHANNEL_USER_VOICE_ON,
        data: {
            channelID,
            userID: ev.data.userID,
        },
    });
}

export function handleUserVoiceOff(store: Store, ev: WebSocketMessage<UserVoiceOnOffData>) {
    const channelID = ev.data.channelID || ev.broadcast.channel_id;
    store.dispatch({
        type: VOICE_CHANNEL_USER_VOICE_OFF,
        data: {
            channelID,
            userID: ev.data.userID,
        },
    });
}

export function handleUserScreenOn(store: Store, ev: WebSocketMessage<UserScreenOnOffData>) {
    const channelID = ev.data.channelID || ev.broadcast.channel_id;
    store.dispatch({
        type: VOICE_CHANNEL_USER_SCREEN_ON,
        data: {
            channelID,
            userID: ev.data.userID,
        },
    });
}

export function handleUserScreenOff(store: Store, ev: WebSocketMessage<UserScreenOnOffData>) {
    const channelID = ev.data.channelID || ev.broadcast.channel_id;
    store.dispatch({
        type: VOICE_CHANNEL_USER_SCREEN_OFF,
        data: {
            channelID,
            userID: ev.data.userID,
        },
    });
}

export function handleUserRaisedHand(store: Store, ev: WebSocketMessage<UserRaiseUnraiseHandData>) {
    const channelID = ev.data.channelID || ev.broadcast.channel_id;
    store.dispatch({
        type: VOICE_CHANNEL_USER_RAISE_HAND,
        data: {
            channelID,
            userID: ev.data.userID,
            raised_hand: ev.data.raised_hand,
        },
    });
}

export function handleUserUnraisedHand(store: Store, ev: WebSocketMessage<UserRaiseUnraiseHandData>) {
    const channelID = ev.data.channelID || ev.broadcast.channel_id;
    store.dispatch({
        type: VOICE_CHANNEL_USER_UNRAISE_HAND,
        data: {
            channelID,
            userID: ev.data.userID,
            raised_hand: ev.data.raised_hand,
        },
    });
}

export function handleUserReaction(store: Store, ev: WebSocketMessage<UserReactionData>) {
    const channelID = ev.data.channelID || ev.broadcast.channel_id;

    if (connectedChannelID(store.getState()) !== channelID) {
        return;
    }

    const profiles = idToProfileInConnectedChannel(store.getState());
    const displayName = getUserDisplayName(profiles[ev.data.user_id]);
    const reaction: Reaction = {
        ...ev.data,
        displayName,
    };
    store.dispatch({
        type: VOICE_CHANNEL_USER_REACTED,
        data: {
            channelID,
            userID: ev.data.user_id,
            reaction,
        },
    });
    setTimeout(() => {
        store.dispatch({
            type: VOICE_CHANNEL_USER_REACTED_TIMEOUT,
            data: {
                channelID,
                userID: ev.data.user_id,
                reaction,
            },
        });
    }, REACTION_TIMEOUT_IN_REACTION_STREAM);
}

export function handleCallHostChanged(store: Store, ev: WebSocketMessage<CallHostChangedData>) {
    const channelID = ev.data.channelID || ev.broadcast.channel_id;

    store.dispatch({
        type: VOICE_CHANNEL_CALL_HOST,
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
        type: VOICE_CHANNEL_CALL_RECORDING_STATE,
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
