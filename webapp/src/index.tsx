import React from 'react';
import axios from 'axios';

import {Client4} from 'mattermost-redux/client';
import {getCurrentChannelId, getChannel} from 'mattermost-redux/selectors/entities/channels';
import {getCurrentTeamId} from 'mattermost-redux/selectors/entities/teams';
import {getCurrentUserId, getUser, isCurrentUserSystemAdmin} from 'mattermost-redux/selectors/entities/users';
import {getMyChannelRoles, getMySystemRoles} from 'mattermost-redux/selectors/entities/roles';
import {getMyChannelMemberships} from 'mattermost-redux/selectors/entities/common';
import {getChannel as getChannelAction} from 'mattermost-redux/actions/channels';
import {getProfilesByIds as getProfilesByIdsAction} from 'mattermost-redux/actions/users';
import {setThreadFollow} from 'mattermost-redux/actions/threads';
import {getConfig} from 'mattermost-redux/selectors/entities/general';

import {displayFreeTrial, getCallsConfig} from 'src/actions';
import {PostTypeCloudTrialRequest} from 'src/components/custom_post_types/post_type_cloud_trial_request';

import {
    isVoiceEnabled,
    connectedChannelID,
    voiceConnectedUsers,
    voiceConnectedUsersInChannel,
    voiceChannelCallStartAt,
    voiceChannelCallOwnerID,
    isCloudFeatureRestricted,
    isLimitRestricted,
    voiceChannelRootPost,
    allowEnableCalls,
    iceServers,
} from './selectors';

import {pluginId} from './manifest';

import CallsClient from './client';

import ChannelHeaderButton from './components/channel_header_button';
import ChannelHeaderDropdownButton from './components/channel_header_dropdown_button';
import ChannelHeaderMenuButton from './components/channel_header_menu_button';
import CallWidget from './components/call_widget';
import ChannelLinkLabel from './components/channel_link_label';
import ChannelCallToast from './components/channel_call_toast';
import PostType from './components/custom_post_types/post_type';
import ExpandedView from './components/expanded_view';
import SwitchCallModal from './components/switch_call_modal';
import ScreenSourceModal from './components/screen_source_modal';
import EndCallModal from './components/end_call_modal';

import JoinUserSound from './sounds/join_user.mp3';
import JoinSelfSound from './sounds/join_self.mp3';
import LeaveSelfSound from './sounds/leave_self.mp3';

import reducer from './reducers';

import {
    getPluginPath,
    getPluginStaticPath,
    hasPermissionsToEnableCalls,
    getExpandedChannelID,
    getProfilesByIds,
    isDMChannel,
    getUserIdFromDM,
    getWSConnectionURL,
} from './utils';
import {logErr, logDebug} from './log';

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
    VOICE_CHANNEL_CALL_END,
    VOICE_CHANNEL_USER_SCREEN_ON,
    VOICE_CHANNEL_USER_SCREEN_OFF,
    VOICE_CHANNEL_USER_RAISE_HAND,
    VOICE_CHANNEL_USER_UNRAISE_HAND,
    VOICE_CHANNEL_UNINIT,
    VOICE_CHANNEL_ROOT_POST,
    SHOW_SWITCH_CALL_MODAL,
    SHOW_END_CALL_MODAL,
} from './action_types';

// eslint-disable-next-line import/no-unresolved
import {PluginRegistry, Store} from './types/mattermost-webapp';

export default class Plugin {
    private unsubscribers: (() => void)[];

    constructor() {
        this.unsubscribers = [];
    }

    private registerReconnectHandler(registry: PluginRegistry, store: Store, handler: () => void) {
        registry.registerReconnectHandler(handler);
        this.unsubscribers.push(() => registry.unregisterReconnectHandler(handler));
    }

    private registerWebSocketEvents(registry: PluginRegistry, store: Store, followThread: (channelID: string, teamID: string) => Promise<void>) {
        registry.registerWebSocketEventHandler(`custom_${pluginId}_channel_enable_voice`, (data) => {
            store.dispatch({
                type: VOICE_CHANNEL_ENABLE,
            });
        });

        registry.registerWebSocketEventHandler(`custom_${pluginId}_channel_disable_voice`, (data) => {
            store.dispatch({
                type: VOICE_CHANNEL_DISABLE,
            });
        });

        registry.registerWebSocketEventHandler(`custom_${pluginId}_user_connected`, async (ev) => {
            const userID = ev.data.userID;
            const channelID = ev.broadcast.channel_id;
            const currentUserID = getCurrentUserId(store.getState());

            if (window.callsClient) {
                if (userID === currentUserID) {
                    const audio = new Audio(getPluginStaticPath() + JoinSelfSound);
                    audio.play();
                } else if (channelID === connectedChannelID(store.getState())) {
                    const audio = new Audio(getPluginStaticPath() + JoinUserSound);
                    audio.play();
                }
            }

            store.dispatch({
                type: VOICE_CHANNEL_USER_CONNECTED,
                data: {
                    channelID,
                    userID,
                    currentUserID,
                },
            });

            try {
                store.dispatch({
                    type: VOICE_CHANNEL_PROFILE_CONNECTED,
                    data: {
                        profile: (await getProfilesByIds(store.getState(), [ev.data.userID]))[0],
                        channelID: ev.broadcast.channel_id,
                    },
                });
            } catch (err) {
                logErr(err);
            }
        });

        registry.registerWebSocketEventHandler(`custom_${pluginId}_user_disconnected`, (ev) => {
            store.dispatch({
                type: VOICE_CHANNEL_USER_DISCONNECTED,
                data: {
                    channelID: ev.broadcast.channel_id,
                    userID: ev.data.userID,
                    currentUserID: getCurrentUserId(store.getState()),
                },
            });
        });

        registry.registerWebSocketEventHandler(`custom_${pluginId}_user_muted`, (ev) => {
            store.dispatch({
                type: VOICE_CHANNEL_USER_MUTED,
                data: {
                    channelID: ev.broadcast.channel_id,
                    userID: ev.data.userID,
                },
            });
        });

        registry.registerWebSocketEventHandler(`custom_${pluginId}_user_unmuted`, (ev) => {
            store.dispatch({
                type: VOICE_CHANNEL_USER_UNMUTED,
                data: {
                    channelID: ev.broadcast.channel_id,
                    userID: ev.data.userID,
                },
            });
        });

        registry.registerWebSocketEventHandler(`custom_${pluginId}_user_voice_on`, (ev) => {
            store.dispatch({
                type: VOICE_CHANNEL_USER_VOICE_ON,
                data: {
                    channelID: ev.broadcast.channel_id,
                    userID: ev.data.userID,
                },
            });
        });

        registry.registerWebSocketEventHandler(`custom_${pluginId}_user_voice_off`, (ev) => {
            store.dispatch({
                type: VOICE_CHANNEL_USER_VOICE_OFF,
                data: {
                    channelID: ev.broadcast.channel_id,
                    userID: ev.data.userID,
                },
            });
        });

        registry.registerWebSocketEventHandler(`custom_${pluginId}_call_start`, (ev) => {
            const channelID = ev.broadcast.channel_id;

            store.dispatch({
                type: VOICE_CHANNEL_CALL_START,
                data: {
                    channelID,
                    startAt: ev.data.start_at,
                    ownerID: ev.data.owner_id,
                },
            });
            store.dispatch({
                type: VOICE_CHANNEL_ROOT_POST,
                data: {
                    channelID,
                    rootPost: ev.data.thread_id,
                },
            });

            if (window.callsClient?.channelID === channelID) {
                const channel = getChannel(store.getState(), channelID);
                if (channel) {
                    followThread(channel.id, channel.team_id);
                }
            }
        });

        registry.registerWebSocketEventHandler(`custom_${pluginId}_call_end`, (ev) => {
            if (connectedChannelID(store.getState()) === ev.broadcast.channel_id && window.callsClient) {
                window.callsClient.disconnect();
            }
            store.dispatch({
                type: VOICE_CHANNEL_CALL_END,
                data: {
                    channelID: ev.broadcast.channel_id,
                },
            });
        });

        registry.registerWebSocketEventHandler(`custom_${pluginId}_user_screen_on`, (ev) => {
            store.dispatch({
                type: VOICE_CHANNEL_USER_SCREEN_ON,
                data: {
                    channelID: ev.broadcast.channel_id,
                    userID: ev.data.userID,
                },
            });
        });

        registry.registerWebSocketEventHandler(`custom_${pluginId}_user_screen_off`, (ev) => {
            store.dispatch({
                type: VOICE_CHANNEL_USER_SCREEN_OFF,
                data: {
                    channelID: ev.broadcast.channel_id,
                },
            });
        });

        registry.registerWebSocketEventHandler(`custom_${pluginId}_user_raise_hand`, (ev) => {
            store.dispatch({
                type: VOICE_CHANNEL_USER_RAISE_HAND,
                data: {
                    channelID: ev.broadcast.channel_id,
                    userID: ev.data.userID,
                    raised_hand: ev.data.raised_hand,
                },
            });
        });

        registry.registerWebSocketEventHandler(`custom_${pluginId}_user_unraise_hand`, (ev) => {
            store.dispatch({
                type: VOICE_CHANNEL_USER_UNRAISE_HAND,
                data: {
                    channelID: ev.broadcast.channel_id,
                    userID: ev.data.userID,
                    raised_hand: ev.data.raised_hand,
                },
            });
        });
    }

    public async initialize(registry: PluginRegistry, store: Store): Promise<void> {
        // Setting the base URL if present, in case MM is running under a subpath.
        if (window.basename) {
            Client4.setUrl(window.basename);
        }

        registry.registerReducer(reducer);
        const sidebarChannelLinkLabelComponentID = registry.registerSidebarChannelLinkLabelComponent(ChannelLinkLabel);
        this.unsubscribers.push(() => registry.unregisterComponent(sidebarChannelLinkLabelComponentID));
        registry.registerChannelToastComponent(ChannelCallToast);
        registry.registerPostTypeComponent('custom_calls', PostType);
        registry.registerPostTypeComponent('custom_cloud_trial_req', PostTypeCloudTrialRequest);
        registry.registerNeedsTeamRoute('/expanded', ExpandedView);
        registry.registerGlobalComponent(SwitchCallModal);
        registry.registerGlobalComponent(ScreenSourceModal);
        registry.registerGlobalComponent(EndCallModal);

        registry.registerSlashCommandWillBePostedHook(async (message, args) => {
            const fullCmd = message.trim();
            const fields = fullCmd.split(/\s+/);
            if (fields.length < 2) {
                return {message, args};
            }

            const rootCmd = fields[0];
            const subCmd = fields[1];

            if (rootCmd !== '/call') {
                return {message, args};
            }

            const connectedID = connectedChannelID(store.getState());

            switch (subCmd) {
            case 'join':
            case 'start':
                if (subCmd === 'start') {
                    if (voiceConnectedUsersInChannel(store.getState(), args.channel_id).length > 0) {
                        return {error: {message: 'A call is already ongoing in the channel.'}};
                    }
                }
                if (!connectedID) {
                    let title = '';
                    if (fields.length > 2) {
                        title = fields.slice(2).join(' ');
                    }
                    connectCall(args.channel_id, title);
                    followThread(args.channel_id, args.team_id);
                    return {};
                }
                return {error: {message: 'You\'re already connected to a call in the current channel.'}};
            case 'leave':
                if (connectedID && args.channel_id === connectedID && window.callsClient) {
                    window.callsClient.disconnect();
                    return {};
                }
                return {error: {message: 'You\'re not connected to a call in the current channel.'}};
            case 'end':
                if (voiceConnectedUsersInChannel(store.getState(), args.channel_id)?.length === 0) {
                    return {error: {message: 'No ongoing call in the channel.'}};
                }

                if (!isCurrentUserSystemAdmin(store.getState()) &&
                    getCurrentUserId(store.getState()) !== voiceChannelCallOwnerID(store.getState(), args.channel_id)) {
                    return {error: {message: 'You don\'t have permission to end the call. Please ask the call owner to end call.'}};
                }

                store.dispatch({
                    type: SHOW_END_CALL_MODAL,
                    data: {
                        targetID: args.channel_id,
                    },
                });
                return {};
            case 'link':
                break;
            case 'experimental':
                if (fields.length < 3) {
                    break;
                }
                if (fields[2] === 'on') {
                    window.localStorage.setItem('calls_experimental_features', 'on');
                    logDebug('experimental features enabled');
                } else if (fields[2] === 'off') {
                    logDebug('experimental features disabled');
                    window.localStorage.removeItem('calls_experimental_features');
                }
                break;
            case 'stats':
                if (!window.callsClient) {
                    return {error: {message: 'You\'re not connected to any call'}};
                }
                try {
                    const stats = await window.callsClient.getStats();
                    logDebug(JSON.stringify(stats, null, 2));
                    return {message: `/call stats "${JSON.stringify(stats)}"`, args};
                } catch (err) {
                    return {error: {message: err}};
                }
            }

            return {message, args};
        });

        let channelHeaderMenuButtonID: string;
        const unregisterChannelHeaderMenuButton = () => {
            if (channelHeaderMenuButtonID) {
                registry.unregisterComponent(channelHeaderMenuButtonID);
                channelHeaderMenuButtonID = '';
            }
        };
        this.unsubscribers.push(unregisterChannelHeaderMenuButton);
        const registerChannelHeaderMenuButton = () => {
            if (channelHeaderMenuButtonID) {
                return;
            }

            channelHeaderMenuButtonID = registry.registerCallButtonAction(
                ChannelHeaderButton,
                ChannelHeaderDropdownButton,
                async (channel) => {
                    if (isCloudFeatureRestricted(store.getState())) {
                        store.dispatch(displayFreeTrial());
                        return;
                    }

                    if (isLimitRestricted(store.getState())) {
                        return;
                    }

                    try {
                        const users = voiceConnectedUsers(store.getState());
                        if (users && users.length > 0) {
                            store.dispatch({
                                type: VOICE_CHANNEL_PROFILES_CONNECTED,
                                data: {
                                    profiles: await getProfilesByIds(store.getState(), users),
                                    channelID: channel.id,
                                },
                            });
                        }
                    } catch (err) {
                        logErr(err);
                        return;
                    }

                    if (!connectedChannelID(store.getState())) {
                        connectCall(channel.id);

                        // following the thread only on join. On call start
                        // this is done in the call_start ws event handler.
                        if (voiceConnectedUsersInChannel(store.getState(), channel.id).length > 0) {
                            followThread(channel.id, channel.team_id);
                        }
                    } else if (connectedChannelID(store.getState()) !== channel.id) {
                        store.dispatch({
                            type: SHOW_SWITCH_CALL_MODAL,
                        });
                    }
                },
            );
        };

        const followThread = async (channelID: string, teamID: string) => {
            const threadID = voiceChannelRootPost(store.getState(), channelID);
            if (threadID) {
                store.dispatch(setThreadFollow(getCurrentUserId(store.getState()), teamID, threadID, true));
            } else {
                logErr('Unable to follow call\'s thread, not registered in store');
            }
        };

        registerChannelHeaderMenuButton();

        const connectCall = async (channelID: string, title?: string) => {
            try {
                if (window.callsClient) {
                    logErr('calls client is already initialized');
                    return;
                }

                window.callsClient = new CallsClient({
                    wsURL: getWSConnectionURL(getConfig(store.getState())),
                    iceServers: iceServers(store.getState()),
                });
                const globalComponentID = registry.registerGlobalComponent(CallWidget);
                const rootComponentID = registry.registerRootComponent(ExpandedView);
                window.callsClient.on('close', () => {
                    registry.unregisterComponent(globalComponentID);
                    registry.unregisterComponent(rootComponentID);
                    if (window.callsClient) {
                        window.callsClient.destroy();
                        delete window.callsClient;
                        const sound = getPluginStaticPath() + LeaveSelfSound;
                        const audio = new Audio(sound);
                        audio.play();
                    }
                });

                window.callsClient.init(channelID, title).catch((err: Error) => {
                    delete window.callsClient;
                    logErr(err);
                });
            } catch (err) {
                delete window.callsClient;
                logErr(err);
            }
        };
        const windowEventHandler = (ev: MessageEvent) => {
            if (ev.origin !== window.origin) {
                return;
            }
            if (ev.data && ev.data.type === 'connectCall') {
                connectCall(ev.data.channelID);
                followThread(ev.data.channelID, getCurrentTeamId(store.getState()));
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
                        logErr(err);
                    }
                },
            );
        };

        const fetchChannels = async () => {
            try {
                const resp = await axios.get(`${getPluginPath()}/channels`);
                for (let i = 0; i < resp.data.length; i++) {
                    store.dispatch({
                        type: VOICE_CHANNEL_USERS_CONNECTED,
                        data: {
                            users: resp.data[i].call?.users,
                            channelID: resp.data[i].channel_id,
                        },
                    });
                    if (!voiceChannelCallStartAt(store.getState(), resp.data[i].channel_id)) {
                        store.dispatch({
                            type: VOICE_CHANNEL_CALL_START,
                            data: {
                                channelID: resp.data[i].channel_id,
                                startAt: resp.data[i].call?.start_at,
                                ownerID: resp.data[i].call?.owner_id,
                            },
                        });
                    }
                }
            } catch (err) {
                logErr(err);
            }
        };

        const fetchChannelData = async (channelID: string) => {
            if (!channelID) {
                // Must be Global threads view, or another view that isn't a channel.
                return;
            }

            let channel = getChannel(store.getState(), channelID);
            if (!channel) {
                await getChannelAction(channelID)(store.dispatch as any, store.getState);
                channel = getChannel(store.getState(), channelID);
            }

            const systemRoles = getMySystemRoles(store.getState());
            const channelRoles = getMyChannelRoles(store.getState());
            const cms = getMyChannelMemberships(store.getState());

            if (isDMChannel(channel)) {
                const otherID = getUserIdFromDM(channel.name, getCurrentUserId(store.getState()));
                const dmUser = getUser(store.getState(), otherID);
                if (!dmUser) {
                    store.dispatch(getProfilesByIdsAction([otherID]));
                }
            }

            try {
                const allowEnable = allowEnableCalls(store.getState());
                registry.unregisterComponent(channelHeaderMenuID);
                if (hasPermissionsToEnableCalls(channel, cms[channelID], systemRoles, channelRoles, allowEnable)) {
                    registerChannelHeaderMenuAction();
                }
            } catch (err) {
                registry.unregisterComponent(channelHeaderMenuID);
                logErr(err);
            }

            try {
                const resp = await axios.get(`${getPluginPath()}/${channelID}`);
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
                if (resp.data.call?.thread_id) {
                    store.dispatch({
                        type: VOICE_CHANNEL_ROOT_POST,
                        data: {
                            channelID,
                            rootPost: resp.data.call?.thread_id,
                        },
                    });
                }
                if (resp.data.call?.users && resp.data.call?.users.length > 0) {
                    store.dispatch({
                        type: VOICE_CHANNEL_PROFILES_CONNECTED,
                        data: {
                            profiles: await getProfilesByIds(store.getState(), resp.data.call?.users),
                            channelID,
                        },
                    });
                }

                if (resp.data.call?.screen_sharing_id) {
                    store.dispatch({
                        type: VOICE_CHANNEL_USER_SCREEN_ON,
                        data: {
                            channelID,
                            userID: resp.data.call?.screen_sharing_id,
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
                logErr(err);
                store.dispatch({
                    type: VOICE_CHANNEL_DISABLE,
                });
            }
        };

        let configRetrieved = false;
        const onActivate = async () => {
            const res = await store.dispatch(getCallsConfig());

            // @ts-ignore
            if (!res.error) {
                configRetrieved = true;
            }

            fetchChannels();
            const currChannelId = getCurrentChannelId(store.getState());
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
        };

        this.unsubscribers.push(() => {
            if (window.callsClient) {
                window.callsClient.disconnect();
            }
            logDebug('resetting state');
            store.dispatch({
                type: VOICE_CHANNEL_UNINIT,
            });
        });

        this.registerWebSocketEvents(registry, store, followThread);
        this.registerReconnectHandler(registry, store, () => {
            logDebug('websocket reconnect handler');
            if (!window.callsClient) {
                logDebug('resetting state');
                store.dispatch({
                    type: VOICE_CHANNEL_UNINIT,
                });
            }
            onActivate();
        });

        onActivate();

        let currChannelId = getCurrentChannelId(store.getState());
        let joinCallParam = new URLSearchParams(window.location.search).get('join_call');
        this.unsubscribers.push(store.subscribe(() => {
            const currentChannelId = getCurrentChannelId(store.getState());
            if (currChannelId !== currentChannelId) {
                currChannelId = currentChannelId;

                // If we haven't retrieved config, user must not have been logged in during onActivate
                if (!configRetrieved) {
                    store.dispatch(getCallsConfig());
                    configRetrieved = true;
                }

                fetchChannelData(currChannelId);
                if (currChannelId && Boolean(joinCallParam) && !connectedChannelID(store.getState())) {
                    connectCall(currChannelId);
                }
                joinCallParam = '';
            }
        }));
    }

    uninitialize() {
        logDebug('uninitialize');
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

window.registerPlugin(pluginId, new Plugin());
