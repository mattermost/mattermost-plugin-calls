import JoinUserSound from './sounds/join_user.mp3';
import JoinSelfSound from './sounds/join_self.mp3';
import LeaveSelfSound from './sounds/leave_self.mp3';

import {Store} from './types/mattermost-webapp';

import {getCurrentUserId} from 'mattermost-redux/selectors/entities/users';

import {
    VOICE_CHANNEL_USER_CONNECTED,
    VOICE_CHANNEL_PROFILE_CONNECTED,
} from './action_types';

import {
    getProfilesByIds,
    getPluginStaticPath,
    playSound,
} from './utils';

import {
    connectedChannelID,
} from './selectors';

import {logErr, logDebug} from './log';

export async function handleUserConnected(store: Store, ev: any) {
    const userID = ev.data.userID;
    const channelID = ev.broadcast.channel_id;
    const currentUserID = getCurrentUserId(store.getState());

    if (window.callsClient?.channelID === channelID) {
        if (userID === currentUserID) {
            playSound(JoinSelfSound);
        } else if (channelID === connectedChannelID(store.getState())) {
            playSound(JoinUserSound);
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
