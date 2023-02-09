/* eslint-disable max-lines */

import axios from 'axios';

import {defineMessage} from 'react-intl';

import {Client4} from 'mattermost-redux/client';
import {getCurrentChannelId, getChannel} from 'mattermost-redux/selectors/entities/channels';
import {getCurrentTeamId} from 'mattermost-redux/selectors/entities/teams';
import {getCurrentUserId, getUser, isCurrentUserSystemAdmin} from 'mattermost-redux/selectors/entities/users';
import {getChannel as getChannelAction} from 'mattermost-redux/actions/channels';
import {getProfilesByIds as getProfilesByIdsAction} from 'mattermost-redux/actions/users';
import {getConfig} from 'mattermost-redux/selectors/entities/general';

import {
    displayFreeTrial,
    getCallsConfig,
    displayCallErrorModal,
    showScreenSourceModal,
    displayCallsTestModeUser,
    startCallRecording,
    stopCallRecording,
    displayGenericErrorModal,
} from 'src/actions';

import {PostTypeCloudTrialRequest} from 'src/components/custom_post_types/post_type_cloud_trial_request';
import RTCDServiceUrl from 'src/components/admin_console_settings/rtcd_service_url';
import EnableRecordings from 'src/components/admin_console_settings/recordings/enable_recordings';
import MaxRecordingDuration from 'src/components/admin_console_settings/recordings/max_recording_duration';
import JobServiceURL from 'src/components/admin_console_settings/recordings/job_service_url';
import TestMode from 'src/components/admin_console_settings/test_mode';
import UDPServerPort from 'src/components/admin_console_settings/udp_server_port';
import UDPServerAddress from 'src/components/admin_console_settings/udp_server_address';
import ICEHostOverride from 'src/components/admin_console_settings/ice_host_override';

import {UserState} from 'src/types/types';

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
    voiceChannelCallOwnerID,
    isLimitRestricted,
    iceServers,
    needsTURNCredentials,
    defaultEnabled,
    isCloudStarter,
    channelHasCall,
    callsExplicitlyEnabled,
    callsExplicitlyDisabled,
    hasPermissionsToEnableCalls,
    voiceChannelCallHostID,
    callRecording,
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
    SHOW_END_CALL_MODAL,
    DESKTOP_WIDGET_CONNECTED,
    VOICE_CHANNEL_CALL_HOST,
    VOICE_CHANNEL_CALL_RECORDING_STATE,
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
                        store.dispatch(displayGenericErrorModal(
                            defineMessage({defaultMessage: 'Unable to start call'}),
                            defineMessage({defaultMessage: 'A call is already ongoing in the channel.'}),
                        ));
                        return {};
                    }
                }
                if (!connectedID) {
                    let title = '';
                    if (fields.length > 2) {
                        title = fields.slice(2).join(' ');
                    }
                    const team_id = args?.team_id || getChannel(store.getState(), args.channel_id).team_id;
                    try {
                        await joinCall(args.channel_id, team_id, title, args.root_id);
                        return {};
                    } catch (e) {
                        // TODO: map error messages to translatable strings so we can
                        // actually show something better than a generic error.
                        store.dispatch(displayGenericErrorModal(
                            defineMessage({defaultMessage: 'Unable to join call'}),
                            defineMessage({defaultMessage: 'An internal error occurred preventing you to join the call. Please try again.'}),
                        ));
                        return {};
                    }
                }

                store.dispatch(displayGenericErrorModal(
                    defineMessage({defaultMessage: 'Unable to join call'}),
                    defineMessage({defaultMessage: 'You\'re already connected to a call in the current channel.'}),
                ));
                return {};
            case 'leave':
                if (connectedID && args.channel_id === connectedID) {
                    if (window.callsClient) {
                        window.callsClient.disconnect();
                        return {};
                    } else if (shouldRenderDesktopWidget()) {
                        sendDesktopEvent('calls-leave-call', {callID: args.channel_id});
                        return {};
                    }
                }
                store.dispatch(displayGenericErrorModal(
                    defineMessage({defaultMessage: 'Unable to leave the call'}),
                    defineMessage({defaultMessage: 'You\'re not connected to a call in the current channel.'}),
                ));
                return {};
            case 'end':
                if (voiceConnectedUsersInChannel(store.getState(), args.channel_id)?.length === 0) {
                    store.dispatch(displayGenericErrorModal(
                        defineMessage({defaultMessage: 'Unable to end the call'}),
                        defineMessage({defaultMessage: 'There\'s no ongoing call in the channel.'}),
                    ));
                    return {};
                }

                if (!isCurrentUserSystemAdmin(store.getState()) &&
                    getCurrentUserId(store.getState()) !== voiceChannelCallOwnerID(store.getState(), args.channel_id)) {
                    store.dispatch(displayGenericErrorModal(
                        defineMessage({defaultMessage: 'Unable to end the call'}),
                        defineMessage({defaultMessage: 'You don\'t have permission to end the call. Please ask the call owner to end call.'}),
                    ));
                    return {};
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
            case 'stats': {
                if (window.callsClient) {
                    try {
                        const stats = await window.callsClient.getStats();
                        return {message: `/call stats ${btoa(JSON.stringify(stats))}`, args};
                    } catch (err) {
                        return {error: {message: err}};
                    }
                }
                const data = sessionStorage.getItem('calls_client_stats') || '{}';
                return {message: `/call stats ${btoa(data)}`, args};
            }
            case 'recording': {
                if (fields.length < 3 || (fields[2] !== 'start' && fields[2] !== 'stop')) {
                    break;
                }

                const startErrorTitle = defineMessage({defaultMessage: 'Unable to start recording'});
                const stopErrorTitle = defineMessage({defaultMessage: 'Unable to stop recording'});

                if (args.channel_id !== connectedID) {
                    store.dispatch(displayGenericErrorModal(
                        fields[2] === 'start' ? startErrorTitle : stopErrorTitle,
                        defineMessage({defaultMessage: 'You\'re not connected to a call in the current channel.'}),
                    ));
                    return {};
                }

                const state = store.getState();
                const isHost = voiceChannelCallHostID(state, connectedID) === getCurrentUserId(state);
                const recording = callRecording(state, connectedID);

                if (fields[2] === 'start') {
                    if (recording?.start_at > recording?.end_at) {
                        store.dispatch(displayGenericErrorModal(
                            startErrorTitle,
                            defineMessage({defaultMessage: 'A recording is already in progress.'}),
                        ));
                        return {};
                    }

                    if (!isHost) {
                        store.dispatch(displayGenericErrorModal(
                            startErrorTitle,
                            defineMessage({defaultMessage: 'You don\'t have permissions to start a recording. Please ask the call host to start a recording.'}),
                        ));
                        return {};
                    }

                    await store.dispatch(startCallRecording(connectedID));
                }

                if (fields[2] === 'stop') {
                    if (!recording || recording?.end_at > recording?.start_at) {
                        store.dispatch(displayGenericErrorModal(
                            stopErrorTitle,
                            defineMessage({defaultMessage: 'No recording is in progress.'}),
                        ));
                        return {};
                    }

                    if (!isHost) {
                        store.dispatch(displayGenericErrorModal(
                            stopErrorTitle,
                            defineMessage({defaultMessage: 'You don\'t have permissions to stop the recording. Please ask the call host to stop the recording.'}),
                        ));
                        return {};
                    }

                    await stopCallRecording(connectedID);
                }
                break;
            }
            }

            return {message, args};
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
                throw Error('Cannot start or join call: calls are disabled in this channel.');
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
                });
                return;
            }

            try {
                if (window.callsClient) {
                    logErr('calls client is already initialized');
                    return;
                }

                const iceConfigs = [...iceServers(store.getState())];
                if (needsTURNCredentials(store.getState())) {
                    logDebug('turn credentials needed');
                    try {
                        const resp = await axios.get(`${getPluginPath()}/turn-credentials`);
                        iceConfigs.push(...resp.data);
                    } catch (err) {
                        logErr(err);
                    }
                }

                window.callsClient = new CallsClient({
                    wsURL: getWSConnectionURL(getConfig(store.getState())),
                    iceServers: iceConfigs,
                });
                const globalComponentID = registry.registerGlobalComponent(CallWidget);
                const rootComponentID = registry.registerRootComponent(ExpandedView);
                window.callsClient.on('close', (err?: Error) => {
                    registry.unregisterComponent(globalComponentID);
                    registry.unregisterComponent(rootComponentID);
                    if (window.callsClient) {
                        if (err) {
                            store.dispatch(displayCallErrorModal(window.callsClient.channelID, err));
                        }
                        window.callsClient.destroy();
                        delete window.callsClient;
                        playSound('leave_self');
                    }
                });

                window.callsClient.init(channelID, title, rootId).catch((err: Error) => {
                    logErr(err);
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
                        const resp = await axios.post(`${getPluginPath()}/${currChannelId}`,
                            {enabled: callsExplicitlyDisabled(store.getState(), currChannelId)},
                            {headers: {'X-Requested-With': 'XMLHttpRequest'}});
                        store.dispatch({
                            type: RECEIVED_CHANNEL_STATE,
                            data: {id: currChannelId, enabled: resp.data.enabled},
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
                                hostID: resp.data[i].call?.host_id,
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

            try {
                const resp = await axios.get(`${getPluginPath()}/${channelID}`);
                store.dispatch({
                    type: RECEIVED_CHANNEL_STATE,
                    data: {id: channelID, enabled: resp.data.enabled},
                });

                const call = resp.data.call;
                if (!call) {
                    return;
                }

                store.dispatch({
                    type: VOICE_CHANNEL_CALL_START,
                    data: {
                        channelID,
                        startAt: call.start_at,
                        ownerID: call.owner_id,
                        hostID: call.host_id,
                    },
                });

                store.dispatch({
                    type: VOICE_CHANNEL_USERS_CONNECTED,
                    data: {
                        users: call.users || [],
                        channelID,
                    },
                });

                store.dispatch({
                    type: VOICE_CHANNEL_ROOT_POST,
                    data: {
                        channelID,
                        rootPost: call.thread_id,
                    },
                });

                store.dispatch({
                    type: VOICE_CHANNEL_CALL_HOST,
                    data: {
                        channelID,
                        hostID: call.host_id,
                    },
                });

                if (call.users && call.users.length > 0) {
                    store.dispatch({
                        type: VOICE_CHANNEL_PROFILES_CONNECTED,
                        data: {
                            profiles: await getProfilesByIds(store.getState(), call.users),
                            channelID,
                        },
                    });
                }

                store.dispatch({
                    type: VOICE_CHANNEL_CALL_RECORDING_STATE,
                    data: {
                        callID: channelID,
                        recState: call.recording,
                    },
                });

                store.dispatch({
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
                    type: RECEIVED_CHANNEL_STATE,
                    data: {id: channelID, enabled: false},
                });
            }
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

            await fetchChannels();
            const currChannelId = getCurrentChannelId(store.getState());
            if (currChannelId) {
                fetchChannelData(currChannelId);
            } else {
                const expandedID = getExpandedChannelID();
                if (expandedID.length > 0) {
                    store.dispatch({
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

                fetchChannelData(currChannelId);
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
