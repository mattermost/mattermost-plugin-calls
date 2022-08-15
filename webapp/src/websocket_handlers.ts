import {getCurrentUserId} from 'mattermost-redux/selectors/entities/users';
import {getChannel} from 'mattermost-redux/selectors/entities/channels';

import {Store} from './types/mattermost-webapp';

import {
    VOICE_CHANNEL_USER_CONNECTED,
    VOICE_CHANNEL_PROFILE_CONNECTED,
    VOICE_CHANNEL_CALL_START,
    VOICE_CHANNEL_ROOT_POST,
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
