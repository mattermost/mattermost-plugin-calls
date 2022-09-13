import {getCurrentUserId} from 'mattermost-redux/selectors/entities/users';
import {getChannel} from 'mattermost-redux/selectors/entities/channels';

import {Store} from './types/mattermost-webapp';

import {
    VOICE_CHANNEL_USER_MUTED,
    VOICE_CHANNEL_USER_UNMUTED,
    VOICE_CHANNEL_USER_CONNECTED,
    VOICE_CHANNEL_USER_DISCONNECTED,
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
} from './action_types';

import {
    getProfilesByIds,
    getPluginStaticPath,
    playSound,
    followThread,
} from './utils';

import {
    connectedChannelID,
} from './selectors';

import {logErr, logDebug} from './log';

export function handleCallEnd(store: Store, ev: any) {
    if (connectedChannelID(store.getState()) === ev.broadcast.channel_id) {
        window.callsClient?.disconnect();
    }
    store.dispatch({
        type: VOICE_CHANNEL_CALL_END,
        data: {
            channelID: ev.broadcast.channel_id,
        },
    });
}

export function handleCallStart(store: Store, ev: any) {
    const channelID = ev.broadcast.channel_id;

    store.dispatch({
        type: VOICE_CHANNEL_CALL_START,
        data: {
            channelID,
            startAt: ev.data.start_at,
            ownerID: ev.data.owner_id,
        },
    });
    store.dispatch({
        type: VOICE_CHANNEL_ROOT_POST,
        data: {
            channelID,
            rootPost: ev.data.thread_id,
        },
    });

    if (window.callsClient?.channelID === channelID) {
        const channel = getChannel(store.getState(), channelID);
        if (channel) {
            followThread(store, channel.id, channel.team_id);
        }
    }
}

export function handleUserDisconnected(store: Store, ev: any) {
    store.dispatch({
        type: VOICE_CHANNEL_USER_DISCONNECTED,
        data: {
            channelID: ev.broadcast.channel_id,
            userID: ev.data.userID,
            currentUserID: getCurrentUserId(store.getState()),
        },
    });
}

export async function handleUserConnected(store: Store, ev: any) {
    const userID = ev.data.userID;
    const channelID = ev.broadcast.channel_id;
    const currentUserID = getCurrentUserId(store.getState());

    if (window.callsClient?.channelID === channelID) {
        if (userID === currentUserID) {
            playSound('join_self');
        } else if (channelID === connectedChannelID(store.getState())) {
            playSound('join_user');
        }
    }

    store.dispatch({
        type: VOICE_CHANNEL_USER_CONNECTED,
        data: {
            channelID,
            userID,
            currentUserID,
        },
    });

    try {
        store.dispatch({
            type: VOICE_CHANNEL_PROFILE_CONNECTED,
            data: {
                profile: (await getProfilesByIds(store.getState(), [ev.data.userID]))[0],
                channelID: ev.broadcast.channel_id,
            },
        });
    } catch (err) {
        logErr(err);
    }
}

export function handleUserMuted(store: Store, ev: any) {
    store.dispatch({
        type: VOICE_CHANNEL_USER_MUTED,
        data: {
            channelID: ev.broadcast.channel_id,
            userID: ev.data.userID,
        },
    });
}

export function handleUserUnmuted(store: Store, ev: any) {
    store.dispatch({
        type: VOICE_CHANNEL_USER_UNMUTED,
        data: {
            channelID: ev.broadcast.channel_id,
            userID: ev.data.userID,
        },
    });
}

export function handleUserVoiceOn(store: Store, ev: any) {
    store.dispatch({
        type: VOICE_CHANNEL_USER_VOICE_ON,
        data: {
            channelID: ev.broadcast.channel_id,
            userID: ev.data.userID,
        },
    });
}

export function handleUserVoiceOff(store: Store, ev: any) {
    store.dispatch({
        type: VOICE_CHANNEL_USER_VOICE_OFF,
        data: {
            channelID: ev.broadcast.channel_id,
            userID: ev.data.userID,
        },
    });
}

export function handleUserScreenOn(store: Store, ev: any) {
    store.dispatch({
        type: VOICE_CHANNEL_USER_SCREEN_ON,
        data: {
            channelID: ev.broadcast.channel_id,
            userID: ev.data.userID,
        },
    });
}

export function handleUserScreenOff(store: Store, ev: any) {
    store.dispatch({
        type: VOICE_CHANNEL_USER_SCREEN_OFF,
        data: {
            channelID: ev.broadcast.channel_id,
            userID: ev.data.userID,
        },
    });
}

export function handleUserRaisedHand(store: Store, ev: any) {
    store.dispatch({
        type: VOICE_CHANNEL_USER_RAISE_HAND,
        data: {
            channelID: ev.broadcast.channel_id,
            userID: ev.data.userID,
            raised_hand: ev.data.raised_hand,
        },
    });
}

export function handleUserUnraisedHand(store: Store, ev: any) {
    store.dispatch({
        type: VOICE_CHANNEL_USER_UNRAISE_HAND,
        data: {
            channelID: ev.broadcast.channel_id,
            userID: ev.data.userID,
            raised_hand: ev.data.raised_hand,
        },
    });
}
