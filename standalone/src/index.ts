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
    EmptyData,
    HelloData,
    HostControlLowerHand,
    HostControlMsg,
    HostControlRemoved,
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
    WebsocketEventData,
} from '@mattermost/calls-common/lib/types';
import {WebSocketMessage} from '@mattermost/client/websocket';
import {setServerVersion} from 'mattermost-redux/actions/general';
import {Client4} from 'mattermost-redux/client';
import {getChannel} from 'mattermost-redux/selectors/entities/channels';
import {getConfig} from 'mattermost-redux/selectors/entities/general';
import {getTheme, Theme} from 'mattermost-redux/selectors/entities/preferences';
import configureStore from 'mattermost-redux/store';
import {getCallActive, getCallsConfig, getCallsVersionInfo, localSessionClose, setClientConnecting} from 'plugin/actions';
import CallClient, {CALL_EVENT, ConnectPayload, DisconnectReason} from 'plugin/clients/call';
import RestClient from 'plugin/clients/rest';
import {
    logDebug,
    logErr,
} from 'plugin/log';
import {pluginId} from 'plugin/manifest';
import reducer from 'plugin/reducers';
import {Store} from 'plugin/types/mattermost-webapp';
import {
    getWSConnectionURL,
    setCallsGlobalCSSVars,
} from 'plugin/utils';
import {
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
    handleUserMuted,
    handleUserRaisedHand,
    handleUserReaction,
    handleUserRemovedFromChannel,
    handleUserScreenOff,
    handleUserScreenOn,
    handleUserUnmuted,
    handleUserUnraisedHand,
    handleUserVideoOff,
    handleUserVideoOn,
    handleUserVoiceOff,
    handleUserVoiceOn,
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

        let lastError: Error | undefined;

        callClient.on(CALL_EVENT.ERROR, (e: unknown) => {
            if (e instanceof Error) {
                lastError = e;
            }
        });
        callClient.on(CALL_EVENT.CONNECTED, () => store.dispatch(setClientConnecting(false)));
        callClient.on(CALL_EVENT.DISCONNECTED, (reason?: DisconnectReason) => {
            store.dispatch(setClientConnecting(false));
            if (window.callsClient) {
                store.dispatch(localSessionClose(window.callsClient.channelID));
            }
            if (closeCb) {
                let err = lastError;
                if (!err && typeof reason === 'number' && reason !== DisconnectReason.CLIENT_INITIATED) {
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
        case `custom_${pluginId}_call_end`:
            handleCallEnd(store, ev as WebSocketMessage<EmptyData>);
            break;
        case `custom_${pluginId}_user_joined`:
            handleUserJoined(store, ev as WebSocketMessage<UserJoinedData>);
            break;
        case `custom_${pluginId}_user_left`:
            handleUserLeft(store, ev as WebSocketMessage<UserLeftData>);
            break;
        case `custom_${pluginId}_user_voice_on`:
            handleUserVoiceOn(store, ev as WebSocketMessage<UserVoiceOnOffData>);
            break;
        case `custom_${pluginId}_user_voice_off`:
            handleUserVoiceOff(store, ev as WebSocketMessage<UserVoiceOnOffData>);
            break;
        case `custom_${pluginId}_user_screen_on`:
            handleUserScreenOn(store, ev as WebSocketMessage<UserScreenOnOffData>);
            break;
        case `custom_${pluginId}_user_screen_off`:
            handleUserScreenOff(store, ev as WebSocketMessage<UserScreenOnOffData>);
            break;
        case `custom_${pluginId}_user_muted`:
            handleUserMuted(store, ev as WebSocketMessage<UserMutedUnmutedData>);
            break;
        case `custom_${pluginId}_user_unmuted`:
            handleUserUnmuted(store, ev as WebSocketMessage<UserMutedUnmutedData>);
            break;
        case `custom_${pluginId}_user_raise_hand`:
            handleUserRaisedHand(store, ev as WebSocketMessage<UserRaiseUnraiseHandData>);
            break;
        case `custom_${pluginId}_user_unraise_hand`:
            handleUserUnraisedHand(store, ev as WebSocketMessage<UserRaiseUnraiseHandData>);
            break;
        case `custom_${pluginId}_call_host_changed`:
            handleCallHostChanged(store, ev as WebSocketMessage<CallHostChangedData>);
            break;
        case `custom_${pluginId}_user_reacted`:
            handleUserReaction(store, ev as WebSocketMessage<UserReactionData>);
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
        case `custom_${pluginId}_user_video_on`:
            handleUserVideoOn(store, ev as WebSocketMessage<UserVideoOnOffData>);
            break;
        case `custom_${pluginId}_user_video_off`:
            handleUserVideoOff(store, ev as WebSocketMessage<UserVideoOnOffData>);
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
