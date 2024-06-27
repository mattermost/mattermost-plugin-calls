/* eslint-disable max-lines */

import {CallChannelState} from '@mattermost/calls-common/lib/types';
import WebSocketClient from '@mattermost/client/websocket';
import type {DesktopAPI} from '@mattermost/desktop-api';
import {PluginAnalyticsRow} from '@mattermost/types/admin';
import {Client4} from 'mattermost-redux/client';
import {getChannel, getCurrentChannelId} from 'mattermost-redux/selectors/entities/channels';
import {getConfig, getServerVersion} from 'mattermost-redux/selectors/entities/general';
import {getCurrentUserLocale} from 'mattermost-redux/selectors/entities/i18n';
import {getCurrentTeamId} from 'mattermost-redux/selectors/entities/teams';
import {getCurrentUserId, isCurrentUserSystemAdmin} from 'mattermost-redux/selectors/entities/users';
import {ActionFuncAsync} from 'mattermost-redux/types/actions';
import React, {useEffect} from 'react';
import ReactDOM from 'react-dom';
import {injectIntl, IntlProvider} from 'react-intl';
import {Provider} from 'react-redux';
import {AnyAction} from 'redux';
import {batchActions} from 'redux-batched-actions';
import {
    displayCallErrorModal,
    displayCallsTestModeUser,
    displayFreeTrial,
    getCallsConfig,
    getCallsStats,
    incomingCallOnChannel,
    loadProfilesByIdsIfMissing,
    selectRHSPost,
    setClientConnecting,
    showScreenSourceModal,
    showSwitchCallModal,
} from 'src/actions';
import {navigateToURL} from 'src/browser_routing';
import EnableIPv6 from 'src/components/admin_console_settings/enable_ipv6';
import ICEHostOverride from 'src/components/admin_console_settings/ice_host_override';
import ICEHostPortOverride from 'src/components/admin_console_settings/ice_host_port_override';
import EnableLiveCaptions from 'src/components/admin_console_settings/recordings/enable_live_captions';
import EnableRecordings from 'src/components/admin_console_settings/recordings/enable_recordings';
import EnableTranscriptions from 'src/components/admin_console_settings/recordings/enable_transcriptions';
import JobServiceURL from 'src/components/admin_console_settings/recordings/job_service_url';
import LiveCaptionsLanguage from 'src/components/admin_console_settings/recordings/live_captions_language';
import LiveCaptionsModelSize from 'src/components/admin_console_settings/recordings/live_captions_model_size';
import LiveCaptionsNumThreadsPerTranscriber
    from 'src/components/admin_console_settings/recordings/live_captions_num_threads_per_transcriber';
import LiveCaptionsNumTranscribers
    from 'src/components/admin_console_settings/recordings/live_captions_num_transcribers';
import MaxRecordingDuration from 'src/components/admin_console_settings/recordings/max_recording_duration';
import RecordingQuality from 'src/components/admin_console_settings/recordings/recording_quality';
import TranscribeAPI from 'src/components/admin_console_settings/recordings/transcriber_api';
import TranscribeAPIAzureSpeechKey from 'src/components/admin_console_settings/recordings/transcriber_api_azure_speech_key';
import TranscribeAPIAzureSpeechRegion from 'src/components/admin_console_settings/recordings/transcriber_api_azure_speech_region';
import TranscriberModelSize from 'src/components/admin_console_settings/recordings/transcriber_model_size';
import TranscriberNumThreads from 'src/components/admin_console_settings/recordings/transcriber_num_threads';
import RTCDServiceUrl from 'src/components/admin_console_settings/rtcd_service_url';
import ServerSideTURN from 'src/components/admin_console_settings/server_side_turn';
import TCPServerAddress from 'src/components/admin_console_settings/tcp_server_address';
import TCPServerPort from 'src/components/admin_console_settings/tcp_server_port';
import TestMode from 'src/components/admin_console_settings/test_mode';
import UDPServerAddress from 'src/components/admin_console_settings/udp_server_address';
import UDPServerPort from 'src/components/admin_console_settings/udp_server_port';
import {PostTypeCloudTrialRequest} from 'src/components/custom_post_types/post_type_cloud_trial_request';
import {PostTypeRecording} from 'src/components/custom_post_types/post_type_recording';
import {
    IDStopRecordingConfirmation,
    StopRecordingConfirmation,
} from 'src/components/expanded_view/stop_recording_confirmation';
import {IncomingCallContainer} from 'src/components/incoming_calls/call_container';
import RecordingsFilePreview from 'src/components/recordings_file_preview';
import {CALL_RECORDING_POST_TYPE, CALL_START_POST_TYPE, CALL_TRANSCRIPTION_POST_TYPE, DisabledCallsErr} from 'src/constants';
import {desktopNotificationHandler} from 'src/desktop_notifications';
import RestClient from 'src/rest_client';
import slashCommandsHandler from 'src/slash_commands';
import {CallActions, CurrentCallData, CurrentCallDataDefault} from 'src/types/types';
import {modals} from 'src/webapp_globals';

import {
    CALL_STATE,
    DISMISS_CALL,
    RECEIVED_CHANNEL_STATE,
    UNINIT,
    USER_LOWER_HAND,
    USER_MUTED,
    USER_RAISE_HAND,
    USER_UNMUTED,
    USERS_STATES,
} from './action_types';
import CallsClient from './client';
import CallWidget from './components/call_widget';
import ChannelCallToast from './components/channel_call_toast';
import ChannelHeaderButton from './components/channel_header_button';
import ChannelHeaderDropdownButton from './components/channel_header_dropdown_button';
import ChannelHeaderMenuButton from './components/channel_header_menu_button';
import ChannelLinkLabel from './components/channel_link_label';
import PostType from './components/custom_post_types/post_type';
import {PostTypeTranscription} from './components/custom_post_types/post_type_transcription';
import EndCallModal from './components/end_call_modal';
import ExpandedView from './components/expanded_view';
import ScreenSourceModal from './components/screen_source_modal';
import SwitchCallModal from './components/switch_call_modal';
import {
    handleDesktopJoinedCall,
} from './desktop';
import {logDebug, logErr} from './log';
import {pluginId} from './manifest';
import reducer from './reducers';
import {
    callsConfig,
    callsExplicitlyDisabled,
    callsExplicitlyEnabled,
    callStartAtForCallInChannel,
    channelHasCall,
    channelIDForCurrentCall,
    defaultEnabled,
    hasPermissionsToEnableCalls,
    iceServers,
    isCloudStarter,
    isLimitRestricted,
    needsTURNCredentials,
    ringingEnabled,
} from './selectors';
import {JOIN_CALL, keyToAction} from './shortcuts';
import {convertStatsToPanels} from './stats';
import {DesktopNotificationArgs, PluginRegistry, Store, WebAppUtils} from './types/mattermost-webapp';
import {
    followThread,
    getCallsClient,
    getChannelURL,
    getPluginPath,
    getSessionsMapFromSessions,
    getTranslations,
    getUserIDsForSessions,
    getWSConnectionURL,
    isCallsPopOut,
    playSound,
    sendDesktopEvent,
    shouldRenderDesktopWidget,
} from './utils';
import {
    handleCallEnd,
    handleCallHostChanged,
    handleCallJobState,
    handleCallStart,
    handleCallState,
    handleCaption,
    handleHostLowerHand,
    handleHostMute,
    handleHostRemoved,
    handleHostScreenOff,
    handleUserDismissedNotification,
    handleUserJoined,
    handleUserLeft,
    handleUserMuted,
    handleUserRaisedHand,
    handleUserReaction,
    handleUserRemovedFromChannel,
    handleUserScreenOff,
    handleUserScreenOn,
    handleUserUnmuted,
    handleUserUnraisedHand,
    handleUserVoiceOff,
    handleUserVoiceOn,
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

        registry.registerWebSocketEventHandler(`custom_${pluginId}_call_job_state`, (ev) => {
            handleCallJobState(store, ev);
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

        registry.registerWebSocketEventHandler(`custom_${pluginId}_caption`, (ev) => {
            handleCaption(store, ev);
        });

        registry.registerWebSocketEventHandler(`custom_${pluginId}_host_mute`, (ev) => {
            handleHostMute(store, ev);
        });

        registry.registerWebSocketEventHandler(`custom_${pluginId}_host_screen_off`, (ev) => {
            handleHostScreenOff(store, ev);
        });

        registry.registerWebSocketEventHandler(`custom_${pluginId}_host_lower_hand`, (ev) => {
            handleHostLowerHand(store, ev);
        });

        registry.registerWebSocketEventHandler(`custom_${pluginId}_host_removed`, (ev) => {
            handleHostRemoved(store, ev);
        });
    }

    private initialize(registry: PluginRegistry, store: Store) {
        // Setting the base URL if present, in case MM is running under a subpath.
        if (window.basename) {
            // If present, we need to set the basename on both the client we use (RestClient)
            // and the default one (Client4) used by internal Redux actions. Not doing so
            // would break Calls widget on installations served under a subpath.
            RestClient.setUrl(window.basename);
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
        registry.registerPostTypeComponent(CALL_START_POST_TYPE, PostType);
        registry.registerPostTypeComponent(CALL_RECORDING_POST_TYPE, PostTypeRecording);
        registry.registerPostTypeComponent(CALL_TRANSCRIPTION_POST_TYPE, PostTypeTranscription);
        registry.registerPostTypeComponent('custom_cloud_trial_req', PostTypeCloudTrialRequest);
        registry.registerNeedsTeamRoute('/expanded', injectIntl(ExpandedView));
        registry.registerGlobalComponent(injectIntl(SwitchCallModal));
        registry.registerGlobalComponent(injectIntl(ScreenSourceModal));
        registry.registerGlobalComponent(injectIntl(EndCallModal));
        registry.registerGlobalComponent(injectIntl(IncomingCallContainer));

        registry.registerFilePreviewComponent((fi, post) => {
            return String(post?.type) === CALL_RECORDING_POST_TYPE;
        }, RecordingsFilePreview);

        registry.registerTranslations((locale: string) => {
            return getTranslations(locale);
        });

        registry.registerSlashCommandWillBePostedHook(async (message, args) => {
            return slashCommandsHandler(store, joinCall, message, args);
        });

        registry.registerDesktopNotificationHook?.(async (post, msgProps, channel, teamId, args) => {
            return desktopNotificationHandler(store, post, msgProps, channel, args);
        });

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

        registry.registerAdminConsoleCustomSetting('DefaultEnabled', TestMode);

        // EnableRecording turns on/off the following:
        registry.registerAdminConsoleCustomSetting('EnableRecordings', EnableRecordings);
        registry.registerAdminConsoleCustomSetting('MaxRecordingDuration', MaxRecordingDuration);
        registry.registerAdminConsoleCustomSetting('RecordingQuality', RecordingQuality);
        registry.registerAdminConsoleCustomSetting('JobServiceURL', JobServiceURL);
        registry.registerAdminConsoleCustomSetting('EnableTranscriptions', EnableTranscriptions);
        registry.registerAdminConsoleCustomSetting('TranscriberModelSize', TranscriberModelSize);
        registry.registerAdminConsoleCustomSetting('TranscribeAPI', TranscribeAPI);
        registry.registerAdminConsoleCustomSetting('TranscribeAPIAzureSpeechKey', TranscribeAPIAzureSpeechKey);
        registry.registerAdminConsoleCustomSetting('TranscribeAPIAzureSpeechRegion', TranscribeAPIAzureSpeechRegion);
        registry.registerAdminConsoleCustomSetting('TranscriberNumThreads', TranscriberNumThreads);
        registry.registerAdminConsoleCustomSetting('EnableLiveCaptions', EnableLiveCaptions);
        registry.registerAdminConsoleCustomSetting('LiveCaptionsModelSize', LiveCaptionsModelSize);
        registry.registerAdminConsoleCustomSetting('LiveCaptionsNumTranscribers', LiveCaptionsNumTranscribers);
        registry.registerAdminConsoleCustomSetting('LiveCaptionsNumThreadsPerTranscriber', LiveCaptionsNumThreadsPerTranscriber);
        registry.registerAdminConsoleCustomSetting('LiveCaptionsLanguage', LiveCaptionsLanguage);

        // RTCD server turns on/off the following:
        registry.registerAdminConsoleCustomSetting('RTCDServiceURL', RTCDServiceUrl);
        registry.registerAdminConsoleCustomSetting('UDPServerAddress', UDPServerAddress);
        registry.registerAdminConsoleCustomSetting('UDPServerPort', UDPServerPort);
        registry.registerAdminConsoleCustomSetting('TCPServerAddress', TCPServerAddress);
        registry.registerAdminConsoleCustomSetting('TCPServerPort', TCPServerPort);
        registry.registerAdminConsoleCustomSetting('EnableIPv6', EnableIPv6);
        registry.registerAdminConsoleCustomSetting('ICEHostOverride', ICEHostOverride);
        registry.registerAdminConsoleCustomSetting('ICEHostPortOverride', ICEHostPortOverride);
        registry.registerAdminConsoleCustomSetting('ServerSideTURN', ServerSideTURN);

        registry.registerSiteStatisticsHandler(async () => {
            let stats: Record<string, PluginAnalyticsRow> = {};
            try {
                stats = convertStatsToPanels(await getCallsStats(), getServerVersion(store.getState()));
            } catch (err) {
                logErr(err);
            }
            return stats;
        });

        // Desktop API handlers
        if (window.desktopAPI?.onOpenScreenShareModal) {
            logDebug('registering desktopAPI.onOpenScreenShareModal');
            this.unsubscribers.push(window.desktopAPI.onOpenScreenShareModal(() => {
                logDebug('desktopAPI.onOpenScreenShareModal');
                store.dispatch(showScreenSourceModal());
            }));
        }

        if (window.desktopAPI?.onJoinCallRequest) {
            logDebug('registering desktopAPI.onJoinCallRequest');
            this.unsubscribers.push(window.desktopAPI.onJoinCallRequest((channelID: string) => {
                logDebug('desktopAPI.onJoinCallRequest');
                store.dispatch(showSwitchCallModal(channelID));
            }));
        }

        if (window.desktopAPI?.onCallsError) {
            logDebug('registering desktopAPI.onCallsError');
            this.unsubscribers.push(window.desktopAPI.onCallsError((err: string, callID?: string, errMsg?: string) => {
                logDebug('desktopAPI.onCallsError');
                store.dispatch(setClientConnecting(false));
                if (err === 'client-error') {
                    store.dispatch(displayCallErrorModal(new Error(errMsg), callID));
                }
            }));
        }

        if (window.desktopAPI?.onOpenThreadForCalls) {
            logDebug('registering desktopAPI.onOpenThreadForCalls');
            this.unsubscribers.push(window.desktopAPI.onOpenThreadForCalls((threadID: string) => {
                logDebug('desktopAPI.onOpenThreadForCalls');
                store.dispatch(selectRHSPost(threadID));
            }));
        }

        if (window.desktopAPI?.onOpenStopRecordingModal) {
            logDebug('registering desktopAPI.onOpenStopRecordingModal');
            this.unsubscribers.push(window.desktopAPI.onOpenStopRecordingModal((channelID: string) => {
                logDebug('desktopAPI.onOpenStopRecordingModal');
                store.dispatch(modals.openModal({
                    modalId: IDStopRecordingConfirmation,
                    dialogType: StopRecordingConfirmation,
                    dialogProps: {
                        channelID,
                    },
                }));
            }));
        }

        const connectCall = async (channelID: string, title?: string, rootId?: string) => {
            // Desktop handler
            const payload = {
                callID: channelID,
                title: title || '',
                channelURL: getChannelURL(store.getState(), getChannel(store.getState(), channelID), getCurrentTeamId(store.getState())),
                rootID: rootId || '',
                startingCall: !channelHasCall(store.getState(), channelID),
            };
            if (window.desktopAPI?.joinCall) {
                logDebug('desktopAPI.joinCall');
                store.dispatch(setClientConnecting(true));
                handleDesktopJoinedCall(store, await window.desktopAPI.joinCall(payload));
                store.dispatch(setClientConnecting(false));
                return;
            } else if (shouldRenderDesktopWidget()) {
                logDebug('sending join call message to desktop app');

                // DEPRECATED: legacy Desktop API logic (<= 5.6.0)
                store.dispatch(setClientConnecting(true));
                sendDesktopEvent('calls-join-call', payload);
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
                        iceConfigs.push(...await RestClient.fetch<RTCIceServer[]>(`${getPluginPath()}/turn-credentials`, {method: 'get'}));
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

                window.callsClient.on('connect', () => store.dispatch(setClientConnecting(false)));

                window.callsClient.on('close', (err?: Error) => {
                    store.dispatch(setClientConnecting(false));

                    unmountCallWidget();
                    if (window.desktop) {
                        registry.unregisterComponent(rootComponentID);
                    }
                    if (window.callsClient) {
                        if (err) {
                            store.dispatch(displayCallErrorModal(err, window.callsClient.channelID));
                        }
                        window.callsClient.destroy();
                        delete window.callsClient;
                        delete window.currentCallData;
                        playSound('leave_self');
                    }
                });

                window.callsClient.on('mute', () => {
                    store.dispatch({
                        type: USER_MUTED,
                        data: {
                            channelID: window.callsClient?.channelID,
                            userID: getCurrentUserId(store.getState()),
                            session_id: window.callsClient?.getSessionID(),
                        },
                    });
                });

                window.callsClient.on('unmute', () => {
                    store.dispatch({
                        type: USER_UNMUTED,
                        data: {
                            channelID: window.callsClient?.channelID,
                            userID: getCurrentUserId(store.getState()),
                            session_id: window.callsClient?.getSessionID(),
                        },
                    });
                });

                window.callsClient.on('raise_hand', () => {
                    store.dispatch({
                        type: USER_RAISE_HAND,
                        data: {
                            channelID: window.callsClient?.channelID,
                            userID: getCurrentUserId(store.getState()),
                            raised_hand: Date.now(),
                            session_id: window.callsClient?.getSessionID(),
                        },
                    });
                });

                window.callsClient.on('lower_hand', () => {
                    store.dispatch({
                        type: USER_LOWER_HAND,
                        data: {
                            channelID: window.callsClient?.channelID,
                            userID: getCurrentUserId(store.getState()),
                            session_id: window.callsClient?.getSessionID(),
                        },
                    });
                });

                window.callsClient.init({
                    channelID,
                    title,
                    threadID: rootId,
                }).catch((err: Error) => {
                    store.dispatch(setClientConnecting(false));

                    logErr(err);
                    unmountCallWidget();
                    store.dispatch(displayCallErrorModal(err, channelID));
                    delete window.callsClient;
                });

                store.dispatch(setClientConnecting(true));
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
            } else if (ev.data?.type === 'desktop-sources-modal-request' && !window.desktopAPI?.onOpenScreenShareModal) {
                // DEPRECATED: legacy Desktop API logic (<= 5.6.0)
                store.dispatch(showScreenSourceModal());
            } else if (ev.data?.type === 'calls-joined-call' && !window.desktopAPI?.joinCall) {
                // DEPRECATED: legacy Desktop API logic (<= 5.6.0)
                store.dispatch(setClientConnecting(false));
                handleDesktopJoinedCall(store, ev.data.message);
            } else if (ev.data?.type === 'calls-join-request' && !window.desktopAPI?.onJoinCallRequest) {
                // we can assume that we are already in a call, since the global widget sent this.
                // DEPRECATED: legacy Desktop API logic (<= 5.6.0)
                store.dispatch(showSwitchCallModal(ev.data.message.callID));
            } else if (ev.data?.type === 'calls-error' && ev.data.message.err === 'client-error' && !window.desktopAPI?.onCallsError) {
                // DEPRECATED: legacy Desktop API logic (<= 5.6.0)
                store.dispatch(setClientConnecting(false));
                store.dispatch(displayCallErrorModal(new Error(ev.data.message.errMsg), ev.data.message.callID));
            } else if (ev.data?.type === 'calls-run-slash-command') {
                slashCommandsHandler(store, joinCall, ev.data.message, ev.data.args);
            } else if (ev.data?.type === 'calls-link-click' && !window.desktopAPI?.openLinkFromCalls) {
                // DEPRECATED: legacy Desktop API logic (<= 5.6.0)
                navigateToURL(ev.data.message.link);
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

        const fetchChannels = async (skipChannelID?: string): Promise<AnyAction[]> => {
            const actions = [];
            try {
                const data = await RestClient.fetch<CallChannelState[]>(`${getPluginPath()}/channels`, {method: 'get'});

                for (let i = 0; i < data.length; i++) {
                    // Skipping the channel for the current call here is important
                    // as it can avoid an inconsistent state for the current call due to a race.
                    // State for the current call should ONLY be mutated as a result of websocket events, not HTTP calls.
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
                            // dismissedNotification is populated after the actions array has been batched, so manually check:
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
                // not logged in, returning. Shouldn't happen, but being defensive.
                return;
            }

            unsubscribeActivateListener();

            await store.dispatch(getCallsConfig());

            // We don't care about fetching other calls states in pop out.
            // Current call state will be requested over websocket
            // from the ExpandedView component itself.
            if (isCallsPopOut()) {
                return;
            }

            const currentCallChannelID = channelIDForCurrentCall(store.getState());

            // We pass currentCallChannelID so that we
            // can skip loading its state as a result of the HTTP calls in
            // fetchChannels since it would be racy.
            const actions = await fetchChannels(currentCallChannelID);
            store.dispatch(batchActions(actions));

            // If indeed we are in a call we should request the up-to-date
            // state from websocket.
            if (currentCallChannelID) {
                if (wsClient) {
                    logDebug('requesting call state through ws');
                    wsClient.sendMessage('custom_com.mattermost.calls_call_state', {channelID: currentCallChannelID});
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
            if (window.callsClient) {
                window.callsClient.disconnect();
            }
            logDebug('resetting state');
            store.dispatch({
                type: UNINIT,
            });
        });

        // A dummy React component so we can access webapp's
        // WebSocket client through the provided hook. Just lovely.
        registry.registerGlobalComponent(() => {
            const client = window.ProductApi.useWebSocketClient();
            this.wsClient = client;

            useEffect(() => {
                logDebug('registering ws reconnect handler');
                // eslint-disable-next-line max-nested-callbacks
                this.registerReconnectHandler(registry, store, () => {
                    logDebug('websocket reconnect handler');
                    if (!getCallsClient()) {
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

                // We only want to register the header menu component on first load and not
                // on every channel switch.
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
        desktopAPI?: DesktopAPI;
        screenSharingTrackId: string,
        currentCallData?: CurrentCallData,
        callActions?: CallActions,
        e2eDesktopNotificationsRejected?: DesktopNotificationArgs[],
        e2eDesktopNotificationsSent?: string[],
        e2eNotificationsSoundedAt?: number[],
        e2eNotificationsSoundStoppedAt?: number[],
        e2eRingLength?: number,
        WebappUtils: WebAppUtils,

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
