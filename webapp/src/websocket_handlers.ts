// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

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
    UserVideoOnOffData,
    UserVoiceOnOffData,
} from '@mattermost/calls-common/lib/types';
import {WebSocketMessage} from '@mattermost/client/websocket';
import {getChannel} from 'mattermost-redux/selectors/entities/channels';
import {getCurrentUserId, getUser} from 'mattermost-redux/selectors/entities/users';
import {generateId} from 'mattermost-redux/utils/helpers';
import {
    callEnd,
    displayCallErrorModal,
    incomingCallOnChannel,
    joinUser,
    leaveUser,
    loadCallState,
    removeIncomingCallNotification,
} from 'src/actions';
import {userLeftChannelErr, userRemovedFromChannelErr} from 'src/clients/calls';
import {HostRemovedYouFromCallErr} from 'src/components/error_modal/error_messages';
import {
    HOST_CONTROL_NOTICE_TIMEOUT,
    JOB_TYPE_CAPTIONING,
    JOB_TYPE_RECORDING,
    LIVE_CAPTION_TIMEOUT,
    REACTION_TIMEOUT_IN_REACTION_STREAM,
} from 'src/constants';
import {userScreenShared, userScreenUnshared} from 'src/state/screen_sharing_ids/actions';
import {userLoweredHand, userMuted, userRaisedHand, userReacted, userReactedTimeout, userUnmuted} from 'src/state/sessions/actions';
import {
    HostControlNotice,
    HostControlNoticeType,
} from 'src/types/types';

import {
    CALL_HOST,
    CALL_LIVE_CAPTIONS_STATE,
    CALL_RECORDING_STATE,
    DISMISS_CALL,
    HOST_CONTROL_NOTICE,
    HOST_CONTROL_NOTICE_TIMEOUT_EVENT,
    LIVE_CAPTION,
    LIVE_CAPTION_TIMEOUT_EVENT,
} from './action_types';
import {logErr} from './log';
import {
    channelIDForCurrentCall,
    profilesInCurrentCallMap,
    ringingEnabled,
} from './selectors';
import {activeCallRegistered} from './state/active_calls/actions';
import {Store} from './types/mattermost-webapp';
import {
    followThread,
    getCallsClient,
    getUserDisplayName,
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

    store.dispatch(
        activeCallRegistered(channelID, {
            callID: ev.data.id,
            startAt: ev.data.start_at,
            ownerID: ev.data.owner_id,
            threadID: ev.data.thread_id,
        }));
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
    store.dispatch(leaveUser(channelID, ev.data.user_id, ev.data.session_id));
}

// NOTE: it's important this function is kept synchronous in order to guarantee the order of
// state mutating operations.
export function handleUserJoined(store: Store, ev: WebSocketMessage<UserJoinedData>) {
    const userID = ev.data.user_id;
    const channelID = ev.data.channelID || ev.broadcast.channel_id;
    const sessionID = ev.data.session_id;
    store.dispatch(joinUser(channelID, userID, sessionID, false));
}

// NOTE: it's important this function is kept synchronous in order to guarantee the order of
// state mutating operations.
export function handleUserMuted(store: Store, ev: WebSocketMessage<UserMutedUnmutedData>) {
    const channelID = ev.data.channelID || ev.broadcast.channel_id;
    store.dispatch(userMuted(channelID, ev.data.session_id, ev.data.userID));
}

// NOTE: it's important this function is kept synchronous in order to guarantee the order of
// state mutating operations.
export function handleUserUnmuted(store: Store, ev: WebSocketMessage<UserMutedUnmutedData>) {
    const channelID = ev.data.channelID || ev.broadcast.channel_id;
    store.dispatch(userUnmuted(channelID, ev.data.session_id, ev.data.userID));
}

export function handleUserVoiceOn(store: Store, ev: WebSocketMessage<UserVoiceOnOffData>) {
    const channelID = ev.data.channelID || ev.broadcast.channel_id;
    store.dispatch({
        type: 'USER_VOICE_ON',
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
        type: 'USER_VOICE_OFF',
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
    store.dispatch(userScreenShared(channelID, ev.data.session_id, ev.data.userID));
}

// NOTE: it's important this function is kept synchronous in order to guarantee the order of
// state mutating operations.
export function handleUserScreenOff(store: Store, ev: WebSocketMessage<UserScreenOnOffData>) {
    const channelID = ev.data.channelID || ev.broadcast.channel_id;
    store.dispatch(userScreenUnshared(channelID, ev.data.session_id, ev.data.userID));
}

// NOTE: it's important this function is kept synchronous in order to guarantee the order of
// state mutating operations.
export function handleUserRaisedHand(store: Store, ev: WebSocketMessage<UserRaiseUnraiseHandData>) {
    const channelID = ev.data.channelID || ev.broadcast.channel_id;
    store.dispatch(userRaisedHand(channelID, ev.data.session_id, ev.data.userID, ev.data.raised_hand));
}

// NOTE: it's important this function is kept synchronous in order to guarantee the order of
// state mutating operations.
export function handleUserUnraisedHand(store: Store, ev: WebSocketMessage<UserRaiseUnraiseHandData>) {
    const channelID = ev.data.channelID || ev.broadcast.channel_id;
    store.dispatch(userLoweredHand(channelID, ev.data.session_id, ev.data.userID));
}

// dispatchReaction stores a reaction (with the sender's display name resolved from the
// current call's profiles) in Redux and schedules its removal after the standard timeout.
// Shared by the plugin-WS handler and the LiveKit data-message bridge so both transports
// produce identical state.
export function dispatchReaction(store: Store, channelID: string, data: UserReactionData) {
    if (channelIDForCurrentCall(store.getState()) !== channelID) {
        return;
    }

    const profiles = profilesInCurrentCallMap(store.getState());
    const displayName = getUserDisplayName(profiles[data.user_id]);
    const reaction: Reaction = {
        ...data,
        displayName,
    };
    store.dispatch(userReacted(channelID, data.user_id, data.session_id, reaction));
    setTimeout(() => {
        store.dispatch(userReactedTimeout(channelID, data.user_id, data.session_id, reaction));
    }, REACTION_TIMEOUT_IN_REACTION_STREAM);
}

export function handleUserReaction(store: Store, ev: WebSocketMessage<UserReactionData>) {
    const channelID = ev.data.channelID || ev.broadcast.channel_id;
    dispatchReaction(store, channelID, ev.data);
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
        const errorMessage = removerUserID === currentUserID ? userLeftChannelErr : userRemovedFromChannelErr;
        store.dispatch(displayCallErrorModal(errorMessage, channelID));
        getCallsClient()?.disconnect();
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

    const hostID = ev.data.host_id;
    const hostProfile = profilesInCurrentCallMap(store.getState())[hostID] || getUser(store.getState(), hostID);
    if (!hostProfile) {
        return;
    }

    const displayName = getUserDisplayName(hostProfile);

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
        store.dispatch(displayCallErrorModal(HostRemovedYouFromCallErr, channelID));
        getCallsClient()?.disconnect();
        return;
    }

    const userID = ev.data.user_id;
    const userProfile = profilesInCurrentCallMap(store.getState())[userID] || getUser(store.getState(), userID);
    if (!userProfile) {
        return;
    }

    const displayName = getUserDisplayName(userProfile);

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

export function handleUserVideoOn(store: Store, ev: WebSocketMessage<UserVideoOnOffData>) {
    const channelID = ev.data.channelID || ev.broadcast.channel_id;
    store.dispatch({
        type: 'USER_VIDEO_ON',
        data: {
            channelID,
            userID: ev.data.userID,
            session_id: ev.data.session_id,
        },
    });
}

export function handleUserVideoOff(store: Store, ev: WebSocketMessage<UserVideoOnOffData>) {
    const channelID = ev.data.channelID || ev.broadcast.channel_id;
    store.dispatch({
        type: 'USER_VIDEO_OFF',
        data: {
            channelID,
            userID: ev.data.userID,
            session_id: ev.data.session_id,
        },
    });
}
