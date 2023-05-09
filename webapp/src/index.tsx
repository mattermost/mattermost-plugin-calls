/* eslint-disable max-lines */

import React from 'react';
import ReactDOM from 'react-dom';
import {injectIntl, IntlProvider} from 'react-intl';
import {Provider} from 'react-redux';

import {AnyAction} from 'redux';

import {Client4} from 'mattermost-redux/client';
import {getCurrentChannelId, getChannel} from 'mattermost-redux/selectors/entities/channels';
import {getCurrentTeamId} from 'mattermost-redux/selectors/entities/teams';
import {getCurrentUserId, getUser, isCurrentUserSystemAdmin} from 'mattermost-redux/selectors/entities/users';
import {getCurrentUserLocale} from 'mattermost-redux/selectors/entities/i18n';
import {getChannel as getChannelAction} from 'mattermost-redux/actions/channels';
import {getProfilesByIds as getProfilesByIdsAction} from 'mattermost-redux/actions/users';
import {getConfig} from 'mattermost-redux/selectors/entities/general';

import {batchActions} from 'redux-batched-actions';

import {UserState, CallChannelState} from '@calls/common/lib/types';

import {
    displayFreeTrial,
    getCallsConfig,
    displayCallErrorModal,
    showScreenSourceModal,
    displayCallsTestModeUser,
} from 'src/actions';
import RecordingQuality from 'src/components/admin_console_settings/recordings/recording_quality';

import slashCommandsHandler from 'src/slash_commands';

import {PostTypeCloudTrialRequest} from 'src/components/custom_post_types/post_type_cloud_trial_request';
import {PostTypeRecording} from 'src/components/custom_post_types/post_type_recording';
import RTCDServiceUrl from 'src/components/admin_console_settings/rtcd_service_url';
import EnableRecordings from 'src/components/admin_console_settings/recordings/enable_recordings';
import MaxRecordingDuration from 'src/components/admin_console_settings/recordings/max_recording_duration';
import JobServiceURL from 'src/components/admin_console_settings/recordings/job_service_url';
import TestMode from 'src/components/admin_console_settings/test_mode';
import UDPServerPort from 'src/components/admin_console_settings/udp_server_port';
import UDPServerAddress from 'src/components/admin_console_settings/udp_server_address';
import ICEHostOverride from 'src/components/admin_console_settings/ice_host_override';

import {DisabledCallsErr} from 'src/constants';
import {CallActions, CurrentCallData, CurrentCallDataDefault} from 'src/types/types';

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
    handleUserReaction,
    handleCallHostChanged,
    handleCallRecordingState,
} from './websocket_handlers';

import {
    connectedChannelID,
    voiceConnectedUsers,
    voiceConnectedUsersInChannel,
    voiceChannelCallStartAt,
    isLimitRestricted,
    iceServers,
    needsTURNCredentials,
    defaultEnabled,
    isCloudStarter,
    channelHasCall,
    callsExplicitlyEnabled,
    callsExplicitlyDisabled,
    hasPermissionsToEnableCalls,
    callsConfig,
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

import reducer from './reducers';

import {
    getPluginPath,
    getExpandedChannelID,
    getProfilesByIds,
    isDMChannel,
    getUserIdFromDM,
    getWSConnectionURL,
    playSound,
    followThread,
    shouldRenderDesktopWidget,
    sendDesktopEvent,
    getChannelURL,
    getTranslations,
} from './utils';
import {logErr, logDebug} from './log';
import {
    JOIN_CALL,
    keyToAction,
} from './shortcuts';

import {
    RECEIVED_CHANNEL_STATE,
    VOICE_CHANNEL_USER_CONNECTED,
    VOICE_CHANNEL_USERS_CONNECTED,
    VOICE_CHANNEL_USERS_CONNECTED_STATES,
    VOICE_CHANNEL_PROFILES_CONNECTED,
    VOICE_CHANNEL_CALL_START,
    VOICE_CHANNEL_USER_SCREEN_ON,
    VOICE_CHANNEL_UNINIT,
    VOICE_CHANNEL_ROOT_POST,
    SHOW_SWITCH_CALL_MODAL,
    DESKTOP_WIDGET_CONNECTED,
    VOICE_CHANNEL_CALL_HOST,
    VOICE_CHANNEL_CALL_RECORDING_STATE,
    VOICE_CHANNEL_USER_MUTED,
    VOICE_CHANNEL_USER_UNMUTED,
    VOICE_CHANNEL_USER_RAISE_HAND,
    VOICE_CHANNEL_USER_UNRAISE_HAND,
} from './action_types';
import {PluginRegistry, Store} from './types/mattermost-webapp';

export default class Plugin {
    private unsubscribers: (() => void)[];

    constructor() {
        this.unsubscribers = [];
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

        registry.registerWebSocketEventHandler(`custom_${pluginId}_user_connected`, (ev) => {
            handleUserConnected(store, ev);
        });

        registry.registerWebSocketEventHandler(`custom_${pluginId}_user_disconnected`, (ev) => {
            handleUserDisconnected(store, ev);
        });

        registry.registerWebSocketEventHandler(`custom_${pluginId}_user_muted`, (ev) => {
            handleUserMuted(store, ev);
        });

        registry.registerWebSocketEventHandler(`custom_${pluginId}_user_unmuted`, (ev) => {
            handleUserUnmuted(store, ev);
        });

        registry.registerWebSocketEventHandler(`custom_${pluginId}_user_voice_on`, (ev) => {
            handleUserVoiceOn(store, ev);
        });

        registry.registerWebSocketEventHandler(`custom_${pluginId}_user_voice_off`, (ev) => {
            handleUserVoiceOff(store, ev);
        });

        registry.registerWebSocketEventHandler(`custom_${pluginId}_call_start`, (ev) => {
            handleCallStart(store, ev);
        });

        registry.registerWebSocketEventHandler(`custom_${pluginId}_call_end`, (ev) => {
            handleCallEnd(store, ev);
        });

        registry.registerWebSocketEventHandler(`custom_${pluginId}_user_screen_on`, (ev) => {
            handleUserScreenOn(store, ev);
        });

        registry.registerWebSocketEventHandler(`custom_${pluginId}_user_screen_off`, (ev) => {
            handleUserScreenOff(store, ev);
        });

        registry.registerWebSocketEventHandler(`custom_${pluginId}_user_raise_hand`, (ev) => {
            handleUserRaisedHand(store, ev);
        });

        registry.registerWebSocketEventHandler(`custom_${pluginId}_user_unraise_hand`, (ev) => {
            handleUserUnraisedHand(store, ev);
        });

        registry.registerWebSocketEventHandler(`custom_${pluginId}_user_reacted`, (ev) => {
            handleUserReaction(store, ev);
        });

        registry.registerWebSocketEventHandler(`custom_${pluginId}_call_host_changed`, (ev) => {
            handleCallHostChanged(store, ev);
        });

        registry.registerWebSocketEventHandler(`custom_${pluginId}_call_recording_state`, (ev) => {
            handleCallRecordingState(store, ev);
        });
    }

    private initialize(registry: PluginRegistry, store: Store) {
        // Setting the base URL if present, in case MM is running under a subpath.
        if (window.basename) {
            Client4.setUrl(window.basename);
        }

        // Register root DOM element for Calls. This is where the widget will render.
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
        registry.registerPostTypeComponent('custom_calls', PostType);
        registry.registerPostTypeComponent('custom_calls_recording', PostTypeRecording);
        registry.registerPostTypeComponent('custom_cloud_trial_req', PostTypeCloudTrialRequest);
        registry.registerNeedsTeamRoute('/expanded', injectIntl(ExpandedView));
        registry.registerGlobalComponent(injectIntl(SwitchCallModal));
        registry.registerGlobalComponent(injectIntl(ScreenSourceModal));
        registry.registerGlobalComponent(injectIntl(EndCallModal));

        registry.registerTranslations((locale: string) => {
            return getTranslations(locale);
        });

        registry.registerSlashCommandWillBePostedHook(async (message, args) => {
            return slashCommandsHandler(store, joinCall, message, args);
        });

        const connectToCall = async (channelId: string, teamId: string, title?: string, rootId?: string) => {
            try {
                const users = voiceConnectedUsers(store.getState());
                if (users && users.length > 0) {
                    store.dispatch({
                        type: VOICE_CHANNEL_PROFILES_CONNECTED,
                        data: {
                            profiles: await getProfilesByIds(store.getState(), users),
                            channelId,
                        },
                    });
                }
            } catch (err) {
                logErr(err);
            }

            if (!connectedChannelID(store.getState())) {
                connectCall(channelId, title, rootId);

                // following the thread only on join. On call start
                // this is done in the call_start ws event handler.
                if (voiceConnectedUsersInChannel(store.getState(), channelId).length > 0) {
                    followThread(store, channelId, teamId);
                }
            } else if (connectedChannelID(store.getState()) !== channelId) {
                store.dispatch({
                    type: SHOW_SWITCH_CALL_MODAL,
                });
            }
        };

        const joinCall = async (channelId: string, teamId: string, title?: string, rootId?: string) => {
            // Anyone can join a call already in progress.
            // If explicitly enabled, everyone can start calls.
            // In LiveMode (DefaultEnabled=true):
            //   - everyone can start a call unless it has been disabled
            // If explicitly disabled, no-one can start calls.
            // In TestMode (DefaultEnabled=false):
            //   - sysadmins can start a call, but they receive an ephemeral message (server-side)
            //   - non-sysadmins cannot start a call and are shown a prompt

            const explicitlyEnabled = callsExplicitlyEnabled(store.getState(), channelId);
            const explicitlyDisabled = callsExplicitlyDisabled(store.getState(), channelId);

            // Note: not super happy with using explicitlyDisabled both here and below, but wanted to keep the "able to start" logic confined to one place.
            if (channelHasCall(store.getState(), channelId) || explicitlyEnabled || (!explicitlyDisabled && defaultEnabled(store.getState()))) {
                if (isLimitRestricted(store.getState())) {
                    if (isCloudStarter(store.getState())) {
                        store.dispatch(displayFreeTrial());
                        return;
                    }

                    // Don't allow a join if over limits (UI will have shown this info).
                    return;
                }

                await connectToCall(channelId, teamId, title, rootId);
                return;
            }

            if (explicitlyDisabled) {
                // UI should not have shown, so this is a response to a slash command.
                throw DisabledCallsErr;
            }

            // We are in TestMode (DefaultEnabled=false)
            if (isCurrentUserSystemAdmin(store.getState())) {
                // Rely on server side to send ephemeral message.
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
            );
        };

        registerChannelHeaderMenuButton();

        registry.registerAdminConsoleCustomSetting('RTCDServiceURL', RTCDServiceUrl);
        registry.registerAdminConsoleCustomSetting('EnableRecordings', EnableRecordings);
        registry.registerAdminConsoleCustomSetting('MaxRecordingDuration', MaxRecordingDuration);
        registry.registerAdminConsoleCustomSetting('RecordingQuality', RecordingQuality);
        registry.registerAdminConsoleCustomSetting('JobServiceURL', JobServiceURL);
        registry.registerAdminConsoleCustomSetting('DefaultEnabled', TestMode);
        registry.registerAdminConsoleCustomSetting('UDPServerAddress', UDPServerAddress);
        registry.registerAdminConsoleCustomSetting('UDPServerPort', UDPServerPort);
        registry.registerAdminConsoleCustomSetting('ICEHostOverride', ICEHostOverride);

        const connectCall = async (channelID: string, title?: string, rootId?: string) => {
            if (shouldRenderDesktopWidget()) {
                logDebug('sending join call message to desktop app');
                sendDesktopEvent('calls-join-call', {
                    callID: channelID,
                    title,
                    channelURL: getChannelURL(store.getState(), getChannel(store.getState(), channelID), getCurrentTeamId(store.getState())),
                    rootID: rootId,
                });
                return;
            }

            try {
                if (window.callsClient) {
                    logErr('calls client is already initialized');
                    return;
                }

                const state = store.getState();
                const iceConfigs = [...iceServers(state)];
                if (needsTURNCredentials(state)) {
                    logDebug('turn credentials needed');
                    try {
                        iceConfigs.push(...await Client4.doFetch<RTCIceServer[]>(`${getPluginPath()}/turn-credentials`, {method: 'get'}));
                    } catch (err) {
                        logErr(err);
                    }
                }

                window.callsClient = new CallsClient({
                    wsURL: getWSConnectionURL(getConfig(state)),
                    iceServers: iceConfigs,
                    simulcast: callsConfig(state).EnableSimulcast,
                });
                window.currentCallData = CurrentCallDataDefault;

                const locale = getCurrentUserLocale(state) || 'en';

                ReactDOM.render(
                    <Provider store={store}>
                        <IntlProvider
                            locale={locale}
                            key={locale}
                            defaultLocale='en'
                            messages={getTranslations(locale)}
                        >
                            <CallWidget/>
                        </IntlProvider>
                    </Provider>,
                    document.getElementById('calls'),
                );
                const unmountCallWidget = () => {
                    const callsRoot = document.getElementById('calls');
                    if (callsRoot) {
                        ReactDOM.unmountComponentAtNode(callsRoot);
                    }
                };

                // DEPRECATED
                let rootComponentID: string;

                // This is only needed to support desktop versions < 5.3 that
                // didn't implement the global widget and mounted the expanded view
                // on top of the center channel view.
                if (window.desktop) {
                    rootComponentID = registry.registerRootComponent(injectIntl(ExpandedView));
                }

                window.callsClient.on('close', (err?: Error) => {
                    unmountCallWidget();
                    if (window.desktop) {
                        registry.unregisterComponent(rootComponentID);
                    }
                    if (window.callsClient) {
                        if (err) {
                            store.dispatch(displayCallErrorModal(window.callsClient.channelID, err));
                        }
                        window.callsClient.destroy();
                        delete window.callsClient;
                        delete window.currentCallData;
                        playSound('leave_self');
                    }
                });

                window.callsClient.on('mute', () => {
                    store.dispatch({
                        type: VOICE_CHANNEL_USER_MUTED,
                        data: {
                            channelID: window.callsClient?.channelID,
                            userID: getCurrentUserId(store.getState()),
                        },
                    });
                });

                window.callsClient.on('unmute', () => {
                    store.dispatch({
                        type: VOICE_CHANNEL_USER_UNMUTED,
                        data: {
                            channelID: window.callsClient?.channelID,
                            userID: getCurrentUserId(store.getState()),
                        },
                    });
                });

                window.callsClient.on('raise_hand', () => {
                    store.dispatch({
                        type: VOICE_CHANNEL_USER_RAISE_HAND,
                        data: {
                            channelID: window.callsClient?.channelID,
                            userID: getCurrentUserId(store.getState()),
                            raised_hand: Date.now(),
                        },
                    });
                });

                window.callsClient.on('lower_hand', () => {
                    store.dispatch({
                        type: VOICE_CHANNEL_USER_UNRAISE_HAND,
                        data: {
                            channelID: window.callsClient?.channelID,
                            userID: getCurrentUserId(store.getState()),
                        },
                    });
                });

                window.callsClient.init(channelID, title, rootId).catch((err: Error) => {
                    logErr(err);
                    unmountCallWidget();
                    store.dispatch(displayCallErrorModal(channelID, err));
                    delete window.callsClient;
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
            if (ev.data?.type === 'connectCall') {
                connectCall(ev.data.channelID);
                followThread(store, ev.data.channelID, getCurrentTeamId(store.getState()));
            } else if (ev.data?.type === 'desktop-sources-modal-request') {
                store.dispatch(showScreenSourceModal());
            } else if (ev.data?.type === 'calls-joined-call') {
                store.dispatch({
                    type: DESKTOP_WIDGET_CONNECTED,
                    data: {channelID: ev.data.message.callID},
                });
            } else if (ev.data?.type === 'calls-error' && ev.data.message.err === 'client-error') {
                store.dispatch(displayCallErrorModal(ev.data.message.callID, new Error(ev.data.message.errMsg)));
            } else if (ev.data?.type === 'calls-run-slash-command') {
                slashCommandsHandler(store, joinCall, ev.data.message, ev.data.args);
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
                async () => {
                    try {
                        const data = await Client4.doFetch<{enabled: boolean}>(`${getPluginPath()}/${currChannelId}`, {
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

        const fetchChannels = async (): Promise<AnyAction[]> => {
            const actions = [];
            try {
                const data = await Client4.doFetch<CallChannelState[]>(`${getPluginPath()}/channels`, {method: 'get'});

                for (let i = 0; i < data.length; i++) {
                    actions.push({
                        type: VOICE_CHANNEL_USERS_CONNECTED,
                        data: {
                            users: data[i].call?.users,
                            channelID: data[i].channel_id,
                        },
                    });
                    if (!voiceChannelCallStartAt(store.getState(), data[i].channel_id)) {
                        actions.push({
                            type: VOICE_CHANNEL_CALL_START,
                            data: {
                                channelID: data[i].channel_id,
                                startAt: data[i].call?.start_at,
                                ownerID: data[i].call?.owner_id,
                                hostID: data[i].call?.host_id,
                            },
                        });
                    }
                }
            } catch (err) {
                logErr(err);
            }

            return actions;
        };

        const fetchChannelData = async (channelID: string): Promise<AnyAction[]> => {
            if (!channelID) {
                // Must be Global threads view, or another view that isn't a channel.
                return [];
            }

            let channel = getChannel(store.getState(), channelID);
            if (!channel) {
                await store.dispatch(getChannelAction(channelID));
                channel = getChannel(store.getState(), channelID);
            }

            if (isDMChannel(channel)) {
                const otherID = getUserIdFromDM(channel.name, getCurrentUserId(store.getState()));
                const dmUser = getUser(store.getState(), otherID);
                if (!dmUser) {
                    store.dispatch(getProfilesByIdsAction([otherID]));
                }
            }

            try {
                registry.unregisterComponent(channelHeaderMenuID);
                if (hasPermissionsToEnableCalls(store.getState(), channelID)) {
                    registerChannelHeaderMenuAction();
                }
            } catch (err) {
                registry.unregisterComponent(channelHeaderMenuID);
                logErr(err);
            }

            const actions = [];

            try {
                const data = await Client4.doFetch<CallChannelState>(`${getPluginPath()}/${channelID}`, {method: 'get'});
                actions.push({
                    type: RECEIVED_CHANNEL_STATE,
                    data: {id: channelID, enabled: data.enabled},
                });

                const call = data.call;
                if (!call) {
                    return actions;
                }

                actions.push({
                    type: VOICE_CHANNEL_CALL_START,
                    data: {
                        channelID,
                        startAt: call.start_at,
                        ownerID: call.owner_id,
                        hostID: call.host_id,
                    },
                });

                actions.push({
                    type: VOICE_CHANNEL_USERS_CONNECTED,
                    data: {
                        users: call.users || [],
                        channelID,
                    },
                });

                actions.push({
                    type: VOICE_CHANNEL_ROOT_POST,
                    data: {
                        channelID,
                        rootPost: call.thread_id,
                    },
                });

                actions.push({
                    type: VOICE_CHANNEL_CALL_HOST,
                    data: {
                        channelID,
                        hostID: call.host_id,
                    },
                });

                if (call.users && call.users.length > 0) {
                    actions.push({
                        type: VOICE_CHANNEL_PROFILES_CONNECTED,
                        data: {
                            profiles: await getProfilesByIds(store.getState(), call.users),
                            channelID,
                        },
                    });
                }

                actions.push({
                    type: VOICE_CHANNEL_CALL_RECORDING_STATE,
                    data: {
                        callID: channelID,
                        recState: call.recording,
                    },
                });

                actions.push({
                    type: VOICE_CHANNEL_USER_SCREEN_ON,
                    data: {
                        channelID,
                        userID: call.screen_sharing_id,
                    },
                });

                const userStates: Record<string, UserState> = {};
                const users = call.users || [];
                const states = call.states || [];
                for (let i = 0; i < users.length; i++) {
                    userStates[users[i]] = {...states[i], id: users[i]};
                }
                actions.push({
                    type: VOICE_CHANNEL_USERS_CONNECTED_STATES,
                    data: {
                        states: userStates,
                        channelID,
                    },
                });
            } catch (err) {
                logErr(err);
                actions.push({
                    type: RECEIVED_CHANNEL_STATE,
                    data: {id: channelID, enabled: false},
                });
            }

            return actions;
        };

        let configRetrieved = false;
        const onActivate = async () => {
            if (!getCurrentUserId(store.getState())) {
                // not logged in, returning.
                return;
            }

            const res = await store.dispatch(getCallsConfig());

            // @ts-ignore
            if (!res.error) {
                configRetrieved = true;
            }

            const actions = await fetchChannels();
            const currChannelId = getCurrentChannelId(store.getState());
            if (currChannelId) {
                actions.push(...await fetchChannelData(currChannelId));
            } else {
                const expandedID = getExpandedChannelID();
                if (expandedID.length > 0) {
                    actions.push({
                        type: VOICE_CHANNEL_USER_CONNECTED,
                        data: {
                            channelID: expandedID,
                            userID: getCurrentUserId(store.getState()),
                            currentUserID: getCurrentUserId(store.getState()),
                        },
                    });
                    actions.push(...await fetchChannelData(expandedID));
                }
            }

            store.dispatch(batchActions(actions));
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

        this.registerWebSocketEvents(registry, store);
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

                fetchChannelData(currChannelId).then((actions) =>
                    store.dispatch(batchActions(actions)),
                );
                if (currChannelId && Boolean(joinCallParam) && !connectedChannelID(store.getState())) {
                    connectCall(currChannelId);
                }
                joinCallParam = '';
            }
        }));

        const handleKBShortcuts = (ev: KeyboardEvent) => {
            switch (keyToAction('global', ev)) {
            case JOIN_CALL:
                // We don't allow joining a new call from the pop-out window.
                if (!window.opener) {
                    joinCall(getCurrentChannelId(store.getState()), getCurrentTeamId(store.getState()));
                }
                break;
            }
        };

        document.addEventListener('keydown', handleKBShortcuts, true);
        this.unsubscribers.push(() => document.removeEventListener('keydown', handleKBShortcuts, true));
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

        callsClient?: CallsClient,
        webkitAudioContext: AudioContext,
        basename: string,
        desktop?: {
            version?: string | null;
        },
        screenSharingTrackId: string,
        currentCallData?: CurrentCallData,
        callActions?: CallActions,
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
