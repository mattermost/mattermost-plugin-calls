// CSS
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
    UserVoiceOnOffData,
    WebsocketEventData,
} from '@mattermost/calls-common/lib/types';
import {WebSocketMessage} from '@mattermost/client/websocket';
import type {DesktopAPI} from '@mattermost/desktop-api';
import {setServerVersion} from 'mattermost-redux/actions/general';
import {Client4} from 'mattermost-redux/client';
import {getChannel} from 'mattermost-redux/selectors/entities/channels';
import {getConfig} from 'mattermost-redux/selectors/entities/general';
import {getTheme, Theme} from 'mattermost-redux/selectors/entities/preferences';
import configureStore from 'mattermost-redux/store';
import {ActionFuncAsync} from 'mattermost-redux/types/actions';
import {getCallActive, getCallsConfig, setClientConnecting} from 'plugin/actions';
import CallsClient from 'plugin/client';
import {
    logDebug,
    logErr,
} from 'plugin/log';
import {pluginId} from 'plugin/manifest';
import reducer from 'plugin/reducers';
import RestClient from 'plugin/rest_client';
import {callsConfig, iceServers, needsTURNCredentials} from 'plugin/selectors';
import {DesktopNotificationArgs, Store, WebAppUtils} from 'plugin/types/mattermost-webapp';
import {
    getPluginPath,
    getWSConnectionURL,
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
    handleUserVoiceOff,
    handleUserVoiceOn,
} from 'plugin/websocket_handlers';
import {Reducer} from 'redux';
import {CallActions, CallsClientConfig, CallsClientJoinData, CurrentCallData, CurrentCallDataDefault} from 'src/types/types';

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
    joinData: CallsClientJoinData,
    clientConfig: CallsClientConfig,
    wsEventHandler: (ev: WebSocketMessage<WebsocketEventData>) => void,
    store: Store,
    closeCb?: (err?: Error) => void,
) {
    try {
        if (window.callsClient) {
            logErr('calls client is already initialized');
            return;
        }

        window.callsClient = new CallsClient(clientConfig);
        window.currentCallData = CurrentCallDataDefault;

        window.callsClient.on('connect', () => store.dispatch(setClientConnecting(false)));

        window.callsClient.on('close', (err?: Error) => {
            store.dispatch(setClientConnecting(false));
            if (closeCb) {
                closeCb(err);
            }
        });

        window.callsClient.init(joinData).then(() => {
            window.callsClient?.ws?.on('event', wsEventHandler);
        }).catch((err: Error) => {
            store.dispatch(setClientConnecting(false));
            logErr(err);
            if (closeCb) {
                closeCb(err);
            }
        });

        store.dispatch(setClientConnecting(true));
    } catch (err) {
        logErr(err);
        if (closeCb) {
            closeCb();
        }
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
    closeCb?: () => void,
    reducer?: Reducer,
    wsHandler?: (store: Store, ev: WebSocketMessage<WebsocketEventData>) => void,
    initStore?: (store: Store, channelID: string) => Promise<void>,
};

export default async function init(cfg: InitConfig) {
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
        logErr('invalid call id');
        return;
    }

    const joinData = {
        channelID,
        title: getCallTitle(),
        threadID: getRootID(),
        jobID: getJobID(),
    };

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
        logErr('channel not found');
        return;
    }

    let active = false;
    try {
        [, active] = await Promise.all([
            store.dispatch(getCallsConfig()),
            getCallActive(channelID),
        ]);
    } catch (err) {
        throw new Error(`failed to fetch channel data: ${err}`);
    }

    const iceConfigs = [...iceServers(store.getState())];
    if (needsTURNCredentials(store.getState())) {
        logDebug('turn credentials needed');
        const configs = await RestClient.fetch<RTCIceServer[]>(
            `${getPluginPath()}/turn-credentials`,
            {method: 'get'},
        );
        iceConfigs.push(...configs);
    }

    const clientConfig = {
        wsURL: getWSConnectionURL(getConfig(store.getState())),
        iceServers: iceConfigs,
        authToken: getToken(),
        simulcast: callsConfig(store.getState()).EnableSimulcast,
    };

    connectCall(joinData, clientConfig, (ev) => {
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
        case 'user_removed':
            handleUserRemovedFromChannel(store, ev as WebSocketMessage<UserRemovedData>);
            break;
        default:
        }

        if (cfg.wsHandler) {
            cfg.wsHandler(store, ev);
        }
    }, store, cfg.closeCb);

    const theme = getTheme(store.getState());
    applyTheme(theme);

    try {
        cfg.initCb({store, theme, channelID, startingCall: !active});
    } catch (err) {
        window.callsClient?.destroy();
        throw new Error(`initCb failed: ${err}`);
    }

    logDebug(`${cfg.name} init completed in ${Math.round(performance.now() - initStartTime)}ms`);
}

declare global {
    interface Window {
        callsClient?: CallsClient,
        webkitAudioContext: AudioContext,
        basename: string,
        desktop: {
            version?: string | null;
        },
        desktopAPI?: DesktopAPI;
        screenSharingTrackId: string,
        currentCallData?: CurrentCallData,
        callActions?: CallActions,
        e2eDesktopNotificationsRejected?: DesktopNotificationArgs[],
        e2eDesktopNotificationsSent?: string[],
        e2eNotificationsSoundedAt?: number[],
        e2eNotificationsSoundStoppedAt?: number[],
        e2eRingLength?: number,
        WebappUtils: WebAppUtils,
        ProductApi: {
            selectRhsPost: (postId: string) => ActionFuncAsync,
        },
    }

    interface HTMLVideoElement {
        webkitRequestFullscreen: () => void,
        msRequestFullscreen: () => void,
        mozRequestFullscreen: () => void,
    }

    interface CanvasRenderingContext2D {
        webkitBackingStorePixelRatio: number,
        mozBackingStorePixelRatio: number,
        msBackingStorePixelRatio: number,
        oBackingStorePixelRatio: number,
        backingStorePixelRatio: number,
    }

    // fix for a type problem in webapp as of 6dcac2
    type DeepPartial<T> = {
        [P in keyof T]?: DeepPartial<T[P]>;
    }
}
