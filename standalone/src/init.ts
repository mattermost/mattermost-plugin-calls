import {
    CallHostChangedData,
    CallRecordingStateData,
    CallStartData,
    EmptyData,
    HelloData,
    UserJoinedData,
    UserLeftData,
    UserDismissedNotification,
    UserMutedUnmutedData,
    UserRaiseUnraiseHandData,
    UserReactionData,
    UserScreenOnOffData,
    UserVoiceOnOffData,
    WebsocketEventData,
    CallStateData,
} from '@calls/common/lib/types';
import {WebSocketMessage} from '@mattermost/client/websocket';
import {setServerVersion} from 'mattermost-redux/actions/general';
import {getMyPreferences} from 'mattermost-redux/actions/preferences';
import {getMyTeams, getMyTeamMembers} from 'mattermost-redux/actions/teams';
import {getMe} from 'mattermost-redux/actions/users';
import {getChannel} from 'mattermost-redux/selectors/entities/channels';
import {getConfig} from 'mattermost-redux/selectors/entities/general';
import {getTheme, Theme} from 'mattermost-redux/selectors/entities/preferences';
import configureStore from 'mattermost-redux/store';
import {getCallsConfig} from 'plugin/actions';
import CallsClient from 'plugin/client';
import {
    logDebug,
    logErr,
} from 'plugin/log';
import {pluginId} from 'plugin/manifest';
import reducer from 'plugin/reducers';
import RestClient from 'plugin/rest_client';
import {iceServers, needsTURNCredentials, callsConfig} from 'plugin/selectors';
import {DesktopNotificationArgs, Store} from 'plugin/types/mattermost-webapp';
import {
    getWSConnectionURL,
    getPluginPath,
} from 'plugin/utils';
import {
    handleUserJoined,
    handleUserLeft,
    handleCallStart,
    handleCallEnd,
    handleUserMuted,
    handleUserUnmuted,
    handleUserScreenOn,
    handleUserScreenOff,
    handleUserVoiceOn,
    handleUserVoiceOff,
    handleUserRaisedHand,
    handleUserUnraisedHand,
    handleCallHostChanged,
    handleUserReaction,
    handleCallRecordingState,
    handleUserDismissedNotification,
    handleCallState,
} from 'plugin/websocket_handlers';
import {Reducer} from 'redux';
import {CallActions, CurrentCallData, CurrentCallDataDefault, CallsClientConfig, CallsClientJoinData} from 'src/types/types';

import {
    getCallID,
    getCallTitle,
    getToken,
    getRootID,
    getJobID,
} from './common';
import {applyTheme} from './theme_utils';

// CSS
import 'mattermost-webapp/sass/styles.scss';
import 'mattermost-webapp/components/widgets/menu/menu.scss';
import 'mattermost-webapp/components/widgets/menu/menu_group.scss';
import 'mattermost-webapp/components/widgets/menu/menu_header.scss';
import 'mattermost-webapp/components/widgets/menu/menu_wrapper.scss';
import 'mattermost-webapp/components/widgets/menu/menu_items/menu_item.scss';
import '@mattermost/compass-icons/css/compass-icons.css';

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
    closeCb?: (err?: Error) => void,
) {
    try {
        if (window.callsClient) {
            logErr('calls client is already initialized');
            return;
        }

        window.callsClient = new CallsClient(clientConfig);
        window.currentCallData = CurrentCallDataDefault;

        window.callsClient.on('close', (err?: Error) => {
            if (closeCb) {
                closeCb(err);
            }
        });

        window.callsClient.init(joinData).then(() => {
            window.callsClient?.ws?.on('event', wsEventHandler);
        }).catch((err: Error) => {
            logErr(err);
            if (closeCb) {
                closeCb(err);
            }
        });
    } catch (err) {
        logErr(err);
        if (closeCb) {
            closeCb();
        }
    }
}

type InitConfig = {
    name: string,
    initCb: (store: Store, theme: Theme, channelID: string) => void,
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
        RestClient.setUrl(window.basename);
    }
    RestClient.setToken(getToken());

    // initialize some basic state.
    await Promise.all([
        getMe()(store.dispatch, store.getState),
        getMyPreferences()(store.dispatch, store.getState),
        getMyTeams()(store.dispatch, store.getState),
        getMyTeamMembers()(store.dispatch, store.getState),
    ]);

    if (cfg.initStore) {
        await cfg.initStore(store, channelID);
    }

    const channel = getChannel(store.getState(), channelID);
    if (!channel) {
        logErr('channel not found');
        return;
    }

    try {
        await Promise.all([
            store.dispatch(getCallsConfig()),
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

    connectCall(joinData, clientConfig, async (ev) => {
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
        case `custom_${pluginId}_call_recording_state`:
            handleCallRecordingState(store, ev as WebSocketMessage<CallRecordingStateData>);
            break;
        case `custom_${pluginId}_user_dismissed_notification`:
            handleUserDismissedNotification(store, ev as WebSocketMessage<UserDismissedNotification>);
            break;
        case `custom_${pluginId}_call_state`:
            await handleCallState(store, ev as WebSocketMessage<CallStateData>);
            break;
        default:
        }

        if (cfg.wsHandler) {
            cfg.wsHandler(store, ev);
        }
    }, cfg.closeCb);

    const theme = getTheme(store.getState());
    applyTheme(theme);

    try {
        await cfg.initCb(store, theme, channelID);
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
        screenSharingTrackId: string,
        currentCallData?: CurrentCallData,
        callActions?: CallActions,
        e2eDesktopNotificationsRejected?: DesktopNotificationArgs[],
        e2eDesktopNotificationsSent?: string[],
        e2eNotificationsSoundedAt?: number[],
        e2eNotificationsSoundStoppedAt?: number[],
        e2eRingLength?: number,
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
