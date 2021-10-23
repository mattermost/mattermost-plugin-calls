import {Store, Action} from 'redux';

import {GlobalState} from 'mattermost-redux/types/store';

import axios from 'axios';

import {Client4} from 'mattermost-redux/client';

import {getCurrentChannelId, getCurrentChannel, getChannel} from 'mattermost-redux/selectors/entities/channels';
import {getChannel as getChannelAction} from 'mattermost-redux/actions/channels';
import {getMyRoles} from 'mattermost-redux/selectors/entities/roles';

import {getCurrentUserId} from 'mattermost-redux/selectors/entities/users';

import {isVoiceEnabled, connectedChannelID, voiceConnectedUsers, voiceChannelCallStartAt} from './selectors';

import manifest from './manifest';

import CallsClient from './client';

import ChannelHeaderButton from './components/channel_header_button';
import ChannelHeaderMenuButton from './components/channel_header_menu_button';
import CallWidget from './components/call_widget';
import ChannelLinkLabel from './components/channel_link_label';
import ChannelCallToast from './components/channel_call_toast';
import PostType from './components/post_type';
import ScreenWindow from './components/screen_window';
import ExpandedView from './components/expanded_view';

import reducer from './reducers';

import {getPluginPath, hasPermissionsToEnableCalls, getExpandedChannelID} from './utils';

import {
    VOICE_CHANNEL_ENABLE,
    VOICE_CHANNEL_DISABLE,
    VOICE_CHANNEL_USER_CONNECTED,
    VOICE_CHANNEL_USER_DISCONNECTED,
    VOICE_CHANNEL_USERS_CONNECTED,
    VOICE_CHANNEL_USERS_CONNECTED_STATES,
    VOICE_CHANNEL_PROFILES_CONNECTED,
    VOICE_CHANNEL_PROFILE_CONNECTED,
    VOICE_CHANNEL_USER_MUTED,
    VOICE_CHANNEL_USER_UNMUTED,
    VOICE_CHANNEL_USER_VOICE_OFF,
    VOICE_CHANNEL_USER_VOICE_ON,
    VOICE_CHANNEL_CALL_START,
    VOICE_CHANNEL_USER_SCREEN_ON,
    VOICE_CHANNEL_USER_SCREEN_OFF,
    VOICE_CHANNEL_UNINIT,
} from './action_types';

// eslint-disable-next-line import/no-unresolved
import {PluginRegistry} from './types/mattermost-webapp';

export default class Plugin {
    private unsubscribers: (() => void)[];
    private unregisterChannelHeaderMenuButton: any;
    private registerChannelHeaderMenuButton: any;

    constructor() {
        this.unsubscribers = [];
        this.unsubscribers.push(() => {
            if (window.callsClient) {
                window.callsClient.disconnect();
                delete window.callsClient;
            }
        });
    }

    private registerWebSocketEvents(registry: PluginRegistry, store: Store<GlobalState>) {
        registry.registerWebSocketEventHandler(`custom_${manifest.id}_channel_enable_voice`, (data) => {
            this.unregisterChannelHeaderMenuButton();
            this.registerChannelHeaderMenuButton();
            store.dispatch({
                type: VOICE_CHANNEL_ENABLE,
            });
        });

        registry.registerWebSocketEventHandler(`custom_${manifest.id}_channel_disable_voice`, (data) => {
            this.unregisterChannelHeaderMenuButton();
            store.dispatch({
                type: VOICE_CHANNEL_DISABLE,
            });
        });

        registry.registerWebSocketEventHandler(`custom_${manifest.id}_user_connected`, async (ev) => {
            store.dispatch({
                type: VOICE_CHANNEL_USER_CONNECTED,
                data: {
                    channelID: ev.broadcast.channel_id,
                    userID: ev.data.userID,
                    currentUserID: getCurrentUserId(store.getState()),
                },
            });

            try {
                const profiles = await Client4.getProfilesByIds([ev.data.userID]);
                store.dispatch({
                    type: VOICE_CHANNEL_PROFILE_CONNECTED,
                    data: {
                        profile: profiles[0],
                        channelID: ev.broadcast.channel_id,
                    },
                });
            } catch (err) {
                console.log(err);
            }
        });

        registry.registerWebSocketEventHandler(`custom_${manifest.id}_user_disconnected`, (ev) => {
            store.dispatch({
                type: VOICE_CHANNEL_USER_DISCONNECTED,
                data: {
                    channelID: ev.broadcast.channel_id,
                    userID: ev.data.userID,
                    currentUserID: getCurrentUserId(store.getState()),
                },
            });
        });

        registry.registerWebSocketEventHandler(`custom_${manifest.id}_user_muted`, (ev) => {
            store.dispatch({
                type: VOICE_CHANNEL_USER_MUTED,
                data: {
                    channelID: ev.broadcast.channel_id,
                    userID: ev.data.userID,
                },
            });
        });

        registry.registerWebSocketEventHandler(`custom_${manifest.id}_user_unmuted`, (ev) => {
            store.dispatch({
                type: VOICE_CHANNEL_USER_UNMUTED,
                data: {
                    channelID: ev.broadcast.channel_id,
                    userID: ev.data.userID,
                },
            });
        });

        registry.registerWebSocketEventHandler(`custom_${manifest.id}_user_voice_on`, (ev) => {
            store.dispatch({
                type: VOICE_CHANNEL_USER_VOICE_ON,
                data: {
                    channelID: ev.broadcast.channel_id,
                    userID: ev.data.userID,
                },
            });
        });

        registry.registerWebSocketEventHandler(`custom_${manifest.id}_user_voice_off`, (ev) => {
            store.dispatch({
                type: VOICE_CHANNEL_USER_VOICE_OFF,
                data: {
                    channelID: ev.broadcast.channel_id,
                    userID: ev.data.userID,
                },
            });
        });

        registry.registerWebSocketEventHandler(`custom_${manifest.id}_call_start`, (ev) => {
            store.dispatch({
                type: VOICE_CHANNEL_CALL_START,
                data: {
                    channelID: ev.broadcast.channel_id,
                    startAt: ev.data.start_at,
                },
            });
        });

        registry.registerWebSocketEventHandler(`custom_${manifest.id}_user_screen_on`, (ev) => {
            store.dispatch({
                type: VOICE_CHANNEL_USER_SCREEN_ON,
                data: {
                    channelID: ev.broadcast.channel_id,
                    userID: ev.data.userID,
                },
            });
        });

        registry.registerWebSocketEventHandler(`custom_${manifest.id}_user_screen_off`, (ev) => {
            store.dispatch({
                type: VOICE_CHANNEL_USER_SCREEN_OFF,
                data: {
                    channelID: ev.broadcast.channel_id,
                },
            });
        });

        registry.registerWebSocketEventHandler(`custom_${manifest.id}_deactivate`, (ev) => {
            this.uninitialize();
        });
    }

    public async initialize(registry: PluginRegistry, store: Store<GlobalState>): Promise<void> {
        registry.registerReducer(reducer);
        registry.registerSidebarChannelLinkLabelComponent(ChannelLinkLabel);
        registry.registerChannelToastComponent(ChannelCallToast);
        registry.registerPostTypeComponent('custom_calls', PostType);
        registry.registerCustomRoute('/screen', ScreenWindow);
        registry.registerNeedsTeamRoute('/expanded', ExpandedView);

        let channelHeaderMenuButtonID: string;
        this.unregisterChannelHeaderMenuButton = () => {
            if (channelHeaderMenuButtonID) {
                registry.unregisterComponent(channelHeaderMenuButtonID);
                channelHeaderMenuButtonID = '';
            }
        };
        this.unsubscribers.push(this.unregisterChannelHeaderMenuButton);
        this.registerChannelHeaderMenuButton = () => {
            if (channelHeaderMenuButtonID) {
                return;
            }
            channelHeaderMenuButtonID = registry.registerChannelHeaderButtonAction(
                ChannelHeaderButton
                ,
                async (channel) => {
                    try {
                        const users = voiceConnectedUsers(store.getState());
                        if (users && users.length > 0) {
                            const profiles = await Client4.getProfilesByIds(users);
                            store.dispatch({
                                type: VOICE_CHANNEL_PROFILES_CONNECTED,
                                data: {
                                    profiles,
                                    channelID: channel.id,
                                },
                            });
                        }
                    } catch (err) {
                        console.log(err);
                        return;
                    }

                    if (!connectedChannelID(store.getState())) {
                        connectCall(channel.id);
                    } else if (connectedChannelID(store.getState()) === getCurrentChannelId(store.getState())) {
                    // TODO: show an error or let the user switch connection.
                    }
                },
            );
        };

        const connectCall = async (channelID: string) => {
            try {
                window.callsClient = await new CallsClient().init(channelID);
                const globalComponentID = registry.registerGlobalComponent(CallWidget);
                const rootComponentID = registry.registerRootComponent(ExpandedView);
                window.callsClient.on('close', () => {
                    registry.unregisterComponent(globalComponentID);
                    this.registerChannelHeaderMenuButton();
                    if (window.callsClient) {
                        window.callsClient.destroy();
                        delete window.callsClient;
                    }
                });
                this.unregisterChannelHeaderMenuButton();
            } catch (err) {
                console.log(err);
            }
        };
        const windowEventHandler = (ev: MessageEvent) => {
            if (ev.origin !== window.origin) {
                return;
            }
            if (ev.data && ev.data.type === 'connectCall') {
                connectCall(ev.data.channelID);
            }
        };
        window.addEventListener('message', windowEventHandler);
        this.unsubscribers.push(() => {
            window.removeEventListener('message', windowEventHandler);
        });

        let channelHeaderMenuID: string;
        const registerChannelHeaderMenuAction = () => {
            channelHeaderMenuID = registry.registerChannelHeaderMenuAction(
                ChannelHeaderMenuButton,
                async (channelID) => {
                    try {
                        const resp = await axios.post(`${getPluginPath()}/${currChannelId}`,
                            {enabled: !isVoiceEnabled(store.getState())},
                            {headers: {'X-Requested-With': 'XMLHttpRequest'}});
                        store.dispatch({
                            type: resp.data.enabled ? VOICE_CHANNEL_ENABLE : VOICE_CHANNEL_DISABLE,
                        });
                    } catch (err) {
                        console.log(err);
                    }
                },
            );
        };

        const fetchChannelData = async (channelID: string) => {
            const channel = getChannel(store.getState(), channelID);
            const roles = getMyRoles(store.getState());
            registry.unregisterComponent(channelHeaderMenuID);

            try {
                const resp = await axios.get(`${getPluginPath()}/config`);
                if (hasPermissionsToEnableCalls(channel, roles, resp.data.AllowEnableCalls)) {
                    registerChannelHeaderMenuAction();
                }
            } catch (err) {
                console.log(err);
            }

            this.unregisterChannelHeaderMenuButton();

            try {
                const resp = await axios.get(`${getPluginPath()}/${channelID}`);
                if (resp.data.enabled && connectedChannelID(store.getState()) !== channelID) {
                    this.registerChannelHeaderMenuButton();
                }
                console.log(resp.data);
                store.dispatch({
                    type: resp.data.enabled ? VOICE_CHANNEL_ENABLE : VOICE_CHANNEL_DISABLE,
                });
                store.dispatch({
                    type: VOICE_CHANNEL_USERS_CONNECTED,
                    data: {
                        users: resp.data.call?.users,
                        channelID,
                    },
                });

                if (resp.data.screen_sharing_id) {
                    store.dispatch({
                        type: VOICE_CHANNEL_USER_SCREEN_ON,
                        data: {
                            channelID,
                            userID: resp.data.screen_sharing_id,
                        },
                    });
                }

                const userStates = {} as any;
                const users = resp.data.call?.users || [];
                const states = resp.data.call?.states || [];
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
            } catch (err) {
                console.log(err);
                store.dispatch({
                    type: VOICE_CHANNEL_DISABLE,
                });
            }

            try {
                const resp = await axios.get(`${getPluginPath()}/channels`);
                let currentChannelData;
                for (let i = 0; i < resp.data.length; i++) {
                    store.dispatch({
                        type: VOICE_CHANNEL_USERS_CONNECTED,
                        data: {
                            users: resp.data[i].call?.users,
                            channelID: resp.data[i].channel_id,
                        },
                    });
                    if (resp.data[i].channel_id === channelID) {
                        currentChannelData = resp.data[i];
                    }

                    if (!voiceChannelCallStartAt(store.getState(), resp.data[i].channel_id)) {
                        store.dispatch({
                            type: VOICE_CHANNEL_CALL_START,
                            data: {
                                channelID: resp.data[i].channel_id,
                                startAt: resp.data[i].call?.start_at,
                            },
                        });
                    }
                }

                if (currentChannelData && currentChannelData.call?.users.length > 0) {
                    store.dispatch({
                        type: VOICE_CHANNEL_PROFILES_CONNECTED,
                        data: {
                            profiles: await Client4.getProfilesByIds(currentChannelData.call?.users),
                            channelID: currentChannelData.channel_id,
                        },
                    });
                }
            } catch (err) {
                console.log(err);
            }
        };

        this.registerWebSocketEvents(registry, store);

        let currChannelId = getCurrentChannelId(store.getState());
        if (currChannelId) {
            fetchChannelData(currChannelId);
        } else {
            const expandedID = getExpandedChannelID();
            if (expandedID.length > 0) {
                await store.dispatch({
                    type: VOICE_CHANNEL_USER_CONNECTED,
                    data: {
                        channelID: expandedID,
                        userID: getCurrentUserId(store.getState()),
                        currentUserID: getCurrentUserId(store.getState()),
                    },
                });
                fetchChannelData(expandedID);
            }
        }
        this.unsubscribers.push(store.subscribe(() => {
            const currentChannelId = getCurrentChannelId(store.getState());
            if (currChannelId !== currentChannelId) {
                currChannelId = currentChannelId;
                fetchChannelData(currChannelId);
            }
        }));

        this.unsubscribers.push(() => {
            store.dispatch({
                type: VOICE_CHANNEL_UNINIT,
            });
        });
    }

    uninitialize() {
        this.unsubscribers.forEach((unsubscribe) => {
            unsubscribe();
        });
        this.unsubscribers = [];
    }
}

declare global {
    interface Window {
        registerPlugin(id: string, plugin: Plugin): void,
        callsClient: any,
        webkitAudioContext: AudioContext,
        basename: string,
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
}

window.registerPlugin(manifest.id, new Plugin());
