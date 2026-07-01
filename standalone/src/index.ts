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
    CallHostChangedData,
    CallJobStateData,
    CallStartData,
    CallStateData,
    EmojiData,
    EmptyData,
    HelloData,
    HostControlLowerHand,
    HostControlMsg,
    HostControlRemoved,
    UserDismissedNotification,
    UserJoinedData,
    UserLeftData,
    UserRemovedData,
    UserScreenOnOffData,
    WebsocketEventData,
} from '@mattermost/calls-common/lib/types';
import {WebSocketMessage} from '@mattermost/client/websocket';
import {setServerVersion} from 'mattermost-redux/actions/general';
import {Client4} from 'mattermost-redux/client';
import {getChannel} from 'mattermost-redux/selectors/entities/channels';
import {getConfig} from 'mattermost-redux/selectors/entities/general';
import {getTheme, Theme} from 'mattermost-redux/selectors/entities/preferences';
import configureStore from 'mattermost-redux/store';
import {getCallActive, getCallsConfig, getCallsVersionInfo, joinUser, leaveUser, localSessionClose, setClientConnecting} from 'plugin/actions';
import CallClient, {CALL_EVENT, ConnectPayload, DisconnectReason} from 'plugin/clients/call';
import RestClient from 'plugin/clients/rest';
import {
    logDebug,
    logErr,
} from 'plugin/log';
import {pluginId} from 'plugin/manifest';
import reducer from 'plugin/reducers';
import {userLoweredHand, userMuted, userRaisedHand, usersVoiceActivityChanged, userUnmuted} from 'plugin/state/session/actions';
import {Store} from 'plugin/types/mattermost-webapp';
import {
    getWSConnectionURL,
    setCallsGlobalCSSVars,
} from 'plugin/utils';
import {
    dispatchReaction,
    handleCallEnd,
    handleCallHostChanged,
    handleCallJobState,
    handleCallStart,
    handleCallState,
    handleHostLowerHand,
    handleHostMute,
    handleHostRemoved,
    handleHostScreenOff,
    handleUserDismissedNotification,
    handleUserJoined,
    handleUserLeft,
    handleUserRemovedFromChannel,
    handleUserScreenOff,
    handleUserScreenOn,
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
    websocketURL: string,
    authToken: string,
    wsEventHandler: (ev: WebSocketMessage<WebsocketEventData>) => void,
    store: Store,
    closeCb?: (err?: Error) => void,
) {
    try {
        if (window.callsClient) {
            logErr('Standalone: CallClient is already initialized');
            return;
        }

        const callClient = new CallClient({websocketURL, authToken});

        // Update the global instances.
        window.callsClient = callClient;
        window.currentCallData = CurrentCallDataDefault;

        // Subscribe to raw plugin-WS events BEFORE connect() so 'hello' isn't missed.
        callClient.on(CALL_EVENT.WEBSOCKET_EVENT, wsEventHandler);

        // Bridge LiveKit-owned per-participant state into the store. After the
        // LiveKit migration session membership and mute/speaking/raised-hand/reactions
        // no longer travel over the plugin WebSocket; CallClient re-emits them as
        // CALL_EVENTs. The main webapp wires these in its own index.tsx and the popout
        // reuses the opener's client — the standalone bundles (widget + recording) need
        // the same bridge here so their participant list and indicators reflect real,
        // live state. (The channel-wide user_joined/user_left WS broadcast is gated off
        // for a renderer that owns the live client, so these LiveKit events are the only
        // source of session join/leave here.)
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

        // The WS call_state seed carries the server's stale unmuted/voice/raised_hand
        // (those fields moved to LiveKit). reSyncMuteAndHandState() replays the live
        // state for every current participant, but only works once (a) the LiveKit
        // room is connected and (b) the seed has populated the session list — the
        // session reducers drop events for sessions they don't yet know about. The
        // two can arrive in either order (notably the recording bot joining mid-call),
        // so trigger the replay once both conditions hold.
        let liveKitStateSynced = false;
        let roomConnected = false;
        let seedReceived = false;
        const maybeReSyncLiveKitState = () => {
            if (liveKitStateSynced || !roomConnected || !seedReceived) {
                return;
            }
            liveKitStateSynced = true;
            callClient.reSyncMuteAndHandState();
        };
        callClient.on(CALL_EVENT.WEBSOCKET_EVENT, (ev: WebSocketMessage<WebsocketEventData>) => {
            if (ev.event === `custom_${pluginId}_call_state`) {
                seedReceived = true;
                maybeReSyncLiveKitState();
            }
        });

        let lastError: Error | undefined;

        callClient.on(CALL_EVENT.ERROR, (e: unknown) => {
            if (e instanceof Error) {
                lastError = e;
            }
        });
        callClient.on(CALL_EVENT.CONNECTED, () => {
            store.dispatch(setClientConnecting(false));
            roomConnected = true;
            maybeReSyncLiveKitState();
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
    wsHandler?: (store: Store, ev: WebSocketMessage<WebsocketEventData>) => void,
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

    const wsEventHandler = (ev: WebSocketMessage<WebsocketEventData>) => {
        switch (ev.event) {
        case 'hello':
            store.dispatch(setServerVersion((ev.data as HelloData).server_version));
            break;
        case `custom_${pluginId}_call_start`:
            handleCallStart(store, ev as WebSocketMessage<CallStartData>);
            break;
        case `custom_${pluginId}_call_ended`:
            handleCallEnd(store, ev as WebSocketMessage<EmptyData>);
            break;
        case `custom_${pluginId}_user_joined`:
            handleUserJoined(store, ev as WebSocketMessage<UserJoinedData>);
            break;
        case `custom_${pluginId}_user_left`:
            handleUserLeft(store, ev as WebSocketMessage<UserLeftData>);
            break;
        case `custom_${pluginId}_user_screen_on`:
            handleUserScreenOn(store, ev as WebSocketMessage<UserScreenOnOffData>);
            break;
        case `custom_${pluginId}_user_screen_off`:
            handleUserScreenOff(store, ev as WebSocketMessage<UserScreenOnOffData>);
            break;
        case `custom_${pluginId}_call_host_changed`:
            handleCallHostChanged(store, ev as WebSocketMessage<CallHostChangedData>);
            break;
        case `custom_${pluginId}_call_job_state`:
            handleCallJobState(store, ev as WebSocketMessage<CallJobStateData>);
            break;
        case `custom_${pluginId}_user_dismissed_notification`:
            handleUserDismissedNotification(store, ev as WebSocketMessage<UserDismissedNotification>);
            break;
        case `custom_${pluginId}_call_state`:
            handleCallState(store, ev as WebSocketMessage<CallStateData>);
            break;
        case `custom_${pluginId}_host_mute`:
            handleHostMute(store, ev as WebSocketMessage<HostControlMsg>);
            break;
        case `custom_${pluginId}_host_screen_off`:
            handleHostScreenOff(store, ev as WebSocketMessage<HostControlMsg>);
            break;
        case `custom_${pluginId}_host_lower_hand`:
            handleHostLowerHand(store, ev as WebSocketMessage<HostControlLowerHand>);
            break;
        case `custom_${pluginId}_host_removed`:
            handleHostRemoved(store, ev as WebSocketMessage<HostControlRemoved>);
            break;
        case 'user_removed':
            handleUserRemovedFromChannel(store, ev as WebSocketMessage<UserRemovedData>);
            break;
        default:
        }

        if (cfg.wsHandler) {
            cfg.wsHandler(store, ev);
        }
    };

    connectCall(
        {
            channelID,
            title: getCallTitle(),
            threadID: getRootID(),
            jobID: getJobID(),
        },
        getWSConnectionURL(getConfig(store.getState())?.WebsocketURL),
        getToken(),
        wsEventHandler,
        store,
        cfg.closeCb,
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
