// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {CallJobState, EmojiData} from '@mattermost/calls-common/lib/types';
import {joinUser, leaveUser, loadCallState} from 'src/actions';
import CallClient, {CALL_EVENT, CameraState} from 'src/clients/call';
import type {ScreenSharingSession} from 'src/clients/call/types';
import {applyCallHostChanged} from 'src/host_change';
import {trackSIPCallStatus} from 'src/phone_call';
import {getCallIDForChannel} from 'src/selectors';
import {userCameraChanged} from 'src/state/camera_on_ids/actions';
import {userScreenShared, userScreenUnshared} from 'src/state/screen_sharing_ids/actions';
import {screenSharingSessionForCurrentCall} from 'src/state/screen_sharing_ids/selectors';
import {userLoweredHand, userMuted, userRaisedHand, usersVoiceActivityChanged, userUnmuted} from 'src/state/session/actions';
import {Store} from 'src/types/mattermost-webapp';
import {PhoneCallState} from 'src/types/types';
import {applyCallJobState, dispatchCaption, dispatchReaction} from 'src/websocket_handlers';

export type CallStoreSyncOptions = {

    // Read when each event arrives. Defaults to the client being synced.
    getClient?: () => CallClient | undefined;

    // Participants, hands, reactions, host and screen sharing.
    roomState?: boolean;
    captions?: boolean;

    // The join snapshot, recording and caption jobs, and the phone leg.
    callState?: boolean;

    // Ends screen sharing for the sharer the store knows, rather than for no session.
    unshareStoreSharer?: boolean;
};

type Handler<A extends unknown[]> = (...args: A) => void;

/**
 * Mirrors a call client's events into a Redux store. Mute and camera changes always sync;
 * the options turn off groups a window gets from elsewhere. Returns a function that stops syncing.
 */
export function syncCallClientToStore(client: CallClient, store: Pick<Store, 'dispatch' | 'getState'>, {
    getClient = () => client,
    roomState = true,
    captions = true,
    callState = true,
    unshareStoreSharer = true,
}: CallStoreSyncOptions = {}): () => void {
    const unsubscribers: Array<() => void> = [];
    const listen = <A extends unknown[]>(event: string, handler: Handler<A>) => {
        client.on(event, handler);
        unsubscribers.push(() => client.off(event, handler));
    };
    const channelID = () => getClient()?.channelID ?? '';

    listen(CALL_EVENT.MUTE, (session: string, userID: string) => {
        store.dispatch(userMuted(channelID(), session, userID));
    });
    listen(CALL_EVENT.UNMUTE, (session: string, userID: string) => {
        store.dispatch(userUnmuted(channelID(), session, userID));
    });
    listen(CALL_EVENT.CAMERA_CHANGED, (session: string, userID: string, cameraState: CameraState) => {
        store.dispatch(userCameraChanged(channelID(), session, userID, cameraState));
    });

    if (roomState) {
        listen(CALL_EVENT.USERS_VOICE_ACTIVITY_CHANGED, (sessionIDs: string[], userIDs: string[]) => {
            store.dispatch(usersVoiceActivityChanged(channelID(), sessionIDs, userIDs));
        });
        listen(CALL_EVENT.USER_JOINED, (session: string, userID: string, isFromInitialSync?: boolean) => {
            store.dispatch(joinUser(channelID(), userID, session, Boolean(isFromInitialSync)));
        });
        listen(CALL_EVENT.USER_LEFT, (session: string, userID: string) => {
            store.dispatch(leaveUser(channelID(), userID, session));
        });
        listen(CALL_EVENT.RAISE_HAND, (session: string, userID: string, raisedHandTimestamp: number) => {
            store.dispatch(userRaisedHand(channelID(), session, userID, raisedHandTimestamp));
        });
        listen(CALL_EVENT.LOWER_HAND, (session: string, userID: string) => {
            store.dispatch(userLoweredHand(channelID(), session, userID));
        });
        listen(CALL_EVENT.REACTION, (session: string, userID: string, emoji: EmojiData, timestamp: number) => {
            dispatchReaction(store, channelID(), {user_id: userID, session_id: session, emoji, timestamp});
        });

        // Host and job state arrive over LiveKit room metadata. Observers still get them over
        // the main WebSocket, which is why the server publishes both.
        listen(CALL_EVENT.HOST_CHANGED, (hostID: string) => {
            const callChannelID = channelID();
            applyCallHostChanged(store, callChannelID, hostID, getCallIDForChannel(store.getState(), callChannelID));
        });
        listen(CALL_EVENT.SCREEN_SHARING_CHANGED, (session: ScreenSharingSession | null) => {
            const callChannelID = channelID();
            if (session) {
                store.dispatch(userScreenShared(callChannelID, session.sessionID, session.userID));
            } else {
                const sharerSessionID = unshareStoreSharer ? screenSharingSessionForCurrentCall(store.getState())?.session_id ?? '' : '';
                store.dispatch(userScreenUnshared(callChannelID, sharerSessionID, ''));
            }
        });
    }

    if (captions) {
        listen(CALL_EVENT.CAPTION, (session: string, userID: string, text: string) => {
            dispatchCaption(store, channelID(), userID, session, text);
        });
    }

    if (callState) {
        // The snapshot returned by the join request.
        listen(CALL_EVENT.CALL_STATE, (state: PhoneCallState) => {
            store.dispatch(loadCallState(channelID(), state));
        });

        // Keyed on the channel ID, matching the callID the server sends on the call_job_state broadcast.
        listen(CALL_EVENT.JOB_STATE, (jobState: CallJobState) => {
            applyCallJobState(store, channelID(), jobState);
        });
        unsubscribers.push(trackSIPCallStatus(store, client));
    }

    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
}
