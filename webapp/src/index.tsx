import {Store, Action} from 'redux';

import {GlobalState} from 'mattermost-redux/types/store';

import {FormattedMessage} from 'react-intl';

import axios from 'axios';

import {Client4} from 'mattermost-redux/client';

import {canManageChannelMembers, getCurrentChannelId, getCurrentChannel} from 'mattermost-redux/selectors/entities/channels';
import {isDirectChannel, isGroupChannel} from 'mattermost-redux/utils/channel_utils';

import {getCurrentUserId} from 'mattermost-redux/selectors/entities/users';

import {isVoiceEnabled, connectedChannelID, voiceConnectedUsers} from 'selectors';

import manifest from './manifest';

import {newClient} from './connection';

import ChannelHeaderButton from './components/channel_header_button';
import ChannelHeaderMenuButton from './components/channel_header_menu_button';
import LeftSidebarHeader from './components/left_sidebar_header';
import RHSView from './components/right_hand_sidebar';
import ChannelHeaderTooltip from './components/channel_header_button_tooltip';

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
} from './action_types';

// eslint-disable-next-line import/no-unresolved
import {PluginRegistry} from './types/mattermost-webapp';

export default class Plugin {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-empty-function
    public async initialize(registry: PluginRegistry, store: Store<GlobalState, Action<Record<string, unknown>>>) {
        registry.registerReducer(reducer);
        registry.registerLeftSidebarHeaderComponent(LeftSidebarHeader);

        const {showRHSPlugin, hideRHSPlugin} = registry.registerRightHandSidebarComponent(
            RHSView,
            <FormattedMessage
                id='rhs.title'
                defaultMessage='Connected Users'
            />);

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
                            window.voiceClient = await newClient(store, channel.id, () => store.dispatch(hideRHSPlugin));
                        } catch (err) {
                            console.log(err);
                            return;
                        }

                        store.dispatch(showRHSPlugin);
                    } else if (connectedChannelID(store.getState()) === getCurrentChannelId(store.getState())) {
                        store.dispatch(showRHSPlugin);

                        // TODO: show an error or let the user switch connection.
                    }
                },
                ChannelHeaderTooltip,
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
            if (currChannelId !== currentChannelId) {
                console.log('channel switched');
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
                            users: resp.data.users,
                            channelID: currChannelId,
                        },
                    });
                    console.log(store.getState());

                    if (resp.data.enabled) {
                        actionID = registerChannelHeaderButtonAction();
                    }
                } catch (err) {
                    console.log(err);
                    store.dispatch({
                        type: VOICE_CHANNEL_DISABLE,
                    });
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
    }

    uninitialize() {
        if (window.voiceClient) {
            window.voiceClient.disconnect();
            delete window.voiceClient;
        }
    }
}

declare global {
    interface Window {
        registerPlugin(id: string, plugin: Plugin): void
    }
}

window.registerPlugin(manifest.id, new Plugin());
