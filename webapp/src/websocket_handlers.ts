// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {
    CallHostChangedData,
    CallStartData,
    CallStateData,
    CallState,
    EmptyData,
    UserDismissedNotification,
    UserJoinedData,
    UserLeftData,
    UserMutedUnmutedData,
    UserRemovedData,
} from '@mattermost/calls-common/lib/types';
import {WebSocketMessage} from '@mattermost/client/websocket';
import {getChannel} from 'mattermost-redux/selectors/entities/channels';
import {getCurrentUserId} from 'mattermost-redux/selectors/entities/users';
import {
    callEnd,
    incomingCallOnChannel,
    loadCallState,
    loadProfilesByIdsIfMissing,
    removeIncomingCallNotification,
    userLeft,
} from 'src/actions';
import {JOINED_USER_NOTIFICATION_TIMEOUT} from 'src/constants';

import {
    CALL_HOST,
    CALL_STATE,
    DISMISS_CALL,
    USER_JOINED,
    USER_JOINED_TIMEOUT,
    USER_MUTED,
    USER_UNMUTED,
} from './action_types';
import {logErr} from './log';
import {
    calls,
    channelIDForCurrentCall,
    ringingEnabled,
    shouldPlayJoinUserSound,
} from './selectors';
import {Store} from './types/mattermost-webapp';
import {
    followThread,
    getCallsClient,
    getCallsClientSessionID,
    notificationsStopRinging,
    playSound,
} from './utils';

export function handleCallEnd(store: Store, ev: WebSocketMessage<EmptyData>) {
    const channelID = ev.data.channelID || ev.broadcast.channel_id;
    store.dispatch(callEnd(channelID));
}

export function handleCallState(store: Store, ev: WebSocketMessage<CallStateData>) {
    try {
        const call: CallState = JSON.parse(ev.data.call);
        store.dispatch(loadCallState(ev.data.channel_id, call));
    } catch (err) {
        logErr(err);
    }
}

export function handleCallStart(store: Store, ev: WebSocketMessage<CallStartData>) {
    const channelID = ev.data.channelID || ev.broadcast.channel_id;

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

    if (window.livekitChannelID === channelID) {
        const channel = getChannel(store.getState(), channelID);
        if (channel) {
            followThread(store, channel.id, channel.team_id);
        }
    } else if (ringingEnabled(store.getState())) {
        store.dispatch(incomingCallOnChannel(channelID, ev.data.id, ev.data.owner_id, ev.data.start_at));
    }
}

export function handleUserLeft(store: Store, ev: WebSocketMessage<UserLeftData>) {
    const channelID = ev.data.channelID || ev.broadcast.channel_id;
    store.dispatch(userLeft(channelID, ev.data.user_id, ev.data.session_id));
}

export function handleUserJoined(store: Store, ev: WebSocketMessage<UserJoinedData>) {
    const userID = ev.data.user_id;
    const channelID = ev.data.channelID || ev.broadcast.channel_id;
    const currentUserID = getCurrentUserId(store.getState());
    const sessionID = ev.data.session_id;

    if (window.livekitChannelID === channelID) {
        if (userID === currentUserID) {
            playSound('join_self');
        } else if (shouldPlayJoinUserSound(store.getState())) {
            playSound('join_user');
        }
    }

    if (ringingEnabled(store.getState()) && userID === currentUserID) {
        const callID = calls(store.getState())[channelID]?.ID || '';
        store.dispatch(removeIncomingCallNotification(callID));
        notificationsStopRinging();
    }

    store.dispatch(loadProfilesByIdsIfMissing([userID]));

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

export function handleUserDismissedNotification(store: Store, ev: WebSocketMessage<UserDismissedNotification>) {
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

export function handleUserRemovedFromChannel(store: Store, ev: WebSocketMessage<UserRemovedData>) {
    const channelID = ev.data.channel_id || ev.broadcast.channel_id;
    const currentUserID = getCurrentUserId(store.getState());
    const removedUserID = ev.data.user_id || ev.broadcast.user_id;

    if (removedUserID === currentUserID && channelID === channelIDForCurrentCall(store.getState())) {
        // Signal the popup to disconnect via BroadcastChannel
        const bc = new BroadcastChannel('calls_livekit');
        bc.postMessage({type: 'disconnect'});
        bc.close();
    }
}
