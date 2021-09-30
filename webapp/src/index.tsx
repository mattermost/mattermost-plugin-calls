import {Store, Action} from 'redux';

import {GlobalState} from 'mattermost-redux/types/store';

import axios from 'axios';

import {Client4} from 'mattermost-redux/client';

import {canManageChannelMembers, getCurrentChannelId, getCurrentChannel} from 'mattermost-redux/selectors/entities/channels';
import {isDirectChannel, isGroupChannel} from 'mattermost-redux/utils/channel_utils';

import {getCurrentUserId} from 'mattermost-redux/selectors/entities/users';

import {isVoiceEnabled, connectedChannelID, voiceConnectedUsers, voiceChannelCallStartAt} from 'selectors';

import manifest from './manifest';

import {newClient} from './connection';

import ChannelHeaderButton from './components/channel_header_button';
import ChannelHeaderMenuButton from './components/channel_header_menu_button';
import CallWidget from './components/call_widget';
import ChannelHeaderTooltip from './components/channel_header_button_tooltip';
import ChannelLinkLabel from './components/channel_link_label';
import ChannelCallToast from './components/channel_call_toast';
import PostType from './components/post_type';

import reducer from './reducers';

import {getPluginPath} from './utils';

import {
    VOICE_CHANNEL_ENABLE,
    VOICE_CHANNEL_DISABLE,
    VOICE_CHANNEL_USER_CONNECTED,
    VOICE_CHANNEL_USER_DISCONNECTED,
    VOICE_CHANNEL_USERS_CONNECTED,
    VOICE_CHANNEL_PROFILES_CONNECTED,
    VOICE_CHANNEL_PROFILE_CONNECTED,
    VOICE_CHANNEL_USER_MUTED,
    VOICE_CHANNEL_USER_UNMUTED,
    VOICE_CHANNEL_USER_VOICE_OFF,
    VOICE_CHANNEL_USER_VOICE_ON,
    VOICE_CHANNEL_CALL_START,
    VOICE_CHANNEL_USER_SCREEN_ON,
    VOICE_CHANNEL_USER_SCREEN_OFF,
} from './action_types';

// eslint-disable-next-line import/no-unresolved
import {PluginRegistry} from './types/mattermost-webapp';

export default class Plugin {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-empty-function
    public async initialize(registry: PluginRegistry, store: Store<GlobalState, Action<Record<string, unknown>>>) {
        registry.registerReducer(reducer);
        registry.registerGlobalComponent(CallWidget);
        registry.registerSidebarChannelLinkLabelComponent(ChannelLinkLabel);
        registry.registerChannelToastComponent(ChannelCallToast);
        registry.registerPostTypeComponent('custom_calls', PostType);

        let actionID;

        const registerChannelHeaderButtonAction = ():string => {
            return registry.registerChannelHeaderButtonAction(
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
                        try {
                            window.callsClient = await newClient(channel.id);
                        } catch (err) {
                            console.log(err);
                        }
                    } else if (connectedChannelID(store.getState()) === getCurrentChannelId(store.getState())) {
                        // TODO: show an error or let the user switch connection.
                    }
                },

                // ChannelHeaderTooltip,
            );
        };

        let currChannelId = getCurrentChannelId(store.getState());

        let hasRegisteredMenuAction;
        const registerChannelHeaderMenuAction = () => {
            registry.registerChannelHeaderMenuAction(
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

        store.subscribe(async () => {
            const currentChannelId = getCurrentChannelId(store.getState());
            const firstLoad = currChannelId.length === 0 && currentChannelId.length > 0;
            if (firstLoad || currChannelId !== currentChannelId) {
                currChannelId = currentChannelId;
                registry.unregisterComponent(actionID);
                try {
                    const resp = await axios.get(`${getPluginPath()}/${currChannelId}`);
                    store.dispatch({
                        type: resp.data.enabled ? VOICE_CHANNEL_ENABLE : VOICE_CHANNEL_DISABLE,
                    });
                    store.dispatch({
                        type: VOICE_CHANNEL_USERS_CONNECTED,
                        data: {
                            users: resp.data.call?.users,
                            channelID: currChannelId,
                        },
                    });

                    if (resp.data.enabled) {
                        actionID = registerChannelHeaderButtonAction();
                    }
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
                        if (resp.data[i].channel_id === currentChannelId) {
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

                if (!hasRegisteredMenuAction) {
                    const channel = getCurrentChannel(store.getState());
                    if (!channel) {
                        return;
                    }
                    if ((isDirectChannel(channel) || isGroupChannel(channel)) || canManageChannelMembers(store.getState())) {
                        registerChannelHeaderMenuAction();
                        hasRegisteredMenuAction = true;
                    }
                }
            }
        });

        registry.registerWebSocketEventHandler(`custom_${manifest.id}_channel_enable_voice`, (data) => {
            store.dispatch({
                type: VOICE_CHANNEL_ENABLE,
            });
            actionID = registerChannelHeaderButtonAction();
        });

        registry.registerWebSocketEventHandler(`custom_${manifest.id}_channel_disable_voice`, (data) => {
            store.dispatch({
                type: VOICE_CHANNEL_DISABLE,
            });
            registry.unregisterComponent(actionID);
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
    }

    uninitialize() {
        if (window.callsClient) {
            window.callsClient.disconnect();
            delete window.callsClient;
        }
    }
}

declare global {
    interface Window {
        registerPlugin(id: string, plugin: Plugin): void
    }
}

window.registerPlugin(manifest.id, new Plugin());
