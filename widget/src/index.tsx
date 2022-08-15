import React from 'react';
import ReactDOM from 'react-dom';

import {Client4} from 'mattermost-redux/client';
import configureStore from 'mattermost-redux/store';
import {getChannel as getChannelAction} from 'mattermost-redux/actions/channels';
import {getMe} from 'mattermost-redux/actions/users';
import {getMyPreferences} from 'mattermost-redux/actions/preferences';
import {getTeam as getTeamAction} from 'mattermost-redux/actions/teams';
import {getCurrentUserId} from 'mattermost-redux/selectors/entities/users';
import {getChannel} from 'mattermost-redux/selectors/entities/channels';
import {getTeam} from 'mattermost-redux/selectors/entities/teams';
import {getTheme} from 'mattermost-redux/selectors/entities/preferences';
import {getConfig} from 'mattermost-redux/selectors/entities/general';
import {isDirectChannel, isGroupChannel, isOpenChannel, isPrivateChannel} from 'mattermost-redux/utils/channel_utils';

import {Store} from 'plugin/types/mattermost-webapp';

import {pluginId} from 'plugin/manifest';
import CallWidget from 'plugin/components/call_widget';
import CallsClient from 'plugin/client';
import reducer from 'plugin/reducers';
import {
    VOICE_CHANNEL_USER_CONNECTED,
    VOICE_CHANNEL_USER_SCREEN_ON,
    VOICE_CHANNEL_ROOT_POST,
    VOICE_CHANNEL_PROFILES_CONNECTED,
    VOICE_CHANNEL_USERS_CONNECTED,
    VOICE_CHANNEL_USERS_CONNECTED_STATES,
    VOICE_CHANNEL_CALL_START,
} from 'plugin/action_types';

import {
    getWSConnectionURL,
    getPluginPath,
    getProfilesByIds,
} from 'plugin/utils';

import {
    handleCallStart,
    handleUserConnected,
} from 'plugin/websocket_handlers';

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

function getCallID() {
    const params = new URLSearchParams(window.location.search);
    return params.get('call_id');
}

function connectCall(channelID: string, wsURL: string, wsEventHandler: (ev: any) => void) {
    try {
        if (window.callsClient) {
            console.error('calls client is already initialized');
            return;
        }

        window.callsClient = new CallsClient({
            wsURL,

            // TODO: pass config.
            iceServers: [],
        });

        window.callsClient.on('close', () => {
            if (window.callsClient) {
                window.callsClient.destroy();
                delete window.callsClient;

                // playSound(getPluginStaticPath() + LeaveSelfSound);
            }
        });

        window.callsClient.init(channelID).then(() => {
            window.callsClient.ws.on('event', wsEventHandler);
        }).catch((err: Error) => {
            delete window.callsClient;
            console.error(err);
        });
    } catch (err) {
        delete window.callsClient;
        console.error(err);
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
        console.error(err);
    }
}

async function init() {
    const storeKey = `plugins-${pluginId}`;
    const store = configureStore({
        appReducers: {
            [storeKey]: reducer,
        },
    });

    console.log(pluginId);
    console.log(store);
    console.log(store.getState());
    console.log('init');

    const channelID = getCallID();
    console.log(channelID);

    if (!channelID) {
        console.error('invalid call id');
        return;
    }

    // initialize some basic state.
    await Promise.all([
        getMe()(store.dispatch, store.getState),
        getMyPreferences()(store.dispatch, store.getState),
        getChannelAction(channelID)(store.dispatch, store.getState),
    ]);

    const channel = getChannel(store.getState(), channelID);
    if (!channel) {
        console.error('channel not found');
        return;
    }

    console.log(channel);

    if (isOpenChannel(channel) || isPrivateChannel(channel)) {
        await getTeamAction(channel.team_id)(store.dispatch, store.getState);
    }

    fetchChannelData(store, channelID);

    connectCall(channelID, getWSConnectionURL(getConfig(store.getState())), (ev) => {
        console.log('got ws event');
        console.log(ev);

        switch (ev.event) {
        case `custom_${pluginId}_call_start`:
            handleCallStart(store, ev);
            break;
        case `custom_${pluginId}_user_connected`:
            handleUserConnected(store, ev);
            break;
        default:
        }
    });

    await store.dispatch({
        type: VOICE_CHANNEL_USER_CONNECTED,
        data: {
            channelID: channel.id,
            userID: getCurrentUserId(store.getState()),
            currentUserID: getCurrentUserId(store.getState()),
        },
    });

    const theme = getTheme(store.getState());
    applyTheme(theme);

    ReactDOM.render(
        <CallWidget
            store={store}
            theme={theme}
            global={true}
        />,
        document.getElementById('root'),
    );
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

init();
