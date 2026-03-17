// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {CallChannelState} from '@mattermost/calls-common/lib/types';
import WebSocketClient from '@mattermost/client/websocket';
import {getChannel as getChannelAction} from 'mattermost-redux/actions/channels';
import {Client4} from 'mattermost-redux/client';
import {getChannel, getCurrentChannelId} from 'mattermost-redux/selectors/entities/channels';
import {getCurrentUserLocale} from 'mattermost-redux/selectors/entities/i18n';
import {getTheme} from 'mattermost-redux/selectors/entities/preferences';
import {getCurrentTeamId} from 'mattermost-redux/selectors/entities/teams';
import {getCurrentUserId, isCurrentUserSystemAdmin} from 'mattermost-redux/selectors/entities/users';
import {ActionFuncAsync} from 'mattermost-redux/types/actions';
import React, {useEffect} from 'react';
import ReactDOM from 'react-dom';
import {FormattedMessage, injectIntl, IntlProvider} from 'react-intl';
import {Provider} from 'react-redux';
import {AnyAction} from 'redux';
import {batchActions} from 'redux-batched-actions';
import {DisconnectReason, Room, RoomEvent} from 'livekit-client';
import {
    displayCallsTestModeUser,
    displayFreeTrial,
    displayGenericErrorModal,
    getCallsConfig,
    getCallsConfigEnvOverrides,
    getCallsVersionInfo,
    incomingCallOnChannel,
    loadProfilesByIdsIfMissing,
    localSessionClose,
    setClientConnecting,
    showSwitchCallModal,
} from 'src/actions';
import {CALL_START_POST_TYPE, DisabledCallsErr} from 'src/constants';
import RestClient from 'src/rest_client';
import slashCommandsHandler from 'src/slash_commands';

import {
    CALL_STATE,
    DISMISS_CALL,
    RECEIVED_CHANNEL_STATE,
    UNINIT,
    USERS_STATES,
} from './action_types';
import ChannelCallToast from './components/channel_call_toast';
import ChannelHeaderButton from './components/channel_header_button';
import ChannelHeaderDropdownButton from './components/channel_header_dropdown_button';
import ChannelHeaderMenuButton from './components/channel_header_menu_button';
import ChannelLinkLabel from './components/channel_link_label';
import PostType from './components/custom_post_types/post_type';
import LiveKitCallView from './components/livekit_call_view';
import CompassIcon from './components/icons/compassIcon';
import {IncomingCallContainer} from './components/incoming_calls/call_container';
import SwitchCallModal from './components/switch_call_modal';
import {logDebug, logErr, logWarn} from './log';
import {pluginId} from './manifest';
import reducer from './reducers';
import {
    callsExplicitlyDisabled,
    callsExplicitlyEnabled,
    callStartAtForCallInChannel,
    channelHasCall,
    channelIDForCurrentCall,
    defaultEnabled,
    hasPermissionsToEnableCalls,
    isCloudStarter,
    isLimitRestricted,
    ringingEnabled,
} from './selectors';
import {JOIN_CALL, keyToAction} from './shortcuts';
import {PluginRegistry, Store} from './types/mattermost-webapp';
import {
    followThread,
    getChannelURL,
    getPluginPath,
    getSessionsMapFromSessions,
    getTranslations,
    getUserIDsForSessions,
    playSound,
    setCallsGlobalCSSVars,
} from './utils';
import {
    handleCallEnd,
    handleCallHostChanged,
    handleCallStart,
    handleCallState,
    handleUserDismissedNotification,
    handleUserJoined,
    handleUserLeft,
    handleUserMuted,
    handleUserRemovedFromChannel,
    handleUserUnmuted,
} from './websocket_handlers';

export default class Plugin {
    private unsubscribers: (() => void)[];
    private wsClient: WebSocketClient | null;

    constructor() {
        this.unsubscribers = [];
        this.wsClient = null;
    }

    private registerReconnectHandler(registry: PluginRegistry, _store: Store, handler: () => void) {
        registry.registerReconnectHandler(handler);
        this.unsubscribers.push(() => registry.unregisterReconnectHandler(handler));
    }

    private registerWebSocketEvents(registry: PluginRegistry, store: Store) {
        registry.registerWebSocketEventHandler(`custom_${pluginId}_channel_enable_voice`, (ev) => {
            store.dispatch({
                type: RECEIVED_CHANNEL_STATE,
                data: {id: ev.broadcast.channel_id, enabled: true},
            });
        });

        registry.registerWebSocketEventHandler(`custom_${pluginId}_channel_disable_voice`, (ev) => {
            store.dispatch({
                type: RECEIVED_CHANNEL_STATE,
                data: {id: ev.broadcast.channel_id, enabled: false},
            });
        });

        registry.registerWebSocketEventHandler(`custom_${pluginId}_user_joined`, (ev) => {
            handleUserJoined(store, ev);
        });

        registry.registerWebSocketEventHandler(`custom_${pluginId}_user_left`, (ev) => {
            handleUserLeft(store, ev);
        });

        registry.registerWebSocketEventHandler(`custom_${pluginId}_user_muted`, (ev) => {
            handleUserMuted(store, ev);
        });

        registry.registerWebSocketEventHandler(`custom_${pluginId}_user_unmuted`, (ev) => {
            handleUserUnmuted(store, ev);
        });

        registry.registerWebSocketEventHandler(`custom_${pluginId}_call_start`, (ev) => {
            handleCallStart(store, ev);
        });

        registry.registerWebSocketEventHandler(`custom_${pluginId}_call_end`, (ev) => {
            handleCallEnd(store, ev);
        });

        registry.registerWebSocketEventHandler(`custom_${pluginId}_call_host_changed`, (ev) => {
            handleCallHostChanged(store, ev);
        });

        registry.registerWebSocketEventHandler(`custom_${pluginId}_user_dismissed_notification`, (ev) => {
            handleUserDismissedNotification(store, ev);
        });

        registry.registerWebSocketEventHandler(`custom_${pluginId}_call_state`, (ev) => {
            handleCallState(store, ev);
        });

        registry.registerWebSocketEventHandler('user_removed', (ev) => {
            handleUserRemovedFromChannel(store, ev);
        });
    }

    private initialize(registry: PluginRegistry, store: Store) {
        // Setting the base URL if present, in case MM is running under a subpath.
        if (window.basename) {
            RestClient.setUrl(window.basename);
            Client4.setUrl(window.basename);
        }

        const theme = getTheme(store.getState());
        setCallsGlobalCSSVars(theme.sidebarBg);

        // Register root DOM element for Calls. This is where the call view will render.
        if (!document.getElementById('calls')) {
            const callsRoot = document.createElement('div');
            callsRoot.setAttribute('id', 'calls');
            document.body.appendChild(callsRoot);
        }
        this.unsubscribers.push(() => {
            document.getElementById('calls')?.remove();
        });

        registry.registerReducer(reducer);
        const sidebarChannelLinkLabelComponentID = registry.registerSidebarChannelLinkLabelComponent(ChannelLinkLabel);
        this.unsubscribers.push(() => registry.unregisterComponent(sidebarChannelLinkLabelComponentID));
        registry.registerChannelToastComponent(injectIntl(ChannelCallToast));
        registry.registerPostTypeComponent(CALL_START_POST_TYPE, PostType);
        registry.registerGlobalComponent(injectIntl(SwitchCallModal));
        registry.registerGlobalComponent(injectIntl(IncomingCallContainer));

        registry.registerTranslations((locale: string) => {
            return getTranslations(locale);
        });

        registry.registerSlashCommandWillBePostedHook(async (message, args) => {
            return slashCommandsHandler(store, joinCall, message, args);
        });

        const disconnectCall = () => {
            if (window.livekitRoom) {
                window.livekitRoom.disconnect();
                delete window.livekitRoom;
            }

            const channelID = window.livekitChannelID;
            if (channelID) {
                if (this.wsClient) {
                    this.wsClient.sendMessage(`custom_${pluginId}_leave`, {});
                }
                store.dispatch(localSessionClose(channelID));
                delete window.livekitChannelID;
            }

            const callsRoot = document.getElementById('calls');
            if (callsRoot) {
                ReactDOM.unmountComponentAtNode(callsRoot);
            }

            playSound('leave_self');
        };

        const connectCall = async (channelID: string, title?: string, rootId?: string) => {
            try {
                if (window.livekitRoom) {
                    logErr('LiveKit room is already connected');
                    return;
                }

                store.dispatch(setClientConnecting(true));

                // 1. Send join message to Mattermost server (via Mattermost WS)
                if (this.wsClient) {
                    this.wsClient.sendMessage(`custom_${pluginId}_join`, {
                        channelID,
                        title: title || '',
                        threadID: rootId || '',
                    });
                }

                // Track the channel ID immediately so that disconnectCall()
                // can send a leave message even if the LiveKit connection fails.
                window.livekitChannelID = channelID;

                // 2. Fetch LiveKit token from plugin API
                const resp = await RestClient.fetch<{token: string; url: string}>(
                    `${getPluginPath()}/livekit-token?channel_id=${channelID}`,
                    {method: 'get'},
                );

                // 3. Create and connect LiveKit Room
                const room = new Room({
                    adaptiveStream: true,
                    dynacast: true,
                });

                await room.connect(resp.url, resp.token);
                window.livekitRoom = room;

                // Handle unexpected LiveKit disconnection (server goes down, network loss, etc.)
                room.on(RoomEvent.Disconnected, (reason?: DisconnectReason) => {
                    logWarn('LiveKit room disconnected unexpectedly', reason);
                    disconnectCall();
                    if (reason !== DisconnectReason.CLIENT_INITIATED) {
                        store.dispatch(displayGenericErrorModal(
                            {id: 'calls.error.call_disconnected_title', defaultMessage: 'Call disconnected'},
                            {id: 'calls.error.call_disconnected_message', defaultMessage: 'You were disconnected from the call. This may be due to a network issue or the call server becoming unavailable.'},
                        ));
                    }
                });

                // 4. Start with mic muted
                await room.localParticipant.setMicrophoneEnabled(false);

                // 5. Render the LiveKit call view
                const channel = getChannel(store.getState(), channelID);
                const locale = getCurrentUserLocale(store.getState()) || 'en';

                ReactDOM.render(
                    <Provider store={store}>
                        <IntlProvider
                            locale={locale}
                            key={locale}
                            defaultLocale='en'
                            messages={getTranslations(locale)}
                        >
                            <LiveKitCallView
                                channelID={channelID}
                                channelName={channel?.display_name || channelID}
                                onLeave={disconnectCall}
                            />
                        </IntlProvider>
                    </Provider>,
                    document.getElementById('calls'),
                );

                store.dispatch(setClientConnecting(false));
            } catch (err) {
                logErr(err);
                store.dispatch(setClientConnecting(false));
                disconnectCall();
                const errMsg = err instanceof Error ? err.message : String(err);
                store.dispatch(displayGenericErrorModal(
                    {id: 'calls.error.call_failed_title', defaultMessage: 'Call failed'},
                    {id: 'calls.error.call_failed_message', defaultMessage: `Failed to connect to the call server: ${errMsg}`},
                ));
            }
        };

        const connectToCall = async (channelId: string, teamId?: string, title?: string, rootId?: string) => {
            if (!channelIDForCurrentCall(store.getState())) {
                connectCall(channelId, title, rootId);

                // following the thread only on join. On call start
                // this is done in the call_start ws event handler.
                if (channelHasCall(store.getState(), channelId)) {
                    followThread(store, channelId, teamId);
                }
            } else if (channelIDForCurrentCall(store.getState()) !== channelId) {
                store.dispatch(showSwitchCallModal(channelId));
            }
        };

        const joinCall = async (channelId: string, teamId?: string, title?: string, rootId?: string) => {
            const explicitlyEnabled = callsExplicitlyEnabled(store.getState(), channelId);
            const explicitlyDisabled = callsExplicitlyDisabled(store.getState(), channelId);

            if (channelHasCall(store.getState(), channelId) || explicitlyEnabled || (!explicitlyDisabled && defaultEnabled(store.getState()))) {
                if (isLimitRestricted(store.getState())) {
                    if (isCloudStarter(store.getState())) {
                        store.dispatch(displayFreeTrial());
                        return;
                    }
                    return;
                }

                await connectToCall(channelId, teamId, title, rootId);
                return;
            }

            if (explicitlyDisabled) {
                throw DisabledCallsErr;
            }

            // We are in TestMode (DefaultEnabled=false)
            if (isCurrentUserSystemAdmin(store.getState())) {
                await connectToCall(channelId, teamId, title, rootId);
            } else {
                store.dispatch(displayCallsTestModeUser());
            }
        };

        let channelHeaderMenuButtonID: string;
        const unregisterChannelHeaderMenuButton = () => {
            if (channelHeaderMenuButtonID) {
                registry.unregisterComponent(channelHeaderMenuButtonID);
                channelHeaderMenuButtonID = '';
            }
        };
        this.unsubscribers.push(unregisterChannelHeaderMenuButton);
        const ChannelHeaderIcon = () => (
            <CompassIcon
                icon='phone'
                style={{fontSize: '18px', lineHeight: '18px', color: 'rgba(var(--center-channel-color-rgb), 0.64)'}}
            />
        );
        const ChannelHeaderDropdownText = () => (<FormattedMessage defaultMessage='Start call'/>);
        const registerChannelHeaderMenuButton = () => {
            if (channelHeaderMenuButtonID) {
                return;
            }

            channelHeaderMenuButtonID = registry.registerCallButtonAction(
                ChannelHeaderButton,
                ChannelHeaderDropdownButton,
                async (channel) => {
                    joinCall(channel.id, channel.team_id);
                },
                ChannelHeaderIcon,
                ChannelHeaderDropdownText,
            );
        };

        registerChannelHeaderMenuButton();

        const fetchChannels = async (skipChannelID?: string): Promise<AnyAction[]> => {
            const actions = [];
            try {
                const data = await RestClient.fetch<CallChannelState[]>(`${getPluginPath()}/channels`, {method: 'get'});

                for (let i = 0; i < data.length; i++) {
                    if (skipChannelID === data[i].channel_id) {
                        logDebug('skipping channel from state loading', skipChannelID);
                        continue;
                    }

                    actions.push({
                        type: RECEIVED_CHANNEL_STATE,
                        data: {
                            id: data[i].channel_id,
                            enabled: data[i].enabled,
                        },
                    });

                    const call = data[i].call;

                    if (!call || !call.sessions?.length) {
                        continue;
                    }

                    store.dispatch(loadProfilesByIdsIfMissing(getUserIDsForSessions(call.sessions)));

                    if (!callStartAtForCallInChannel(store.getState(), data[i].channel_id)) {
                        actions.push({
                            type: CALL_STATE,
                            data: {
                                ID: call.id,
                                channelID: data[i].channel_id,
                                startAt: call.start_at,
                                ownerID: call.owner_id,
                                threadID: call.thread_id,
                            },
                        });

                        actions.push({
                            type: USERS_STATES,
                            data: {
                                states: getSessionsMapFromSessions(call.sessions),
                                channelID: data[i].channel_id,
                            },
                        });

                        if (ringingEnabled(store.getState()) && data[i].call) {
                            const dismissed = call.dismissed_notification;
                            if (dismissed) {
                                const currentUserID = getCurrentUserId(store.getState());
                                if (Object.hasOwn(dismissed, currentUserID) && dismissed[currentUserID]) {
                                    actions.push({
                                        type: DISMISS_CALL,
                                        data: {
                                            callID: call.id,
                                        },
                                    });
                                    continue;
                                }
                            }
                            store.dispatch(incomingCallOnChannel(data[i].channel_id, call.id, call.owner_id, call.start_at));
                        }
                    }
                }
            } catch (err) {
                logErr(err);
            }

            return actions;
        };

        let channelHeaderMenuID: string;
        const registerChannelHeaderMenuAction = () => {
            channelHeaderMenuID = registry.registerChannelHeaderMenuAction(
                ChannelHeaderMenuButton,
                async () => {
                    try {
                        const data = await RestClient.fetch<{ enabled: boolean }>(`${getPluginPath()}/${currChannelId}`, {
                            method: 'post',
                            body: JSON.stringify({enabled: callsExplicitlyDisabled(store.getState(), currChannelId)}),
                        });

                        store.dispatch({
                            type: RECEIVED_CHANNEL_STATE,
                            data: {id: currChannelId, enabled: data.enabled},
                        });
                    } catch (err) {
                        logErr(err);
                    }
                },
            );
        };

        const registerHeaderMenuComponentIfNeeded = async (channelID: string) => {
            try {
                registry.unregisterComponent(channelHeaderMenuID);
                if (hasPermissionsToEnableCalls(store.getState(), channelID)) {
                    registerChannelHeaderMenuAction();
                }
            } catch (err) {
                registry.unregisterComponent(channelHeaderMenuID);
                logErr(err);
            }
        };

        // Run onActivate once we're logged in.
        const unsubscribeActivateListener = store.subscribe(() => {
            if (getCurrentUserId(store.getState())) {
                onActivate();
            }
        });

        const onActivate = async (wsClient?: WebSocketClient) => {
            if (!getCurrentUserId(store.getState())) {
                return;
            }

            unsubscribeActivateListener();

            const requests = [store.dispatch(getCallsConfig()), store.dispatch(getCallsVersionInfo())];
            if (isCurrentUserSystemAdmin(store.getState())) {
                requests.push(store.dispatch(getCallsConfigEnvOverrides()));
            }

            await Promise.all(requests);

            const currentCallChannelID = channelIDForCurrentCall(store.getState());

            const actions = await fetchChannels(currentCallChannelID);
            store.dispatch(batchActions(actions));

            if (currentCallChannelID) {
                if (wsClient) {
                    logDebug('requesting call state through ws');
                    wsClient.sendMessage(`custom_${pluginId}_call_state`, {channelID: currentCallChannelID});
                } else {
                    logErr('unexpected missing wsClient');
                }
            }

            const currChannelId = getCurrentChannelId(store.getState());
            if (currChannelId) {
                await registerHeaderMenuComponentIfNeeded(currChannelId);
            }
        };

        this.unsubscribers.push(() => {
            if (window.livekitRoom) {
                window.livekitRoom.disconnect();
                delete window.livekitRoom;
                delete window.livekitChannelID;
            }
            logDebug('resetting state');
            store.dispatch({
                type: UNINIT,
            });
        });

        // A dummy React component to access webapp's WebSocket client.
        registry.registerGlobalComponent(() => {
            const client = window.ProductApi.useWebSocketClient();
            this.wsClient = client;

            useEffect(() => {
                logDebug('registering ws reconnect handler');
                this.registerReconnectHandler(registry, store, () => {
                    logDebug('websocket reconnect handler');
                    if (!window.livekitRoom) {
                        logDebug('resetting state');
                        store.dispatch({
                            type: UNINIT,
                        });
                    }
                    onActivate(client);
                });
            }, []);

            return null;
        });
        this.registerWebSocketEvents(registry, store);

        let currChannelId = getCurrentChannelId(store.getState());
        let joinCallParam = new URLSearchParams(window.location.search).get('join_call');
        this.unsubscribers.push(store.subscribe(() => {
            const currentChannelId = getCurrentChannelId(store.getState());
            if (currChannelId !== currentChannelId) {
                const firstLoad = !currChannelId;
                currChannelId = currentChannelId;

                if (firstLoad) {
                    registerHeaderMenuComponentIfNeeded(currentChannelId);
                }

                if (currChannelId && Boolean(joinCallParam) && !channelIDForCurrentCall(store.getState())) {
                    connectCall(currChannelId);
                }
                joinCallParam = '';
            }
        }));

        const handleKBShortcuts = (ev: KeyboardEvent) => {
            switch (keyToAction('global', ev)) {
            case JOIN_CALL:
                joinCall(getCurrentChannelId(store.getState()), getCurrentTeamId(store.getState()));
                break;
            }
        };

        document.addEventListener('keydown', handleKBShortcuts, true);
        this.unsubscribers.push(() => document.removeEventListener('keydown', handleKBShortcuts, true));

        // Handle connectCall messages from other components (e.g., channel toast join button via useDismissJoin hook)
        const handleConnectCallMessage = (ev: MessageEvent) => {
            if (ev.origin !== window.origin) {
                return;
            }
            if (ev.data?.type === 'connectCall' && ev.data?.channelID) {
                joinCall(ev.data.channelID, getCurrentTeamId(store.getState()));
            }
        };
        window.addEventListener('message', handleConnectCallMessage);
        this.unsubscribers.push(() => window.removeEventListener('message', handleConnectCallMessage));
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

        livekitRoom?: Room,
        livekitChannelID?: string,
        webkitAudioContext: AudioContext,
        basename: string,

        desktop?: {
            version?: string | null;
        },
        screenSharingTrackId: string,
        WebappUtils: any,

        ProductApi: {
            useWebSocketClient: () => WebSocketClient,
            WebSocketProvider: React.Context<WebSocketClient>,
            selectRhsPost: (postId: string) => ActionFuncAsync,
        };
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
