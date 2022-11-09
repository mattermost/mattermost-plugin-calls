import {Client4} from 'mattermost-redux/client';
import configureStore from 'mattermost-redux/store';
import {getMe} from 'mattermost-redux/actions/users';
import {setServerVersion} from 'mattermost-redux/actions/general';
import {getMyPreferences} from 'mattermost-redux/actions/preferences';
import {getTeam as getTeamAction, getMyTeams, selectTeam} from 'mattermost-redux/actions/teams';
import {getChannel} from 'mattermost-redux/selectors/entities/channels';
import {getTeam, getTeams} from 'mattermost-redux/selectors/entities/teams';
import {getTheme} from 'mattermost-redux/selectors/entities/preferences';
import {getConfig} from 'mattermost-redux/selectors/entities/general';
import {isDirectChannel, isGroupChannel, isOpenChannel, isPrivateChannel} from 'mattermost-redux/utils/channel_utils';

import {Store} from 'plugin/types/mattermost-webapp';
import {Theme} from 'mattermost-redux/types/themes';

import {pluginId} from 'plugin/manifest';
import CallsClient from 'plugin/client';
import reducer from 'plugin/reducers';
import {
    VOICE_CHANNEL_USER_SCREEN_ON,
    VOICE_CHANNEL_ROOT_POST,
    VOICE_CHANNEL_PROFILES_CONNECTED,
    VOICE_CHANNEL_USERS_CONNECTED,
    VOICE_CHANNEL_USERS_CONNECTED_STATES,
    VOICE_CHANNEL_CALL_START,
} from 'plugin/action_types';
import {getCallsConfig} from 'plugin/actions';

import {
    getWSConnectionURL,
    getPluginPath,
    getProfilesByIds,
} from 'plugin/utils';

import {
    iceServers,
    needsTURNCredentials,
} from 'plugin/selectors';

import {
    logDebug,
    logErr,
} from 'plugin/log';

import {
    handleUserConnected,
    handleUserDisconnected,
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
} from 'plugin/websocket_handlers';

import {
    getCallID,
    getCallTitle,
    getToken,
} from './common';

import {applyTheme} from './theme_utils';

import {ChannelState} from './types/calls';

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

function connectCall(channelID: string, callTitle: string, wsURL: string, iceConfigs: RTCIceServer[], wsEventHandler: (ev: any) => void, closeCb?: () => void) {
    try {
        if (window.callsClient) {
            logErr('calls client is already initialized');
            return;
        }

        window.callsClient = new CallsClient({
            wsURL,
            iceServers: iceConfigs,
            authToken: getToken(),
        });

        window.callsClient.on('close', () => {
            if (closeCb) {
                closeCb();
            }
        });

        window.callsClient.init(channelID, callTitle).then(() => {
            window.callsClient.ws.on('event', wsEventHandler);
        }).catch((err: Error) => {
            delete window.callsClient;
            logErr(err);
        });
    } catch (err) {
        delete window.callsClient;
        logErr(err);
    }
}

async function fetchChannelData(store: Store, channelID: string) {
    try {
        const resp = await Client4.doFetch<ChannelState>(
            `${getPluginPath()}/${channelID}`,
            {method: 'get'},
        );

        if (!resp.call) {
            return;
        }

        store.dispatch({
            type: VOICE_CHANNEL_USERS_CONNECTED,
            data: {
                users: resp.call.users,
                channelID,
            },
        });

        store.dispatch({
            type: VOICE_CHANNEL_ROOT_POST,
            data: {
                channelID,
                rootPost: resp.call.thread_id,
            },
        });

        store.dispatch({
            type: VOICE_CHANNEL_USER_SCREEN_ON,
            data: {
                channelID,
                userID: resp.call.screen_sharing_id,
            },
        });

        store.dispatch({
            type: VOICE_CHANNEL_CALL_START,
            data: {
                channelID: resp.channel_id,
                startAt: resp.call.start_at,
                ownerID: resp.call.owner_id,
            },
        });

        if (resp.call.users.length > 0) {
            store.dispatch({
                type: VOICE_CHANNEL_PROFILES_CONNECTED,
                data: {
                    profiles: await getProfilesByIds(store.getState(), resp.call.users),
                    channelID,
                },
            });

            const userStates = {} as any;
            const users = resp.call.users || [];
            const states = resp.call.states || [];
            for (let i = 0; i < users.length; i++) {
                userStates[users[i]] = states[i];
            }
            store.dispatch({
                type: VOICE_CHANNEL_USERS_CONNECTED_STATES,
                data: {
                    states: userStates,
                    channelID,
                },
            });
        }
    } catch (err) {
        logErr(err);
    }
}

type InitConfig = {
    name: string,
    initCb: (store: Store, theme: Theme, channelID: string) => void,
    closeCb?: () => void,
    reducer?: any,
    wsHandler?: (store: Store, ev: any) => void,
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

    const callTitle = getCallTitle();

    // Setting the base URL if present, in case MM is running under a subpath.
    if (window.basename) {
        Client4.setUrl(window.basename);
    }
    Client4.setToken(getToken());

    // initialize some basic state.
    await Promise.all([
        getMe()(store.dispatch, store.getState),
        getMyPreferences()(store.dispatch, store.getState),
        getMyTeams()(store.dispatch, store.getState),
    ]);
    if (cfg.initStore) {
        await cfg.initStore(store, channelID);
    }

    const channel = getChannel(store.getState(), channelID);
    if (!channel) {
        logErr('channel not found');
        return;
    }

    await Promise.all([
        fetchChannelData(store, channelID),
        store.dispatch(getCallsConfig()),
    ]);

    const iceConfigs = [...iceServers(store.getState())];
    if (needsTURNCredentials(store.getState())) {
        logDebug('turn credentials needed');
        const configs = await Client4.doFetch<RTCIceServer[]>(
            `${getPluginPath()}/turn-credentials`,
            {method: 'get'},
        );
        iceConfigs.push(...configs);
    }

    connectCall(channelID, callTitle, getWSConnectionURL(getConfig(store.getState())), iceConfigs, (ev) => {
        switch (ev.event) {
        case 'hello':
            setServerVersion(ev.data.server_version)(store.dispatch, store.getState);
            break;
        case `custom_${pluginId}_call_start`:
            handleCallStart(store, ev);
            break;
        case `custom_${pluginId}_call_end`:
            handleCallEnd(store, ev);
            break;
        case `custom_${pluginId}_user_connected`:
            handleUserConnected(store, ev);
            break;
        case `custom_${pluginId}_user_disconnected`:
            handleUserDisconnected(store, ev);
            break;
        case `custom_${pluginId}_user_voice_on`:
            handleUserVoiceOn(store, ev);
            break;
        case `custom_${pluginId}_user_voice_off`:
            handleUserVoiceOff(store, ev);
            break;
        case `custom_${pluginId}_user_screen_on`:
            handleUserScreenOn(store, ev);
            break;
        case `custom_${pluginId}_user_screen_off`:
            handleUserScreenOff(store, ev);
            break;
        case `custom_${pluginId}_user_muted`:
            handleUserMuted(store, ev);
            break;
        case `custom_${pluginId}_user_unmuted`:
            handleUserUnmuted(store, ev);
            break;
        case `custom_${pluginId}_user_raise_hand`:
            handleUserRaisedHand(store, ev);
            break;
        case `custom_${pluginId}_user_unraise_hand`:
            handleUserUnraisedHand(store, ev);
            break;
        default:
        }

        if (cfg.wsHandler) {
            cfg.wsHandler(store, ev);
        }
    }, cfg.closeCb);

    const theme = getTheme(store.getState());
    applyTheme(theme);

    await cfg.initCb(store, theme, channelID);

    logDebug(`${cfg.name} init completed in ${Math.round(performance.now() - initStartTime)}ms`);
}

declare global {
    interface Window {
        callsClient: any,
        webkitAudioContext: AudioContext,
        basename: string,
        desktop: any,
        screenSharingTrackId: string,
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
