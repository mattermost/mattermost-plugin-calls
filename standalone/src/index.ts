// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import 'mattermost-webapp/sass/styles.scss';
import 'mattermost-webapp/components/widgets/menu/menu.scss';
import 'mattermost-webapp/components/widgets/menu/menu_group.scss';
import 'mattermost-webapp/components/widgets/menu/menu_header.scss';
import 'mattermost-webapp/components/widgets/menu/menu_wrapper.scss';
import 'mattermost-webapp/components/widgets/menu/menu_items/menu_item.scss';
import '@mattermost/compass-icons/css/compass-icons.css';

import {
    CallJobState,
    CallState,
    EmojiData,
} from '@mattermost/calls-common/lib/types';
import {Client4} from 'mattermost-redux/client';
import {getChannel} from 'mattermost-redux/selectors/entities/channels';
import {getTheme, Theme} from 'mattermost-redux/selectors/entities/preferences';
import configureStore from 'mattermost-redux/store';
import {getCallActive, getCallsConfig, getCallsVersionInfo, joinUser, leaveUser, loadCallState, localSessionClose, setClientConnecting} from 'plugin/actions';
import CallClient, {CALL_EVENT, ConnectPayload, DisconnectReason} from 'plugin/clients/call';
import type {ScreenSharingSession} from 'plugin/clients/call/types';
import RestClient from 'plugin/clients/rest';
import {
    logDebug,
    logErr,
} from 'plugin/log';
import {pluginId} from 'plugin/manifest';
import reducer from 'plugin/reducers';
import {getCallIDForChannel} from 'plugin/selectors';
import {userScreenShared, userScreenUnshared} from 'plugin/state/screen_sharing_ids/actions';
import {userLoweredHand, userMuted, userRaisedHand, usersVoiceActivityChanged, userUnmuted} from 'plugin/state/session/actions';
import {Store} from 'plugin/types/mattermost-webapp';
import {
    setCallsGlobalCSSVars,
} from 'plugin/utils';
import {
    applyCallHostChanged,
    applyCallJobState,
    dispatchReaction,
} from 'plugin/websocket_handlers';
import {Reducer} from 'redux';
import {CurrentCallDataDefault} from 'src/types/types';

import {
    getCallID,
    getCallTitle,
    getJobID,
    getRootID,
    getToken,
} from './common';
import {applyTheme} from './theme_utils';

function setBasename() {
    const idx = window.location.pathname.indexOf('/plugins/');
    if (idx > 0) {
        window.basename = window.location.pathname.slice(0, idx);
    }
}

function connectCall(
    connectPayload: ConnectPayload,
    store: Store,
    closeCb?: (err?: Error) => void,
    callEventHandler?: (store: Store, callClient: CallClient) => void,
) {
    try {
        if (window.callsClient) {
            logErr('Standalone: CallClient is already initialized');
            return;
        }

        const callClient = new CallClient();

        // Update the global instances.
        window.callsClient = callClient;
        window.currentCallData = {...CurrentCallDataDefault};

        // Standalone has no main Mattermost WebSocket, so everything it knows about
        // the call comes from the join response and from LiveKit: participants,
        // mute, speaking, hands and reactions from the room itself, and the
        // call-level state LiveKit cannot supply (host, jobs) from room metadata.
        //
        // The full call state snapshot arrives before the room connects, which is
        // what lets the LiveKit-sourced state below layer on top of a populated
        // session list without any ordering dance.
        callClient.on(CALL_EVENT.CALL_STATE, (callState: CallState) => {
            store.dispatch(loadCallState(callClient.channelID, callState));
        });

        callClient.on(CALL_EVENT.HOST_CHANGED, (hostID: string) => {
            applyCallHostChanged(store, callClient.channelID, hostID, getCallIDForChannel(store.getState(), callClient.channelID));
        });

        callClient.on(CALL_EVENT.JOB_STATE, (jobState: CallJobState) => {
            applyCallJobState(store, callClient.channelID, jobState);
        });

        callClient.on(CALL_EVENT.SCREEN_SHARING_CHANGED, (session: ScreenSharingSession | null) => {
            if (session) {
                store.dispatch(userScreenShared(callClient.channelID, session.sessionID, session.userID));
            } else {
                store.dispatch(userScreenUnshared(callClient.channelID, '', ''));
            }
        });

        callClient.on(CALL_EVENT.USER_JOINED, (sessionID: string, userID: string, isFromInitialSync?: boolean) => {
            store.dispatch(joinUser(callClient.channelID, userID, sessionID, Boolean(isFromInitialSync)));
        });
        callClient.on(CALL_EVENT.USER_LEFT, (sessionID: string, userID: string) => {
            store.dispatch(leaveUser(callClient.channelID, userID, sessionID));
        });
        callClient.on(CALL_EVENT.MUTE, (sessionID: string, userID: string) => {
            store.dispatch(userMuted(callClient.channelID, sessionID, userID));
        });
        callClient.on(CALL_EVENT.UNMUTE, (sessionID: string, userID: string) => {
            store.dispatch(userUnmuted(callClient.channelID, sessionID, userID));
        });
        callClient.on(CALL_EVENT.USERS_VOICE_ACTIVITY_CHANGED, (sessionIDs: string[], userIDs: string[]) => {
            store.dispatch(usersVoiceActivityChanged(callClient.channelID, sessionIDs, userIDs));
        });
        callClient.on(CALL_EVENT.RAISE_HAND, (sessionID: string, userID: string, raisedHandTimestamp: number) => {
            store.dispatch(userRaisedHand(callClient.channelID, sessionID, userID, raisedHandTimestamp));
        });
        callClient.on(CALL_EVENT.LOWER_HAND, (sessionID: string, userID: string) => {
            store.dispatch(userLoweredHand(callClient.channelID, sessionID, userID));
        });
        callClient.on(CALL_EVENT.REACTION, (sessionID: string, userID: string, emoji: EmojiData, timestamp: number) => {
            dispatchReaction(store, callClient.channelID, {
                user_id: userID,
                session_id: sessionID,
                emoji,
                timestamp,
            });
        });

        let lastError: Error | undefined;

        callClient.on(CALL_EVENT.ERROR, (e: unknown) => {
            if (e instanceof Error) {
                lastError = e;
            }
        });
        callClient.on(CALL_EVENT.CONNECTED, () => {
            store.dispatch(setClientConnecting(false));

            // The snapshot carries the server's stale unmuted/raised_hand (those
            // fields live in LiveKit now), so replay the live values. Safe to do
            // unconditionally here: the snapshot arrives from the join response
            // before the room connects, so the session list the reducers need is
            // already populated.
            callClient.reSyncMuteAndHandState();
        });
        callClient.on(CALL_EVENT.DISCONNECTED, (reason?: DisconnectReason) => {
            store.dispatch(setClientConnecting(false));
            if (window.callsClient) {
                store.dispatch(localSessionClose(window.callsClient.channelID));
            }
            if (closeCb) {
                let err = lastError;

                // Disconnect reasons expected in normal operation: the user left, the
                // host ended the call, or the host removed this user.
                const cleanReasons = [
                    DisconnectReason.CLIENT_INITIATED,
                    DisconnectReason.ROOM_DELETED,
                    DisconnectReason.PARTICIPANT_REMOVED,
                ];
                if (!err && typeof reason === 'number' && !cleanReasons.includes(reason)) {
                    err = new Error(`disconnected from room (reason: ${DisconnectReason[reason]})`);
                }
                if (err) {
                    logErr(err);
                }
                closeCb(err);
            }
        });

        // Registered before connect() so the bundle's own listeners are in place
        // for the call state snapshot, which is emitted during it.
        callEventHandler?.(store, callClient);

        store.dispatch(setClientConnecting(true));

        callClient.connect(connectPayload).catch((err: unknown) => {
            store.dispatch(setClientConnecting(false));
            logErr(err);
            closeCb?.(err instanceof Error ? err : new Error(String(err)));
        });
    } catch (err) {
        logErr(err);
        closeCb?.(err instanceof Error ? err : new Error(String(err)));
    }
}

export type InitCbProps = {
    store: Store;
    theme: Theme;
    channelID: string;
    startingCall: boolean;
}

type InitConfig = {
    name: string,
    initCb: (props: InitCbProps) => void,
    closeCb?: (err?: Error) => void,
    reducer?: Reducer,
    callEventHandler?: (store: Store, callClient: CallClient) => void,
    initStore?: (store: Store, channelID: string) => Promise<void>,
};

export default async function initialiseEmbedApp(cfg: InitConfig) {
    setBasename();
    const initStartTime = performance.now();

    const storeKey = `plugins-${pluginId}`;
    const storeConfig = {
        appReducers: {
            [storeKey]: reducer,
        },
    };
    if (cfg.reducer) {
        storeConfig.appReducers[`${storeKey}-${cfg.name}`] = cfg.reducer;
    }
    const store = configureStore(storeConfig);

    const channelID = getCallID();
    if (!channelID) {
        throw new Error('invalid call id');
    }

    // Setting the base URL if present, in case MM is running under a subpath.
    if (window.basename) {
        // If present, we need to set the basename on both the client we use (RestClient)
        // and the default one (Client4) used by internal Redux actions. Not doing so
        // would break Calls widget on installations served under a subpath.
        RestClient.setUrl(window.basename);
        Client4.setUrl(window.basename);
    }
    RestClient.setToken(getToken());

    if (cfg.initStore) {
        await cfg.initStore(store, channelID);
    }

    const channel = getChannel(store.getState(), channelID);
    if (!channel) {
        throw new Error('channel not found');
    }

    let active = false;
    try {
        [, active] = await Promise.all([
            store.dispatch(getCallsConfig()),
            store.dispatch(getCallsVersionInfo()),
            getCallActive(channelID),
        ]);
    } catch (e) {
        throw new Error(`failed to fetch channel data: ${e}`);
    }

    connectCall(
        {
            channelID,
            title: getCallTitle(),
            threadID: getRootID(),
            jobID: getJobID(),
        },
        store,
        cfg.closeCb,
        cfg.callEventHandler,
    );

    const theme = getTheme(store.getState());
    applyTheme(theme);
    setCallsGlobalCSSVars(theme.sidebarBg);

    try {
        cfg.initCb({store, theme, channelID, startingCall: !active});
    } catch (err) {
        void window.callsClient?.disconnect();
        throw new Error(`initCb failed: ${err}`);
    }

    logDebug(`${cfg.name} init completed in ${Math.round(performance.now() - initStartTime)}ms`);
}
