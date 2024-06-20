/* eslint-disable max-lines */

import {
    CallHostChangedData,
    CallJobStateData,
    CallStartData,
    CallState,
    CallStateData,
    EmptyData,
    HostControlLowerHand,
    HostControlMsg,
    HostControlRemoved,
    LiveCaption,
    LiveCaptionData,
    Reaction,
    UserDismissedNotification,
    UserJoinedData,
    UserLeftData,
    UserMutedUnmutedData,
    UserRaiseUnraiseHandData,
    UserReactionData,
    UserRemovedData,
    UserScreenOnOffData,
    UserVoiceOnOffData,
} from '@mattermost/calls-common/lib/types';
import {WebSocketMessage} from '@mattermost/client/websocket';
import {getChannel} from 'mattermost-redux/selectors/entities/channels';
import {getCurrentUserId, getUser} from 'mattermost-redux/selectors/entities/users';
import {generateId} from 'mattermost-redux/utils/helpers';
import {
    callEnd,
    incomingCallOnChannel,
    loadCallState,
    loadProfilesByIdsIfMissing,
    removeIncomingCallNotification,
    userLeft,
} from 'src/actions';
import {userLeftChannelErr, userRemovedFromChannelErr} from 'src/client';
import {hostRemovedMsg} from 'src/components/call_error_modal';
import {
    HOST_CONTROL_NOTICE_TIMEOUT,
    JOB_TYPE_CAPTIONING,
    JOB_TYPE_RECORDING,
    JOINED_USER_NOTIFICATION_TIMEOUT,
    LIVE_CAPTION_TIMEOUT,
    REACTION_TIMEOUT_IN_REACTION_STREAM,
} from 'src/constants';
import {
    HostControlNotice,
    HostControlNoticeType,
} from 'src/types/types';

import {
    CALL_HOST,
    CALL_LIVE_CAPTIONS_STATE,
    CALL_RECORDING_STATE,
    CALL_STATE,
    DISMISS_CALL,
    HOST_CONTROL_NOTICE,
    HOST_CONTROL_NOTICE_TIMEOUT_EVENT,
    LIVE_CAPTION,
    LIVE_CAPTION_TIMEOUT_EVENT,
    USER_JOINED,
    USER_JOINED_TIMEOUT,
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
} from './action_types';
import {logErr} from './log';
import {
    calls,
    channelIDForCurrentCall,
    profilesInCurrentCallMap,
    ringingEnabled,
    shouldPlayJoinUserSound,
} from './selectors';
import {Store} from './types/mattermost-webapp';
import {
    followThread,
    getCallsClient,
    getUserDisplayName,
    notificationsStopRinging,
    playSound,
} from './utils';

// NOTE: it's important this function is kept synchronous in order to guarantee the order of
// state mutating operations.
export function handleCallEnd(store: Store, ev: WebSocketMessage<EmptyData>) {
    const channelID = ev.data.channelID || ev.broadcast.channel_id;
    store.dispatch(callEnd(channelID));
}

// NOTE: it's important this function is kept synchronous in order to guarantee the order of
// state mutating operations.
export function handleCallState(store: Store, ev: WebSocketMessage<CallStateData>) {
    try {
        const call: CallState = JSON.parse(ev.data.call);
        store.dispatch(loadCallState(ev.data.channel_id, call));
    } catch (err) {
        logErr(err);
    }
}

// NOTE: it's important this function is kept synchronous in order to guarantee the order of
// state mutating operations.
export function handleCallStart(store: Store, ev: WebSocketMessage<CallStartData>) {
    const channelID = ev.data.channelID || ev.broadcast.channel_id;

    // Clear the old recording and live captions state (if any).
    store.dispatch({
        type: CALL_RECORDING_STATE,
        data: {
            callID: channelID,
            jobState: null,
        },
    });
    store.dispatch({
        type: CALL_LIVE_CAPTIONS_STATE,
        data: {
            callID: channelID,
            jobState: null,
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

// NOTE: it's important this function is kept synchronous in order to guarantee the order of
// state mutating operations.
export function handleUserLeft(store: Store, ev: WebSocketMessage<UserLeftData>) {
    const channelID = ev.data.channelID || ev.broadcast.channel_id;

    store.dispatch(userLeft(channelID, ev.data.user_id, ev.data.session_id));
}

// NOTE: it's important this function is kept synchronous in order to guarantee the order of
// state mutating operations.
export function handleUserJoined(store: Store, ev: WebSocketMessage<UserJoinedData>) {
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

    // This is async, which is expected as we are okay with setting the state while we wait
    // for any missing user profiles.
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

// NOTE: it's important this function is kept synchronous in order to guarantee the order of
// state mutating operations.
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

// NOTE: it's important this function is kept synchronous in order to guarantee the order of
// state mutating operations.
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

// NOTE: it's important this function is kept synchronous in order to guarantee the order of
// state mutating operations.
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

// NOTE: it's important this function is kept synchronous in order to guarantee the order of
// state mutating operations.
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

// NOTE: it's important this function is kept synchronous in order to guarantee the order of
// state mutating operations.
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

// NOTE: it's important this function is kept synchronous in order to guarantee the order of
// state mutating operations.
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

// NOTE: it's important this function is kept synchronous in order to guarantee the order of
// state mutating operations.
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

    const hostProfile = profilesInCurrentCallMap(store.getState())[ev.data.hostID] ||
        getUser(store.getState(), ev.data.hostID);
    if (!hostProfile) {
        return;
    }
    const displayName = getUserDisplayName(hostProfile);

    const hostNotice: HostControlNotice = {
        type: HostControlNoticeType.HostChanged,
        callID: ev.data.call_id,
        noticeID: generateId(),
        displayName,
        userID: ev.data.hostID,
    };

    store.dispatch({
        type: HOST_CONTROL_NOTICE,
        data: hostNotice,
    });

    setTimeout(() => {
        store.dispatch({
            type: HOST_CONTROL_NOTICE_TIMEOUT_EVENT,
            data: {
                callID: ev.data.call_id,
                noticeID: hostNotice.noticeID,
            },
        });
    }, HOST_CONTROL_NOTICE_TIMEOUT);
}

// NOTE: it's important this function is kept synchronous in order to guarantee the order of
// state mutating operations.
export function handleCallJobState(store: Store, ev: WebSocketMessage<CallJobStateData>) {
    if (ev.data.jobState.err) {
        ev.data.jobState.error_at = Date.now();
    }

    let type = '';
    switch (ev.data.jobState.type) {
    case JOB_TYPE_RECORDING:
        type = CALL_RECORDING_STATE;
        break;
    case JOB_TYPE_CAPTIONING:
        type = CALL_LIVE_CAPTIONS_STATE;
        break;
    }

    store.dispatch({
        type,
        data: {
            callID: ev.data.callID,
            jobState: ev.data.jobState,
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

export function handleUserRemovedFromChannel(store: Store, ev: WebSocketMessage<UserRemovedData>) {
    const channelID = ev.data.channel_id || ev.broadcast.channel_id;
    const currentUserID = getCurrentUserId(store.getState());
    const removedUserID = ev.data.user_id || ev.broadcast.user_id;
    const removerUserID = ev.data.remover_id;

    if (removedUserID === currentUserID && channelID === channelIDForCurrentCall(store.getState())) {
        getCallsClient()?.disconnect(removerUserID === currentUserID ? userLeftChannelErr : userRemovedFromChannelErr);
    }
}

export function handleCaption(store: Store, ev: WebSocketMessage<LiveCaptionData>) {
    const channel_id = ev.data.channel_id;

    if (channelIDForCurrentCall(store.getState()) !== channel_id) {
        return;
    }

    const profiles = profilesInCurrentCallMap(store.getState());
    const display_name = getUserDisplayName(profiles[ev.data.user_id]);
    const caption: LiveCaption = {
        ...ev.data,
        channel_id,
        display_name,
        caption_id: generateId(),
    };
    store.dispatch({
        type: LIVE_CAPTION,
        data: caption,
    });
    setTimeout(() => {
        store.dispatch({
            type: LIVE_CAPTION_TIMEOUT_EVENT,
            data: {
                channel_id,
                session_id: caption.session_id,
                caption_id: caption.caption_id,
            },
        });
    }, LIVE_CAPTION_TIMEOUT);
}

export function handleHostMute(store: Store, ev: WebSocketMessage<HostControlMsg>) {
    const channelID = ev.data.channel_id;
    const client = getCallsClient();
    if (!client || client?.channelID !== channelID) {
        return;
    }

    const sessionID = client.getSessionID();
    if (ev.data.session_id !== sessionID) {
        return;
    }

    client.mute();
}

export function handleHostScreenOff(store: Store, ev: WebSocketMessage<HostControlMsg>) {
    const channelID = ev.data.channel_id;
    const client = getCallsClient();
    if (!client || client?.channelID !== channelID) {
        return;
    }

    const sessionID = client.getSessionID();
    if (ev.data.session_id !== sessionID) {
        return;
    }

    client.unshareScreen();
}

export function handleHostLowerHand(store: Store, ev: WebSocketMessage<HostControlLowerHand>) {
    const channelID = ev.data.channel_id;
    const client = getCallsClient();
    if (!client || client?.channelID !== channelID) {
        return;
    }

    const sessionID = client.getSessionID();
    if (ev.data.session_id !== sessionID) {
        return;
    }

    client.unraiseHand();

    const profiles = profilesInCurrentCallMap(store.getState());
    const displayName = getUserDisplayName(profiles[ev.data.host_id]);

    const hostNotice: HostControlNotice = {
        type: HostControlNoticeType.LowerHand,
        callID: ev.data.call_id,
        noticeID: generateId(),
        displayName,
    };

    // Put the notification on the end of the event loop so that unraiseHand can be processed before
    // we continue. This prevents the "raised hand" and "host has lowered your hand" reaction chips
    // from being shown at the same time.
    setTimeout(() => {
        store.dispatch({
            type: HOST_CONTROL_NOTICE,
            data: hostNotice,
        });
    }, 0);

    setTimeout(() => {
        store.dispatch({
            type: HOST_CONTROL_NOTICE_TIMEOUT_EVENT,
            data: {
                callID: ev.data.call_id,
                noticeID: hostNotice.noticeID,
            },
        });
    }, HOST_CONTROL_NOTICE_TIMEOUT);
}

export function handleHostRemoved(store: Store, ev: WebSocketMessage<HostControlRemoved>) {
    const channelID = ev.data.channel_id;
    const client = getCallsClient();
    if (!client || client?.channelID !== channelID) {
        return;
    }

    const sessionID = client.getSessionID();
    if (ev.data.session_id === sessionID) {
        getCallsClient()?.disconnect(new Error(hostRemovedMsg));
        return;
    }

    const profile = profilesInCurrentCallMap(store.getState())[ev.data.user_id] ||
        getUser(store.getState(), ev.data.user_id);
    if (!profile) {
        return;
    }

    const displayName = getUserDisplayName(profile);

    const hostNotice: HostControlNotice = {
        type: HostControlNoticeType.HostRemoved,
        callID: ev.data.call_id,
        noticeID: generateId(),
        displayName,
    };

    store.dispatch({
        type: HOST_CONTROL_NOTICE,
        data: hostNotice,
    });

    setTimeout(() => {
        store.dispatch({
            type: HOST_CONTROL_NOTICE_TIMEOUT_EVENT,
            data: {
                callID: ev.data.call_id,
                noticeID: hostNotice.noticeID,
            },
        });
    }, HOST_CONTROL_NOTICE_TIMEOUT);
}
