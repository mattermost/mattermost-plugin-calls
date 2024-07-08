/* eslint-disable max-lines */
import './component.scss';

import {mosThreshold} from '@mattermost/calls-common';
import {UserSessionState} from '@mattermost/calls-common/lib/types';
import {Channel} from '@mattermost/types/channels';
import {Team} from '@mattermost/types/teams';
import {UserProfile} from '@mattermost/types/users';
import {IDMappedObjects} from '@mattermost/types/utilities';
import {Client4} from 'mattermost-redux/client';
import React, {CSSProperties} from 'react';
import {FormattedMessage, IntlShape} from 'react-intl';
import {compareSemVer} from 'semver-parser';
import {hostRemove} from 'src/actions';
import {navigateToURL} from 'src/browser_routing';
import {AudioInputPermissionsError} from 'src/client';
import Avatar from 'src/components/avatar/avatar';
import {Badge} from 'src/components/badge';
import {ParticipantsList} from 'src/components/call_widget/participants_list';
import {RemoveConfirmation} from 'src/components/call_widget/remove_confirmation';
import DotMenu, {DotMenuButton} from 'src/components/dot_menu/dot_menu';
import {
    IDStopRecordingConfirmation,
    StopRecordingConfirmation,
} from 'src/components/expanded_view/stop_recording_confirmation';
import {HostNotices} from 'src/components/host_notices';
import ChatThreadIcon from 'src/components/icons/chat_thread';
import CompassIcon from 'src/components/icons/compassIcon';
import ExpandIcon from 'src/components/icons/expand';
import HorizontalDotsIcon from 'src/components/icons/horizontal_dots';
import LeaveCallIcon from 'src/components/icons/leave_call_icon';
import MutedIcon from 'src/components/icons/muted_icon';
import ParticipantsIcon from 'src/components/icons/participants';
import PopOutIcon from 'src/components/icons/popout';
import RaisedHandIcon from 'src/components/icons/raised_hand';
import RecordCircleIcon from 'src/components/icons/record_circle';
import RecordSquareIcon from 'src/components/icons/record_square';
import SettingsWheelIcon from 'src/components/icons/settings_wheel';
import ShareScreenIcon from 'src/components/icons/share_screen';
import ShowMoreIcon from 'src/components/icons/show_more';
import SpeakerIcon from 'src/components/icons/speaker_icon';
import TickIcon from 'src/components/icons/tick';
import UnmutedIcon from 'src/components/icons/unmuted_icon';
import UnraisedHandIcon from 'src/components/icons/unraised_hand';
import UnshareScreenIcon from 'src/components/icons/unshare_screen';
import {CallIncomingCondensed} from 'src/components/incoming_calls/call_incoming_condensed';
import {LeaveCallMenu} from 'src/components/leave_call_menu';
import {
    CallAlertConfigs,
    CallRecordingDisclaimerStrings,
    CallTranscribingDisclaimerStrings,
    DEGRADED_CALL_QUALITY_ALERT_WAIT,
} from 'src/constants';
import {logDebug, logErr} from 'src/log';
import {
    keyToAction,
    LEAVE_CALL,
    MUTE_UNMUTE,
    PARTICIPANTS_LIST_TOGGLE,
    RAISE_LOWER_HAND,
    reverseKeyMappings,
    SHARE_UNSHARE_SCREEN,
} from 'src/shortcuts';
import {ModalData} from 'src/types/mattermost-webapp';
import * as Telemetry from 'src/types/telemetry';
import {
    AudioDevices,
    CallAlertStates,
    CallAlertStatesDefault,
    CallJobReduxState,
    HostControlNotice,
    IncomingCallNotification,
    RemoveConfirmationData,
} from 'src/types/types';
import {
    getPopOutURL,
    getUserDisplayName,
    hasExperimentalFlag,
    isDMChannel,
    isGMChannel,
    isPrivateChannel,
    isPublicChannel,
    sendDesktopEvent,
    untranslatable,
} from 'src/utils';
import styled from 'styled-components';

import CallDuration from './call_duration';
import JoinNotification from './join_notification';
import LoadingOverlay from './loading_overlay';
import UnavailableIconWrapper from './unavailable_icon_wrapper';
import WidgetBanner from './widget_banner';
import WidgetButton from './widget_button';

interface Props {
    intl: IntlShape,
    currentUserID: string,
    channel?: Channel,
    team?: Team,
    channelURL: string,
    channelDisplayName: string,
    sessions: UserSessionState[],
    sessionsMap: { [sessionID: string]: UserSessionState },
    currentSession?: UserSessionState,
    profiles: IDMappedObjects<UserProfile>,
    callStartAt: number,
    callHostID: string,
    callHostChangeAt: number,
    callRecording?: CallJobReduxState,
    isRecording: boolean,
    screenSharingSession?: UserSessionState,
    show: boolean,
    showExpandedView: () => void,
    showScreenSourceModal: () => void,
    trackEvent: (event: Telemetry.Event, source: Telemetry.Source, props?: Record<string, string>) => void,
    recordingPromptDismissedAt: (callID: string, dismissedAt: number) => void,
    allowScreenSharing: boolean,
    global?: true,
    startingCall?: boolean,
    position?: {
        bottom: number,
        left: number,
    },
    recentlyJoinedUsers: string[],
    hostNotices: HostControlNotice[],
    wider: boolean,
    callsIncoming: IncomingCallNotification[],
    transcriptionsEnabled: boolean,
    clientConnecting: boolean,
    callThreadID?: string,
    selectRHSPost: (id: string) => void,
    startCallRecording: (channelID: string) => void,
    stopCallRecording: (channelID: string) => void,
    recordingsEnabled: boolean,
    openModal: <P>(modalData: ModalData<P>) => void;
}

interface DraggingState {
    dragging: boolean,
    x: number,
    y: number,
    initX: number,
    initY: number,
    offX: number,
    offY: number,
}

interface State {
    showMenu: boolean,
    showParticipantsList: boolean,
    screenStream: MediaStream | null,
    currentAudioInputDevice?: MediaDeviceInfo | null,
    currentAudioOutputDevice?: MediaDeviceInfo | null,
    devices?: AudioDevices,
    showAudioInputDevicesMenu?: boolean,
    showAudioOutputDevicesMenu?: boolean,
    dragging: DraggingState,
    expandedViewWindow: Window | null,
    audioEls: HTMLAudioElement[],
    alerts: CallAlertStates,
    removeConfirmation: RemoveConfirmationData | null,
    leaveMenuOpen: boolean,
}

export default class CallWidget extends React.PureComponent<Props, State> {
    private readonly node: React.RefObject<HTMLDivElement>;
    private readonly menuNode: React.RefObject<HTMLDivElement>;
    private audioMenu: HTMLUListElement | null = null;
    private menuResizeObserver: ResizeObserver | null = null;
    private audioMenuResizeObserver: ResizeObserver | null = null;
    private screenPlayer: HTMLVideoElement | null = null;
    private prevDevicePixelRatio = 0;
    private unsubscribers: (() => void)[] = [];
    private callQualityBannerLocked = false;

    private genStyle: () => Record<string, React.CSSProperties> = () => {
        return {
            main: {
                position: 'fixed',
                display: 'flex',
                bottom: `${this.props.position ? this.props.position.bottom : 12}px`,
                left: `${this.props.position ? this.props.position.left : 12}px`,
                lineHeight: '16px',
                zIndex: 1000,
                userSelect: 'none',
                color: 'var(--center-channel-color)',
            },
            topBar: {
                background: 'rgba(var(--center-channel-color-rgb), 0.04)',
                padding: '7px 8px',
                display: 'flex',
                gap: '10px',
                width: '100%',
                alignItems: 'center',
                cursor: 'move',
            },
            bottomBar: {
                padding: '8px',
                display: 'flex',
                justifyContent: 'flex-end',
                width: '100%',
                alignItems: 'center',
                gap: '6px',
            },
            frame: {
                width: '100%',
                background: 'var(--center-channel-bg)',
                borderRadius: '8px',
                boxShadow: '0px 0px 0px 2px rgba(var(--center-channel-color-rgb), 0.16)',
            },
            callInfo: {
                display: 'flex',
                alignItems: 'center',
                fontSize: '11px',
                lineHeight: '16px',
                color: 'rgba(var(--center-channel-color-rgb), 0.64)',
            },
            menuButton: {
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                color: 'rgba(var(--center-channel-color-rgb), 0.8)',
                fontSize: '14px',
                width: 'auto',
                padding: '0 6px',
            },
            menu: {
                position: 'absolute',
                bottom: 'calc(100% + 4px)',
                width: '100%',
                appRegion: 'drag',
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
            },
            screenSharingPanel: {
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                width: '100%',
                minWidth: 'revert',
                maxWidth: 'revert',
                borderRadius: '8px',
            },
            settingsMenu: {
                position: 'relative',
                width: '100%',
                minWidth: 'revert',
                maxWidth: 'revert',
                borderRadius: '8px',
            },
            audioDevicesMenu: {
                left: 'calc(100% + 4px)',
                overflow: 'auto',
                top: 0,
                width: '280px',
                maxHeight: 'calc(100% + 90px)',
                borderRadius: '8px',
                border: '1px solid rgba(var(--center-channel-color-rgb), 0.16)',
                boxShadow: '0px 8px 24px rgba(0, 0, 0, 0.12)',
            },
            callsIncoming: {
                display: 'flex',
                flexDirection: 'column',
                gap: '5px',
            },
            leaveMenuShim: {
                height: 70,
            },
        };
    };

    private style = this.genStyle();

    constructor(props: Props) {
        super(props);
        this.state = {
            showMenu: false,
            showParticipantsList: false,
            dragging: {
                dragging: false,
                x: 0,
                y: 0,
                initX: 0,
                initY: 0,
                offX: 0,
                offY: 0,
            },
            expandedViewWindow: null,
            audioEls: [],
            alerts: CallAlertStatesDefault,
            screenStream: null,
            removeConfirmation: null,
            leaveMenuOpen: false,
        };
        this.node = React.createRef();
        this.menuNode = React.createRef();
    }

    setScreenPlayerRef = (node: HTMLVideoElement) => {
        if (node && this.state.screenStream) {
            node.srcObject = this.state.screenStream;
        }
        this.screenPlayer = node;
    };

    handleKBShortcuts = (ev: KeyboardEvent) => {
        if (!this.props.show) {
            return;
        }
        switch (keyToAction('widget', ev)) {
        case MUTE_UNMUTE:
            this.onMuteToggle();
            break;
        case RAISE_LOWER_HAND:
            this.onRaiseHandToggle(true);
            break;
        case SHARE_UNSHARE_SCREEN:
            this.onShareScreenToggle(true);
            break;
        case PARTICIPANTS_LIST_TOGGLE:
            this.onParticipantsButtonClick(true);
            break;
        case LEAVE_CALL:
            this.onDisconnectClick();
            break;
        }
    };

    setMissingScreenPermissions = (missing: boolean, forward?: boolean) => {
        this.setState({
            alerts: {
                ...this.state.alerts,
                missingScreenPermissions: {
                    ...this.state.alerts.missingScreenPermissions,
                    active: missing,
                    show: missing,
                },
            },
        });

        if (forward && this.state.expandedViewWindow) {
            this.state.expandedViewWindow.callActions?.setMissingScreenPermissions(missing);
        }

        if (window.currentCallData) {
            window.currentCallData.missingScreenPermissions = missing;
        }
    };

    private onViewportResize = () => {
        if (window.devicePixelRatio === this.prevDevicePixelRatio) {
            return;
        }
        this.prevDevicePixelRatio = window.devicePixelRatio;
        this.sendGlobalWidgetBounds();
    };

    // DEPRECATED: legacy Desktop API logic (<= 5.6.0)
    private handleDesktopEvents = (ev: MessageEvent) => {
        if (ev.origin !== window.origin) {
            return;
        }

        if (ev.data.type === 'calls-error' && ev.data.message.err === 'screen-permissions') {
            logDebug('screen permissions error');
            this.setMissingScreenPermissions(true, true);
        } else if (ev.data.type === 'calls-widget-share-screen') {
            this.shareScreen(ev.data.message.sourceID, ev.data.message.withAudio);
        }
    };

    private attachVoiceTracks(tracks: MediaStreamTrack[]) {
        const audioEls = [];
        for (const track of tracks) {
            const audioEl = document.createElement('audio');
            audioEl.srcObject = new MediaStream([track]);
            audioEl.controls = false;
            audioEl.autoplay = true;
            audioEl.style.display = 'none';
            audioEl.onerror = (err) => logErr(err);
            audioEl.setAttribute('data-testid', track.id);

            const deviceID = window.callsClient?.currentAudioOutputDevice?.deviceId;
            if (deviceID) {
                // @ts-ignore - setSinkId is an experimental feature
                audioEl.setSinkId(deviceID);
            }

            document.body.appendChild(audioEl);
            track.onended = () => {
                audioEl.srcObject = null;
                audioEl.remove();
            };

            audioEls.push(audioEl);
        }

        this.setState({
            audioEls: [...this.state.audioEls, ...audioEls],
        });
    }

    public componentDidMount() {
        if (!window.callsClient) {
            logErr('callsClient should be defined');
            return;
        }

        if (this.props.global) {
            window.visualViewport?.addEventListener('resize', this.onViewportResize);
            this.unsubscribers.push(() => {
                window.visualViewport?.removeEventListener('resize', this.onViewportResize);
            });

            this.menuResizeObserver = new ResizeObserver(this.sendGlobalWidgetBounds);
            this.menuResizeObserver.observe(this.menuNode.current!);

            if (window.desktopAPI?.onScreenShared && window.desktopAPI?.onCallsError) {
                logDebug('registering desktopAPI.onScreenShared');
                this.unsubscribers.push(window.desktopAPI.onScreenShared((sourceID: string, withAudio: boolean) => {
                    logDebug('desktopAPI.onScreenShared');
                    this.shareScreen(sourceID, withAudio);
                }));

                logDebug('registering desktopAPI.onCallsError');
                this.unsubscribers.push(window.desktopAPI.onCallsError((err: string) => {
                    logDebug('desktopAPI.onCallsError', err);
                    if (err === 'screen-permissions') {
                        logDebug('screen permissions error');
                        this.setMissingScreenPermissions(true, true);
                    }
                }));
            } else {
                // DEPRECATED: legacy Desktop API logic (<= 5.6.0)
                window.addEventListener('message', this.handleDesktopEvents);
                this.unsubscribers.push(() => {
                    window.removeEventListener('message', this.handleDesktopEvents);
                });
            }
        } else {
            document.addEventListener('mouseup', this.onMouseUp, false);
            this.unsubscribers.push(() => {
                document.removeEventListener('mouseup', this.onMouseUp, false);
            });
        }

        document.addEventListener('click', this.closeOnBlur, true);
        this.unsubscribers.push(() => {
            document.removeEventListener('click', this.closeOnBlur, true);
        });
        document.addEventListener('keyup', this.keyboardClose, true);
        this.unsubscribers.push(() => {
            document.removeEventListener('keyup', this.keyboardClose, true);
        });

        // keyboard shortcuts
        document.addEventListener('keydown', this.handleKBShortcuts, true);
        this.unsubscribers.push(() => {
            document.removeEventListener('keydown', this.handleKBShortcuts, true);
        });

        // set cross-window actions
        window.callActions = {
            setRecordingPromptDismissedAt: this.props.recordingPromptDismissedAt,
            setMissingScreenPermissions: this.setMissingScreenPermissions,
        };

        this.attachVoiceTracks(window.callsClient.getRemoteVoiceTracks());
        window.callsClient.on('remoteVoiceStream', (stream: MediaStream) => {
            this.attachVoiceTracks(stream.getAudioTracks());
        });

        // eslint-disable-next-line react/no-did-mount-set-state
        this.setState({
            screenStream: window.callsClient.getRemoteScreenStream(),
        });
        window.callsClient.on('remoteScreenStream', (stream: MediaStream) => {
            this.setState({
                screenStream: stream,
            });
        });

        window.callsClient.on('localScreenStream', (stream: MediaStream) => {
            this.setState({
                screenStream: stream,
            });
        });

        window.callsClient.on('devicechange', (devices: AudioDevices) => {
            const state = {} as State;

            if (window.callsClient) {
                if (window.callsClient.currentAudioInputDevice !== this.state.currentAudioInputDevice) {
                    state.currentAudioInputDevice = window.callsClient.currentAudioInputDevice;
                }

                if (window.callsClient.currentAudioOutputDevice !== this.state.currentAudioOutputDevice) {
                    state.currentAudioOutputDevice = window.callsClient.currentAudioOutputDevice;
                }
            }

            this.setState({
                ...state,
                devices,
                alerts: {
                    ...this.state.alerts,
                    missingAudioInput: {
                        ...this.state.alerts.missingAudioInput,
                        active: devices.inputs.length === 0,
                        show: devices.inputs.length === 0,
                    },
                },
            });
        });

        window.callsClient.on('connect', () => {
            const callsClient = window.callsClient;

            if (this.props.global && callsClient) {
                if (window.desktopAPI?.callsWidgetConnected) {
                    logDebug('desktopAPI.callsWidgetConnected');
                    window.desktopAPI.callsWidgetConnected(callsClient.channelID, callsClient.getSessionID() || '');
                } else {
                    // DEPRECATED: legacy Desktop API logic (<= 5.6.0)
                    sendDesktopEvent('calls-joined-call', {
                        callID: callsClient.channelID,
                        sessionID: callsClient.getSessionID(),
                    });
                }
            }

            if (isDMChannel(this.props.channel) || isGMChannel(this.props.channel)) {
                callsClient?.unmute();
            }

            this.setState({currentAudioInputDevice: callsClient?.currentAudioInputDevice});
            this.setState({currentAudioOutputDevice: callsClient?.currentAudioOutputDevice});
        });

        window.callsClient.on('error', (err: Error) => {
            if (err === AudioInputPermissionsError) {
                this.setState({
                    alerts: {
                        ...this.state.alerts,
                        missingAudioInputPermissions: {
                            active: true,
                            show: true,
                        },
                    },
                });
            }
        });

        window.callsClient.on('initaudio', () => {
            this.setState({
                alerts: {
                    ...this.state.alerts,
                    missingAudioInputPermissions: {
                        active: false,
                        show: false,
                    },
                },
            });
        });

        window.callsClient?.on('mos', (mos: number) => {
            if (!this.callQualityBannerLocked && !this.state.alerts.degradedCallQuality.show && mos < mosThreshold) {
                this.setState({
                    alerts: {
                        ...this.state.alerts,
                        degradedCallQuality: {
                            active: true,
                            show: true,
                        },
                    },
                });
            }
            if (!this.callQualityBannerLocked && this.state.alerts.degradedCallQuality.show && mos >= mosThreshold) {
                this.setState({
                    alerts: {
                        ...this.state.alerts,
                        degradedCallQuality: {
                            active: false,
                            show: false,
                        },
                    },
                });
            }
        });
    }

    public componentWillUnmount() {
        this.unsubscribers.forEach((unsubscribe) => unsubscribe());
        this.unsubscribers = [];

        if (this.menuResizeObserver) {
            this.menuResizeObserver.disconnect();
        }
    }

    public componentDidUpdate(prevProps: Props, prevState: State) {
        if (this.screenPlayer && this.state.screenStream !== prevState.screenStream) {
            this.screenPlayer.srcObject = this.state.screenStream;
        }
    }

    private getGlobalWidgetBounds = () => {
        const bounds = {
            width: 0,
            height: 0,
        };

        const widget = this.node.current;

        if (widget) {
            const widgetMenu = widget.children[1];
            const baseWidget = widget.children[2];

            // No strict need to be pixel perfect here since the window will be transparent
            // and better to overestimate slightly to avoid the widget possibly being cut.
            const hMargin = 6;
            const vMargin = 6;

            // Margin on base width is needed to account for the widget being
            // positioned 2px from the left.
            bounds.width = baseWidget.getBoundingClientRect().width + hMargin;

            // Margin on base height is needed to account for the widget being
            // positioned 4px from the bottom.
            bounds.height = baseWidget.getBoundingClientRect().height + widgetMenu.getBoundingClientRect().height + vMargin;

            if (widgetMenu.getBoundingClientRect().height > 0) {
                bounds.height += vMargin;
            }

            if (this.audioMenu) {
                bounds.width += this.audioMenu.getBoundingClientRect().width + hMargin;
            }
        }

        return bounds;
    };

    private sendGlobalWidgetBounds = () => {
        const bounds = this.getGlobalWidgetBounds();

        if (window.desktopAPI?.resizeCallsWidget) {
            logDebug('desktopAPI.resizeCallsWidget');
            window.desktopAPI.resizeCallsWidget(Math.ceil(bounds.width), Math.ceil(bounds.height));
        } else {
            // DEPRECATED: legacy Desktop API logic (<= 5.6.0)
            sendDesktopEvent('calls-widget-resize', {
                element: 'calls-widget',
                width: Math.ceil(bounds.width),
                height: Math.ceil(bounds.height),
            });
        }
    };

    private keyboardClose = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            this.setState({showMenu: false});
        }
    };

    private closeOnBlur = (e: Event) => {
        if (this.node && this.node.current && e.target && this.node.current.contains(e.target as Node)) {
            return;
        }
        this.setState({showMenu: false});
    };

    private shareScreen = async (sourceID: string, _withAudio: boolean) => {
        const stream = await window.callsClient?.shareScreen(sourceID, hasExperimentalFlag());
        if (stream) {
            this.setState({screenStream: stream});
            this.setMissingScreenPermissions(false, true);
        } else {
            this.setMissingScreenPermissions(true, true);
        }
    };

    dismissRecordingPrompt = () => {
        if (!this.props.channel) {
            logErr('missing channel');
            return;
        }

        // Dismiss our prompt.
        this.props.recordingPromptDismissedAt(this.props.channel.id, Date.now());

        // Dismiss the expanded window's prompt.
        this.state.expandedViewWindow?.callActions?.setRecordingPromptDismissedAt(this.props.channel.id, Date.now());
    };

    onRecordToggle = async () => {
        if (!this.props.channel) {
            logErr('channel should be defined');
            return;
        }

        const recording = this.props.callRecording;
        const isRecording = (recording?.start_at ?? 0) > (recording?.end_at ?? 0);

        if (isRecording) {
            if (this.props.global) {
                if (window.desktopAPI?.openStopRecordingModal) {
                    logDebug('desktopAPI.openStopRecordingModal');
                    window.desktopAPI.openStopRecordingModal(this.props.channel.id);
                } else {
                    this.props.stopCallRecording(this.props.channel.id);
                }
            } else {
                this.props.openModal({
                    modalId: IDStopRecordingConfirmation,
                    dialogType: StopRecordingConfirmation,
                    dialogProps: {
                        channelID: this.props.channel.id,
                    },
                });
            }
            this.props.trackEvent(Telemetry.Event.StopRecording, Telemetry.Source.Widget, {initiator: 'button'});
        } else {
            await this.props.startCallRecording(this.props.channel.id);
            this.props.trackEvent(Telemetry.Event.StartRecording, Telemetry.Source.Widget, {initiator: 'button'});
        }

        this.setState({showMenu: false});
    };

    onChatThreadButtonClick = () => {
        if (!this.props.callThreadID) {
            logErr('missing thread ID');
            return;
        }

        if (this.props.global && window.desktopAPI?.openThreadForCalls) {
            logDebug('desktopAPI.openThreadForCalls');
            window.desktopAPI.openThreadForCalls(this.props.callThreadID);
        } else {
            this.props.selectRHSPost(this.props.callThreadID);
        }

        this.setState({showMenu: false});
    };

    onShareScreenToggle = async (fromShortcut?: boolean) => {
        if (!this.props.allowScreenSharing) {
            return;
        }
        const state = {} as State;

        if (this.props.screenSharingSession?.session_id === this.props.currentSession?.session_id) {
            window.callsClient?.unshareScreen();
            state.screenStream = null;
            this.props.trackEvent(Telemetry.Event.UnshareScreen, Telemetry.Source.Widget, {initiator: fromShortcut ? 'shortcut' : 'button'});
        } else if (!this.props.screenSharingSession) {
            if (window.desktop && compareSemVer(window.desktop.version, '5.1.0') >= 0) {
                if (this.props.global) {
                    if (window.desktopAPI?.openScreenShareModal) {
                        logDebug('desktopAPI.openScreenShareModal');
                        window.desktopAPI.openScreenShareModal();
                    } else {
                        // DEPRECATED: legacy Desktop API logic (<= 5.6.0)
                        sendDesktopEvent('desktop-sources-modal-request');
                    }
                } else {
                    this.props.showScreenSourceModal();
                }
            } else {
                await this.shareScreen('', hasExperimentalFlag());
            }
            this.props.trackEvent(Telemetry.Event.ShareScreen, Telemetry.Source.Widget, {initiator: fromShortcut ? 'shortcut' : 'button'});
        }

        this.setState({
            ...state,
            showMenu: false,
        });
    };

    onMuteToggle = () => {
        if (!window.callsClient) {
            return;
        }

        // This is needed to prevent a conflict with the accessibility controller on buttons.
        if (document.activeElement instanceof HTMLElement) {
            document.activeElement.blur();
        }

        if (this.isMuted()) {
            window.callsClient.unmute();
        } else {
            window.callsClient.mute();
        }
    };

    isMuted() {
        return this.props.currentSession ? !this.props.currentSession.unmuted : true;
    }

    isHandRaised() {
        return this.props.currentSession ? this.props.currentSession.raised_hand > 0 : false;
    }

    onDisconnectClick = () => {
        if (this.state.expandedViewWindow) {
            this.state.expandedViewWindow.close();
        }
        if (window.callsClient) {
            window.callsClient.disconnect();
        }
        this.setState({
            showMenu: false,
            showParticipantsList: false,
            currentAudioInputDevice: null,
            dragging: {
                dragging: false,
                x: 0,
                y: 0,
                initX: 0,
                initY: 0,
                offX: 0,
                offY: 0,
            },
            expandedViewWindow: null,
        });
    };

    onMenuClick = () => {
        this.setState({
            showMenu: !this.state.showMenu,
            showParticipantsList: false,
        });
    };

    onParticipantsButtonClick = (fromShortcut?: boolean) => {
        const event = this.state.showParticipantsList ? Telemetry.Event.CloseParticipantsList : Telemetry.Event.OpenParticipantsList;
        this.props.trackEvent(event, Telemetry.Source.Widget, {initiator: fromShortcut ? 'shortcut' : 'button'});

        // This is needed to prevent a conflict with the accessibility controller on buttons.
        if (document.activeElement instanceof HTMLElement) {
            document.activeElement.blur();
        }

        this.setState({
            showParticipantsList: !this.state.showParticipantsList,
            showMenu: false,
        });
    };

    onAudioInputDeviceClick = (device: MediaDeviceInfo) => {
        if (device.deviceId !== this.state.currentAudioInputDevice?.deviceId) {
            window.callsClient?.setAudioInputDevice(device);
        }
        this.setState({showAudioInputDevicesMenu: false, currentAudioInputDevice: device});
    };

    onAudioOutputDeviceClick = (device: MediaDeviceInfo) => {
        if (device.deviceId !== this.state.currentAudioOutputDevice?.deviceId) {
            window.callsClient?.setAudioOutputDevice(device);
            const ps = [];
            for (const audioEl of this.state.audioEls) {
                // @ts-ignore - setSinkId is an experimental feature
                ps.push(audioEl.setSinkId(device.deviceId));
            }
            Promise.all(ps).then(() => {
                logDebug('audio output has changed');
            }).catch((err) => {
                logErr(err);
            });
        }
        this.setState({showAudioOutputDevicesMenu: false, currentAudioOutputDevice: device});
    };

    onRemove = (sessionID: string, userID: string) => {
        this.setState({
            removeConfirmation: {
                sessionID,
                userID,
            },
        });
    };

    onRemoveConfirm = () => {
        hostRemove(this.props.channel?.id, this.state.removeConfirmation?.sessionID);
        this.setState({
            removeConfirmation: null,
        });
    };

    onRemoveCancel = () => {
        this.setState({
            removeConfirmation: null,
        });
    };

    renderScreenSharingPanel = () => {
        if (!this.props.screenSharingSession) {
            return null;
        }

        const {formatMessage} = this.props.intl;

        const isSharing = this.props.screenSharingSession.session_id === this.props.currentSession?.session_id;

        let profile;
        if (!isSharing) {
            profile = this.props.profiles[this.props.screenSharingSession.user_id];
            if (!profile) {
                return null;
            }
        }

        const msg = isSharing ? formatMessage({defaultMessage: 'You\'re sharing your screen'}) : formatMessage({defaultMessage: 'You\'re viewing {presenter}\'s screen'}, {presenter: getUserDisplayName(profile)});

        return (
            <div
                className='Menu'
                style={{
                    display: 'flex',
                    position: 'relative',
                    zIndex: 1000,
                }}
            >
                {isSharing &&
                    <div
                        style={{
                            position: 'absolute',
                            display: 'flex',
                            width: '100%',
                            height: '100%',
                            top: '1px',
                            background: 'rgba(63, 67, 80, 0.4)',
                            justifyContent: 'center',
                            alignItems: 'center',
                            borderRadius: '8px',
                            zIndex: 1001,
                        }}
                    >
                        <button
                            id='calls-widget-stop-screenshare'
                            data-testid='calls-widget-stop-screenshare'
                            className='cursor--pointer style--none'
                            onClick={() => this.onShareScreenToggle()}
                        >
                            {formatMessage({defaultMessage: 'Stop sharing'})}
                        </button>
                    </div>
                }
                <ul
                    className='Menu__content dropdown-menu'
                    style={this.style.screenSharingPanel}
                >
                    <div
                        style={{position: 'relative', width: '80%', maxHeight: '188px', background: '#C4C4C4'}}
                    >
                        <video
                            id='screen-player'
                            ref={this.setScreenPlayerRef}
                            style={{maxHeight: '188px'}}
                            width='100%'
                            height='100%'
                            autoPlay={true}
                            muted={true}
                        />

                        <button
                            className='cursor--pointer style--none'
                            style={{
                                display: isSharing ? 'none' : 'flex',
                                justifyContent: 'center',
                                alignItems: 'center',
                                position: 'absolute',
                                padding: '8px 16px',
                                background: 'var(--button-bg)',
                                color: 'white',
                                borderRadius: '4px',
                                fontWeight: 600,
                                top: '50%',
                                left: '50%',
                                width: '112px',
                                transform: 'translate(-50%, -50%)',
                            }}
                            onClick={this.onExpandClick}
                        >

                            <PopOutIcon
                                style={{width: '16px', height: '16px', fill: 'white', marginRight: '8px'}}
                            />
                            <span>{formatMessage({defaultMessage: 'Pop out'})}</span>
                        </button>

                    </div>
                    <span
                        style={{
                            marginTop: '8px',
                            color: 'rgba(var(--center-channel-color-rgb), 0.72)',
                            fontSize: '12px',
                            padding: '0 8px',
                            textAlign: 'center',
                        }}
                    >
                        {msg}
                    </span>
                </ul>
            </div>
        );
    };

    renderScreenShareButton = () => {
        const {formatMessage} = this.props.intl;
        const sharingID = this.props.screenSharingSession?.session_id;
        const isSharing = sharingID && sharingID === this.props.currentSession?.session_id;

        let fill = '';
        if (isSharing) {
            fill = 'rgb(var(--dnd-indicator-rgb))';
        } else if (sharingID) {
            fill = 'rgba(var(--center-channel-color-rgb), 0.34)';
        }

        const noScreenPermissions = this.state.alerts.missingScreenPermissions.active;
        let shareScreenTooltipText = isSharing ? formatMessage({defaultMessage: 'Stop presenting'}) : formatMessage({defaultMessage: 'Start presenting'});
        if (noScreenPermissions) {
            shareScreenTooltipText = formatMessage(CallAlertConfigs.missingScreenPermissions.tooltipText!);
        }

        // Purposely not showing the subtext on Desktop as the tooltip gets cut off otherwise.
        const shareScreenTooltipSubtext = noScreenPermissions && !this.props.global ? formatMessage(CallAlertConfigs.missingScreenPermissions.tooltipSubtext!) : '';

        const ShareIcon = isSharing ? UnshareScreenIcon : ShareScreenIcon;

        return (
            <WidgetButton
                id='share-screen'
                onToggle={() => this.onShareScreenToggle()}
                tooltipText={shareScreenTooltipText}
                tooltipSubtext={shareScreenTooltipSubtext}
                // eslint-disable-next-line no-undefined
                shortcut={noScreenPermissions ? undefined : reverseKeyMappings.widget[SHARE_UNSHARE_SCREEN][0]}
                bgColor={isSharing ? 'rgba(var(--dnd-indicator-rgb), 0.16)' : ''}
                icon={<ShareIcon style={{fill}}/>}
                unavailable={noScreenPermissions}
                disabled={Boolean(sharingID) && !isSharing}
            />
        );
    };

    renderSpeaking = () => {
        const {formatMessage} = this.props.intl;
        let speakingProfile;

        for (let i = 0; i < this.props.sessions.length; i++) {
            const session = this.props.sessions[i];
            const profile = this.props.profiles[session.user_id];
            if (session.voice && profile) {
                speakingProfile = profile;
                break;
            }
        }

        return (
            <div style={{fontSize: '14px', lineHeight: '20px', display: 'flex', whiteSpace: 'pre'}}>
                <span style={{fontWeight: speakingProfile ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis'}}>
                    {speakingProfile ? getUserDisplayName(speakingProfile) : formatMessage({defaultMessage: 'No one'})}
                    <span
                        style={{fontWeight: 400}}
                    >{untranslatable(' ')}{formatMessage({defaultMessage: 'is talking…'})}</span>
                </span>
            </div>
        );
    };

    audioDevicesMenuRefCb = (el: HTMLUListElement) => {
        if (this.audioMenuResizeObserver) {
            this.audioMenuResizeObserver.disconnect();
        }

        this.audioMenu = el;

        if (el) {
            this.audioMenuResizeObserver = new ResizeObserver(this.sendGlobalWidgetBounds);
            this.audioMenuResizeObserver.observe(el);
        } else {
            this.sendGlobalWidgetBounds();
        }
    };

    renderAudioDevicesList = (deviceType: string, devices: MediaDeviceInfo[]) => {
        const {formatMessage} = this.props.intl;

        if (deviceType === 'input' && !this.state.showAudioInputDevicesMenu) {
            return null;
        }

        if (deviceType === 'output' && !this.state.showAudioOutputDevicesMenu) {
            return null;
        }

        const currentDevice = deviceType === 'input' ? this.state.currentAudioInputDevice : this.state.currentAudioOutputDevice;

        // Note: this is system default, not the concept of default that we save in local storage in client.ts
        const makeDeviceLabel = (device: MediaDeviceInfo) => {
            if (device.deviceId.startsWith('default') && !device.label.startsWith('Default')) {
                return formatMessage({defaultMessage: 'Default - {deviceLabel}'}, {deviceLabel: device.label});
            }
            return device.label;
        };

        const deviceList = devices.map((device) => {
            return (
                <li
                    className='MenuItem'
                    key={`audio-${deviceType}-device-${device.deviceId}`}
                >
                    <button
                        className='style--none'
                        style={{
                            background: device.deviceId === currentDevice?.deviceId ? 'rgba(28, 88, 217, 0.08)' : '',
                            lineHeight: '20px',
                            padding: '8px 20px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                        }}
                        onClick={() => (deviceType === 'input' ? this.onAudioInputDeviceClick(device) : this.onAudioOutputDeviceClick(device))}
                    >
                        <span
                            style={{
                                color: 'var(--center-channel-color)',
                                fontSize: '14px',
                                width: '100%',
                                textOverflow: 'ellipsis',
                                overflow: 'hidden',
                            }}
                        >
                            {makeDeviceLabel(device)}
                        </span>

                        {device.deviceId === currentDevice?.deviceId &&
                            <TickIcon
                                style={{
                                    width: '16px',
                                    height: '16px',
                                    fill: 'var(--button-bg)',
                                }}
                            />
                        }
                    </button>
                </li>
            );
        });

        return (
            <div className='Menu'>
                <ul
                    id={`calls-widget-audio-${deviceType}s-menu`}
                    className='Menu__content dropdown-menu'
                    style={this.style.audioDevicesMenu}
                    // eslint-disable-next-line no-undefined
                    ref={this.props.global ? this.audioDevicesMenuRefCb : undefined}
                >
                    {deviceList}
                </ul>
            </div>
        );
    };

    renderAudioDevices = (deviceType: string) => {
        if (!window.callsClient || !this.state.devices) {
            return null;
        }
        if (deviceType === 'output' && this.state.devices.outputs.length === 0) {
            return null;
        }

        const {formatMessage} = this.props.intl;

        const currentDevice = deviceType === 'input' ? this.state.currentAudioInputDevice : this.state.currentAudioOutputDevice;
        const DeviceIcon = deviceType === 'input' ? UnmutedIcon : SpeakerIcon;

        const noInputDevices = deviceType === 'input' && this.state.devices.inputs?.length === 0;
        const noAudioPermissions = deviceType === 'input' && this.state.alerts.missingAudioInputPermissions.active;

        let label = currentDevice?.label || formatMessage({defaultMessage: 'Default'});
        if (noAudioPermissions) {
            label = formatMessage(CallAlertConfigs.missingAudioInputPermissions.tooltipText!);
        } else if (noInputDevices) {
            label = formatMessage(CallAlertConfigs.missingAudioInput.tooltipText!);
        }

        const onClickHandler = () => {
            if (deviceType === 'input') {
                this.setState({
                    showAudioInputDevicesMenu: !this.state.showAudioInputDevicesMenu,
                    showAudioOutputDevicesMenu: false,
                });
            } else {
                this.setState({
                    showAudioOutputDevicesMenu: !this.state.showAudioOutputDevicesMenu,
                    showAudioInputDevicesMenu: false,
                });
            }
        };

        const devices = deviceType === 'input' ? this.state.devices.inputs?.filter((device) => device.deviceId && device.label) : this.state.devices.outputs?.filter((device) => device.deviceId && device.label);
        const isDisabled = devices.length === 0;

        const buttonStyle: CSSProperties = {
            display: 'flex',
            alignItems: 'start',
            padding: '6px 16px',
            color: isDisabled ? 'rgba(var(--center-channel-color-rgb), 0.32)' : '',
        };

        if ((deviceType === 'input' && this.state.showAudioInputDevicesMenu) || (deviceType === 'output' && this.state.showAudioOutputDevicesMenu)) {
            buttonStyle.background = 'rgba(var(--center-channel-color-rgb), 0.08)';
        }

        return (
            <React.Fragment>
                {devices.length > 0 && this.renderAudioDevicesList(deviceType, devices)}
                <li
                    className='MenuItem'
                >
                    <button
                        id={`calls-widget-audio-${deviceType}-button`}
                        className='style--none'
                        style={buttonStyle}
                        onClick={onClickHandler}
                        disabled={isDisabled}
                    >

                        <DeviceIcon
                            style={{
                                width: '16px',
                                height: '16px',
                                fill: isDisabled ? 'rgba(var(--center-channel-color-rgb), 0.32)' : 'rgba(var(--center-channel-color-rgb), 0.56)',
                                flexShrink: 0,
                            }}
                        />

                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'start',
                                flexDirection: 'column',
                                justifyContent: 'center',
                                width: '100%',
                                gap: '4px',
                                padding: '0 8px',
                            }}
                        >
                            <span
                                className='MenuItem__primary-text'
                                style={{padding: '0', lineHeight: '18px'}}
                            >
                                {deviceType === 'input' ? formatMessage({defaultMessage: 'Microphone'}) : formatMessage({defaultMessage: 'Audio output'})}
                            </span>

                            <span
                                style={{
                                    color: isDisabled ? 'rgba(var(--center-channel-color-rgb), 0.32)' : 'rgba(var(--center-channel-color-rgb), 0.56)',
                                    fontSize: '12px',
                                    width: '100%',
                                    lineHeight: '18px',
                                    textOverflow: 'ellipsis',
                                    overflow: 'hidden',
                                    whiteSpace: isDisabled ? 'initial' : 'nowrap',
                                }}
                            >
                                {label}
                            </span>
                        </div>

                        {devices.length > 0 &&
                            <ShowMoreIcon
                                style={{
                                    width: '18px',
                                    height: '18px',
                                    fill: isDisabled ? 'rgba(var(--center-channel-color-rgb), 0.32)' : 'rgba(var(--center-channel-color-rgb), 0.56)',
                                }}
                            />
                        }
                    </button>
                </li>
            </React.Fragment>
        );
    };

    renderChatThreadMenuItem = () => {
        const {formatMessage} = this.props.intl;

        // If we are on global widget we should show this
        // only if we have the matching functionality available.
        if (this.props.global && !window.desktopAPI?.openThreadForCalls) {
            return null;
        }

        return (
            <>
                <li
                    className='MenuItem'
                >
                    <button
                        id='calls-widget-menu-chat-button'
                        className='style--none'
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                        }}
                        onClick={() => this.onChatThreadButtonClick()}
                    >
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                width: '100%',
                                padding: '2px 0',
                                gap: '8px',
                            }}
                        >
                            <ChatThreadIcon
                                style={{width: '16px', height: '16px'}}
                                fill={'rgba(var(--center-channel-color-rgb), 0.64)'}
                            />
                            <span>{formatMessage({defaultMessage: 'Show chat thread'})}</span>
                        </div>

                    </button>
                </li>
            </>
        );
    };

    renderRecordingMenuItem = () => {
        const {formatMessage} = this.props.intl;

        const RecordIcon = this.props.isRecording ? RecordSquareIcon : RecordCircleIcon;

        return (
            <React.Fragment>
                <li
                    className='MenuItem'
                >
                    <button
                        id='calls-widget-menu-record-button'
                        className='style--none'
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                        }}
                        onClick={() => this.onRecordToggle()}
                    >
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                width: '100%',
                                padding: '2px 0',
                                gap: '8px',
                            }}
                        >
                            <RecordIcon
                                style={{width: '16px', height: '16px'}}
                                fill={this.props.isRecording ? 'rgb(var(--dnd-indicator-rgb))' : 'rgba(var(--center-channel-color-rgb), 0.64)'}
                            />
                            <span>{this.props.isRecording ? formatMessage({defaultMessage: 'Stop recording'}) : formatMessage({defaultMessage: 'Record call'})}</span>
                        </div>

                    </button>
                </li>
            </React.Fragment>
        );
    };

    renderScreenSharingMenuItem = () => {
        const {formatMessage} = this.props.intl;
        const sharingID = this.props.screenSharingSession?.session_id;
        const isSharing = sharingID && sharingID === this.props.currentSession?.session_id;
        const isDisabled = Boolean(sharingID && !isSharing);
        const noPermissions = this.state.alerts.missingScreenPermissions.active;

        const ShareIcon = isSharing ? UnshareScreenIcon : ShareScreenIcon;

        return (
            <React.Fragment>
                <li
                    className='MenuItem'
                >
                    <button
                        id='calls-widget-menu-screenshare'
                        className={`style--none ${noPermissions ? 'unavailable' : ''}`}
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            color: isDisabled || noPermissions ? 'rgba(var(--center-channel-color-rgb), 0.32)' : '',
                        }}
                        disabled={isDisabled}
                        onClick={() => this.onShareScreenToggle()}
                    >

                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'flex-start',
                                width: '100%',
                                padding: '2px 0',
                            }}
                        >
                            <UnavailableIconWrapper
                                icon={(
                                    <ShareIcon
                                        style={{width: '16px', height: '16px'}}
                                        fill={isSharing ? 'rgb(var(--dnd-indicator-rgb))' : 'rgba(var(--center-channel-color-rgb), 0.64)'}
                                    />
                                )}
                                unavailable={noPermissions}
                                margin={'0 8px 0 0'}
                            />
                            <span>{isSharing ? formatMessage({defaultMessage: 'Stop presenting'}) : formatMessage({defaultMessage: 'Start presenting'})}</span>
                        </div>

                        {noPermissions &&
                            <span
                                style={{
                                    color: 'rgba(var(--center-channel-color-rgb), 0.32)',
                                    fontSize: '12px',
                                    width: '100%',
                                    lineHeight: '16px',
                                    whiteSpace: 'initial',
                                }}
                            >
                                {formatMessage(CallAlertConfigs.missingScreenPermissions.tooltipText!)}
                            </span>
                        }

                    </button>
                </li>
            </React.Fragment>
        );
    };

    renderMenu = () => {
        if (!this.state.showMenu) {
            return null;
        }

        const isHost = this.props.callHostID === this.props.currentUserID;

        const divider = (
            <li className='MenuGroup menu-divider'/>
        );

        const showScreenShareItem = this.props.allowScreenSharing && !this.props.wider;

        return (
            <div
                className='Menu'
                data-testid='calls-widget-menu'
            >
                <ul
                    className='Menu__content dropdown-menu'
                    style={this.style.settingsMenu}
                >
                    {this.renderAudioDevices('output')}
                    {this.renderAudioDevices('input')}
                    { divider }
                    {showScreenShareItem && this.renderScreenSharingMenuItem()}
                    {showScreenShareItem && divider}
                    {this.props.recordingsEnabled && isHost && this.renderRecordingMenuItem()}
                    {this.renderChatThreadMenuItem()}
                </ul>
            </div>
        );
    };

    renderSpeakingProfile = () => {
        let speakingPictureURL;
        for (let i = 0; i < this.props.sessions.length; i++) {
            const session = this.props.sessions[i];
            const profile = this.props.profiles[session.user_id];
            if (session.voice && profile) {
                speakingPictureURL = Client4.getProfilePictureUrl(profile.id, profile.last_picture_update);
                break;
            }
        }

        return (
            <div
                style={{position: 'relative', display: 'flex', height: 'auto', alignItems: 'center'}}
            >

                {

                    speakingPictureURL &&
                    <Avatar
                        size={32}
                        border={false}
                        url={speakingPictureURL}
                    />
                }

                {
                    !speakingPictureURL &&
                    <Avatar
                        size={32}
                        icon='account-outline'
                        border={false}
                        style={{
                            background: 'rgba(var(--center-channel-color-rgb), 0.16)',
                            color: 'rgba(var(--center-channel-color-rgb), 0.48)',
                            fontSize: '18px',
                        }}
                    />
                }

            </div>
        );
    };

    renderRecordingDisclaimer = () => {
        const {formatMessage} = this.props.intl;
        const isHost = this.props.callHostID === this.props.currentUserID;
        const recording = this.props.callRecording;
        const dismissedAt = recording?.prompt_dismissed_at || 0;
        const hasRecEnded = (recording?.end_at ?? 0) > (recording?.start_at ?? 0);

        // Nothing to show if the recording hasn't started yet, unless there
        // was an error.
        if (!recording?.start_at && !recording?.err) {
            return null;
        }

        // If the recording has ended we only want to show the info prompt
        // to the host.
        if (hasRecEnded && !isHost) {
            return null;
        }

        const shouldShowError = recording?.error_at && recording.error_at > dismissedAt;

        // If the prompt was dismissed after the recording has started and after the last host change
        // we don't show this again, unless there was a more recent error.
        if (!hasRecEnded && dismissedAt > recording?.start_at && dismissedAt > this.props.callHostChangeAt) {
            if (!shouldShowError) {
                return null;
            }
        }

        // If the prompt was dismissed after the recording has ended then we
        // don't show this again.
        if (hasRecEnded && dismissedAt > recording?.end_at) {
            if (!shouldShowError) {
                return null;
            }
        }

        // If the host has changed for the current recording after the banner was dismissed, we should show
        // again only if the user is the new host.
        if (dismissedAt > recording?.start_at && this.props.callHostChangeAt > dismissedAt && !isHost) {
            if (!shouldShowError) {
                return null;
            }
        }

        // If the user became host after the recording has ended we don't want to
        // show the "Recording has stopped" banner.
        if (isHost && hasRecEnded && this.props.callHostChangeAt > recording.end_at) {
            if (!shouldShowError) {
                return null;
            }
        }

        const disclaimerStrings = this.props.transcriptionsEnabled ? CallTranscribingDisclaimerStrings : CallRecordingDisclaimerStrings;
        let header = formatMessage(disclaimerStrings[isHost ? 'host' : 'participant'].header);
        let body = formatMessage(disclaimerStrings[isHost ? 'host' : 'participant'].body);
        let confirmText = isHost ? formatMessage({defaultMessage: 'Dismiss'}) : formatMessage({defaultMessage: 'Understood'});
        // eslint-disable-next-line no-undefined
        const rightText = isHost ? undefined : formatMessage({defaultMessage: 'Leave call'});
        let icon = (
            <RecordCircleIcon
                style={{width: '12px', height: '12px'}}
            />
        );

        if (hasRecEnded) {
            if (isHost) {
                confirmText = formatMessage({defaultMessage: 'Dismiss'});
            } else {
                confirmText = '';
            }

            if (this.props.transcriptionsEnabled) {
                header = formatMessage({defaultMessage: 'Recording and transcription has stopped. Processing…'});
                body = formatMessage({defaultMessage: 'You can find the recording and transcription in this call\'s chat thread once it has finished processing.'});
            } else {
                header = formatMessage({defaultMessage: 'Recording has stopped. Processing…'});
                body = formatMessage({defaultMessage: 'You can find the recording in this call\'s chat thread once it has finished processing.'});
            }
        }

        if (recording?.err) {
            header = formatMessage({defaultMessage: 'Something went wrong with the recording'});
            body = recording?.err;
            icon = (
                <CompassIcon
                    icon='alert-outline'
                    style={{
                        fontSize: 12,
                    }}
                />
            );
        }

        return (
            <WidgetBanner
                id={'calls-widget-banner-recording'}
                key={'widget_banner_recording_disclaimer'}
                type='info'
                icon={icon}
                iconFill='rgb(var(--dnd-indicator-rgb))'
                iconColor='rgb(var(--dnd-indicator-rgb))'
                header={header}
                body={body}
                leftText={confirmText}
                rightText={rightText}
                onLeftButtonClick={this.dismissRecordingPrompt}
                onRightButtonClick={this.onDisconnectClick}
                onCloseButtonClick={this.dismissRecordingPrompt}
            />
        );
    };

    renderRecordingBadge = () => {
        // This should not render if:
        // - The recording has not been initialized yet OR if it has ended.
        if (!this.props.callRecording?.init_at || this.props.callRecording?.end_at) {
            return null;
        }

        const isHost = this.props.callHostID === this.props.currentUserID;
        const hasRecStarted = this.props.callRecording?.start_at;

        // If the recording has not started yet then we only render if the user
        // is the host, in which case we'll show the loading spinner.
        if (!isHost && !hasRecStarted) {
            return null;
        }

        if (this.props.callRecording?.err) {
            return null;
        }

        return (
            <React.Fragment>
                <Badge
                    id={'calls-recording-badge'}
                    text={'REC'}
                    textSize={11}
                    gap={2}
                    icon={(<RecordCircleIcon style={{width: '11px', height: '11px'}}/>)}
                    color={hasRecStarted ? '#D24B4E' : 'rgb(var(--center-channel-color-rgb))'}
                    loading={!hasRecStarted}
                />
                <div style={{margin: '0 2px 0 4px'}}>{untranslatable('•')}</div>
            </React.Fragment>
        );
    };

    renderAlertBanners = () => {
        const {formatMessage} = this.props.intl;
        return Object.entries(this.state.alerts).map((keyVal) => {
            const [alertID, alertState] = keyVal;
            if (!alertState.show) {
                return null;
            }

            const alertConfig = CallAlertConfigs[alertID];

            let onClose;
            if (alertConfig.dismissable) {
                onClose = () => {
                    this.setState({
                        alerts: {
                            ...this.state.alerts,
                            [alertID]: {
                                ...alertState,
                                show: false,
                            },
                        },
                    });
                    if (alertID === 'degradedCallQuality') {
                        this.callQualityBannerLocked = true;
                        setTimeout(() => {
                            this.callQualityBannerLocked = false;
                        }, DEGRADED_CALL_QUALITY_ALERT_WAIT);
                    }
                };
            }

            return (
                <WidgetBanner
                    id={'calls-widget-banner-alert'}
                    {...alertConfig}
                    key={`widget_banner_${alertID}`}
                    header={formatMessage(alertConfig.bannerText)}
                    onLeftButtonClick={onClose}
                    onCloseButtonClick={onClose}
                />
            );
        });
    };

    renderNotificationBar = () => {
        if (!this.props.currentUserID) {
            return null;
        }

        const joinedUsers = this.props.recentlyJoinedUsers.map((userID) => {
            if (userID === this.props.currentUserID) {
                return null;
            }

            const profile = this.props.profiles[userID];
            if (!profile) {
                return null;
            }

            const picture = Client4.getProfilePictureUrl(userID, profile.last_picture_update);

            return (
                <div
                    className='calls-notification-bar calls-slide-top'
                    key={profile.id}
                    data-testid={'call-joined-participant-notification'}
                >
                    <Avatar
                        size={16}
                        fontSize={8}
                        url={picture}
                        border={false}
                    />
                    <span style={{overflow: 'hidden', textOverflow: 'ellipsis'}}>
                        <FormattedMessage
                            defaultMessage={'<b>{participant}</b> has joined the call.'}
                            values={{
                                b: (text: string) => <b>{text}</b>,
                                participant: getUserDisplayName(profile),
                            }}
                        />
                    </span>
                </div>
            );
        });

        return (
            <div style={{display: 'flex', flexDirection: 'column-reverse', gap: '4px'}}>
                <JoinNotification
                    visible={!this.props.clientConnecting}
                    isMuted={this.isMuted()}
                />
                {this.props.hostNotices.length > 0 && <HostNotices onWidget={true}/>}
                {joinedUsers}
            </div>
        );
    };

    renderIncomingCalls = () => {
        if (this.props.callsIncoming.length === 0) {
            return null;
        }

        return (
            <div style={this.style.callsIncoming}>
                {this.props.callsIncoming.map((c) => (
                    <CallIncomingCondensed
                        key={c.callID}
                        call={c}
                        onWidget={true}
                    />
                ))}
            </div>
        );
    };

    onMouseDown = (ev: React.MouseEvent<HTMLDivElement>) => {
        document.addEventListener('mousemove', this.onMouseMove, false);
        this.setState({
            dragging: {
                ...this.state.dragging,
                dragging: true,
                initX: ev.clientX - this.state.dragging.offX,
                initY: ev.clientY - this.state.dragging.offY,
            },
        });
    };

    onMouseUp = () => {
        document.removeEventListener('mousemove', this.onMouseMove, false);
        this.setState({
            dragging: {
                ...this.state.dragging,
                dragging: false,
                initX: this.state.dragging.x,
                initY: this.state.dragging.y,
            },
        });
    };

    onMouseMove = (ev: MouseEvent) => {
        if (this.state.dragging.dragging && this.node && this.node.current) {
            ev.preventDefault();

            let x = ev.clientX - this.state.dragging.initX;
            let y = ev.clientY - this.state.dragging.initY;

            const rect = this.node.current.getBoundingClientRect();
            const bodyWidth = document.body.clientWidth;
            const bodyHeight = document.body.clientHeight;

            const maxDiffY = bodyHeight - Math.abs(bodyHeight - rect.y);
            const diffY = Math.abs(this.state.dragging.y - y);
            if (diffY > maxDiffY && y < this.state.dragging.y) {
                y = this.state.dragging.y - maxDiffY;
            } else if (rect.bottom + diffY > bodyHeight && y > this.state.dragging.y) {
                y = this.state.dragging.y + (bodyHeight - rect.bottom);
            }

            const maxDiffX = bodyWidth - Math.abs(bodyWidth - rect.x);
            const diffX = Math.abs(this.state.dragging.x - x);
            if (diffX > maxDiffX && x < this.state.dragging.x) {
                x = this.state.dragging.x - maxDiffX;
            } else if (rect.right + diffX > bodyWidth && x > this.state.dragging.x) {
                x = this.state.dragging.x + (bodyWidth - rect.right);
            }

            this.setState({
                dragging: {
                    ...this.state.dragging,
                    x,
                    y,
                    offX: x,
                    offY: y,
                },
            });
            this.node.current.style.transform = 'translate3d(' + x + 'px, ' + y + 'px, 0)';
        }
    };

    onLeaveMenuOpen = (open: boolean) => {
        this.setState({leaveMenuOpen: open});
    };

    onExpandClick = () => {
        if (this.state.expandedViewWindow && !this.state.expandedViewWindow.closed) {
            if (this.props.global) {
                if (window.desktopAPI?.focusPopout) {
                    logDebug('desktopAPI.focusPopout');
                    window.desktopAPI.focusPopout();
                } else {
                    // DEPRECATED: legacy Desktop API logic (<= 5.6.0)
                    sendDesktopEvent('calls-popout-focus');
                }
            } else {
                this.state.expandedViewWindow.focus();
            }
            return;
        }

        this.props.trackEvent(Telemetry.Event.OpenExpandedView, Telemetry.Source.Widget, {initiator: 'button'});

        // TODO: remove this as soon as we support opening a window from desktop app.
        // Reminder: the first condition is for the old desktop app, pre-global widget. The else path is the webapp & global widget.
        if (window.desktop && !this.props.global) {
            this.props.showExpandedView();
        } else {
            if (!this.props.team || !this.props.channel) {
                logErr('missing team or channel');
                return;
            }

            const expandedViewWindow = window.open(
                getPopOutURL(this.props.team, this.props.channel),
                'ExpandedView',
                'resizable=yes',
            );

            this.setState({
                expandedViewWindow,
            });

            expandedViewWindow?.addEventListener('beforeunload', () => {
                this.props.trackEvent(Telemetry.Event.CloseExpandedView, Telemetry.Source.ExpandedView);
                if (!window.callsClient) {
                    return;
                }

                const localScreenStream = window.callsClient.getLocalScreenStream();
                if (localScreenStream && localScreenStream.getVideoTracks()[0].id === expandedViewWindow.screenSharingTrackId) {
                    window.callsClient.unshareScreen();
                }
            });
        }
    };

    onRaiseHandToggle = (fromShortcut?: boolean) => {
        if (!window.callsClient) {
            return;
        }

        // This is needed to prevent a conflict with the accessibility controller on buttons.
        if (document.activeElement instanceof HTMLElement) {
            document.activeElement.blur();
        }

        if (this.isHandRaised()) {
            window.callsClient.unraiseHand();
            this.props.trackEvent(Telemetry.Event.LowerHand, Telemetry.Source.Widget, {initiator: fromShortcut ? 'shortcut' : 'button'});
        } else {
            window.callsClient.raiseHand();
            this.props.trackEvent(Telemetry.Event.RaiseHand, Telemetry.Source.Widget, {initiator: fromShortcut ? 'shortcut' : 'button'});
        }
    };

    onChannelLinkClick = (ev: React.MouseEvent<HTMLElement>) => {
        ev.preventDefault();
        const message = {pathName: this.props.channelURL};
        if (this.props.global) {
            if (window.desktopAPI?.openLinkFromCalls) {
                logDebug('desktopAPI.openLinkFromCalls');
                window.desktopAPI.openLinkFromCalls(this.props.channelURL);
            } else {
                // DEPRECATED: legacy Desktop API logic (<= 5.6.0)
                sendDesktopEvent('calls-widget-channel-link-click', message);
            }
        } else {
            navigateToURL(this.props.channelURL);
        }
        this.props.trackEvent(Telemetry.Event.OpenChannelLink, Telemetry.Source.Widget);
    };

    renderChannelName = () => {
        return (
            <React.Fragment>
                <div style={{margin: '0 2px 0 4px'}}>{untranslatable('•')}</div>

                <a
                    href={this.props.channelURL}
                    onClick={this.onChannelLinkClick}
                    className='calls-channel-link'
                    style={{appRegion: 'no-drag', padding: '0', minWidth: 0} as CSSProperties}
                >
                    {isPublicChannel(this.props.channel) && <CompassIcon icon='globe'/>}
                    {isPrivateChannel(this.props.channel) && <CompassIcon icon='lock'/>}
                    {isDMChannel(this.props.channel) && <CompassIcon icon='account-outline'/>}
                    {isGMChannel(this.props.channel) && <CompassIcon icon='account-multiple-outline'/>}
                    <span
                        style={{
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            fontWeight: 600,
                            letterSpacing: '0.02em',
                        }}
                    >
                        {this.props.channelDisplayName}
                    </span>
                </a>
            </React.Fragment>
        );
    };

    render() {
        if (!this.props.channel || !window.callsClient || !this.props.show) {
            return null;
        }

        const {formatMessage} = this.props.intl;

        const noInputDevices = this.state.alerts.missingAudioInput.active;
        const noAudioPermissions = this.state.alerts.missingAudioInputPermissions.active;

        const MuteIcon = this.isMuted() && !noInputDevices && !noAudioPermissions ? MutedIcon : UnmutedIcon;

        let muteTooltipText = this.isMuted() ? formatMessage({defaultMessage: 'Unmute'}) : formatMessage({defaultMessage: 'Mute'});
        let muteTooltipSubtext = '';

        if (noInputDevices) {
            muteTooltipText = formatMessage(CallAlertConfigs.missingAudioInput.tooltipText!);
            muteTooltipSubtext = formatMessage(CallAlertConfigs.missingAudioInput.tooltipSubtext!);
        }
        if (noAudioPermissions) {
            muteTooltipText = formatMessage(CallAlertConfigs.missingAudioInputPermissions.tooltipText!);
            muteTooltipSubtext = formatMessage(CallAlertConfigs.missingAudioInputPermissions.tooltipSubtext!);
        }

        const mainStyle = {
            ...this.style.main,
            width: this.props.wider ? '306px' : '248px',
            ...(this.props.global && {appRegion: 'drag'}),
        };

        const ShowIcon = window.desktop && !this.props.global ? ExpandIcon : PopOutIcon;

        const HandIcon = this.isHandRaised() ? UnraisedHandIcon : RaisedHandIcon;

        const MenuIcon = this.props.wider ? SettingsWheelIcon : HorizontalDotsIcon;

        const handTooltipText = this.isHandRaised() ? formatMessage({defaultMessage: 'Lower hand'}) : formatMessage({defaultMessage: 'Raise hand'});

        const isHost = this.props.callHostID === this.props.currentUserID;
        const showLeaveMenuShim = !(this.state.showMenu || this.state.showParticipantsList || this.props.screenSharingSession) && this.state.leaveMenuOpen;

        return (
            <div
                id='calls-widget'
                style={mainStyle}
                ref={this.node}
            >
                <LoadingOverlay
                    visible={this.props.clientConnecting}
                    joining={this.props.global ? !this.props.startingCall : this.props.sessions.length > 0}
                />

                <div
                    ref={this.menuNode}
                    style={this.style.menu}
                >
                    {showLeaveMenuShim && <div style={this.style.leaveMenuShim}/>}
                    {this.renderIncomingCalls()}
                    {this.renderNotificationBar()}
                    {this.renderAlertBanners()}
                    {this.renderRecordingDisclaimer()}
                    {Boolean(this.state.removeConfirmation) &&
                        Boolean(this.props.sessionsMap[this.state.removeConfirmation?.sessionID || '']) &&
                        <RemoveConfirmation
                            profile={this.props.profiles[this.state.removeConfirmation?.userID || '']}
                            onConfirm={this.onRemoveConfirm}
                            onCancel={this.onRemoveCancel}
                        />
                    }
                    {this.props.allowScreenSharing && this.renderScreenSharingPanel()}
                    {this.state.showParticipantsList &&
                        <ParticipantsList
                            sessions={this.props.sessions}
                            profiles={this.props.profiles}
                            callHostID={this.props.callHostID}
                            currentSession={this.props.currentSession}
                            screenSharingSession={this.props.screenSharingSession}
                            callID={this.props.channel.id}
                            onRemove={this.onRemove}
                        />
                    }
                    {this.renderMenu()}
                </div>

                <div style={this.style.frame}>
                    <div
                        style={this.style.topBar}
                        // eslint-disable-next-line no-undefined
                        onMouseDown={this.props.global ? undefined : this.onMouseDown}
                    >
                        {this.renderSpeakingProfile()}

                        <div style={{width: this.props.wider ? '210px' : '152px'}}>
                            {this.renderSpeaking()}
                            <div style={this.style.callInfo}>
                                {this.renderRecordingBadge()}
                                <CallDuration
                                    startAt={this.props.callStartAt}
                                    style={{letterSpacing: '0.02em'}}
                                />
                                {this.renderChannelName()}
                            </div>
                        </div>

                        <WidgetButton
                            id='calls-widget-expand-button'
                            onToggle={this.onExpandClick}
                            tooltipText={formatMessage({defaultMessage: 'Open in new window'})}
                            tooltipPosition='left'
                            bgColor=''
                            icon={
                                <ShowIcon
                                    fill={'rgba(var(--center-channel-color-rgb), 0.64)'}
                                />
                            }
                        />
                    </div>

                    <div
                        className='calls-widget-bottom-bar'
                        style={this.style.bottomBar}
                    >

                        <WidgetButton
                            id='calls-widget-participants-button'
                            onToggle={this.onParticipantsButtonClick}
                            bgColor={this.state.showParticipantsList ? 'rgba(var(--button-bg-rgb), 0.08)' : ''}
                            tooltipText={this.state.showParticipantsList ? formatMessage({defaultMessage: 'Hide participants'}) : formatMessage({defaultMessage: 'Show participants'})}
                            shortcut={reverseKeyMappings.widget[PARTICIPANTS_LIST_TOGGLE][0]}
                            icon={
                                <ParticipantsIcon
                                    style={{fill: this.state.showParticipantsList ? 'var(--button-bg)' : ''}}
                                />
                            }
                            style={{marginRight: 'auto'}}
                        >
                            <span
                                style={{
                                    fontWeight: 600,
                                    fontSize: '14px',
                                    color: this.state.showParticipantsList ? 'var(--button-bg)' : '',
                                }}
                            >
                                {this.props.sessions.length}
                            </span>
                        </WidgetButton>

                        <WidgetButton
                            id='voice-mute-unmute'
                            // eslint-disable-next-line no-undefined
                            onToggle={noInputDevices ? undefined : this.onMuteToggle}
                            // eslint-disable-next-line no-undefined
                            shortcut={noInputDevices || noAudioPermissions ? undefined : reverseKeyMappings.widget[MUTE_UNMUTE][0]}
                            tooltipText={muteTooltipText}
                            tooltipSubtext={muteTooltipSubtext}
                            bgColor={this.isMuted() ? '' : 'rgba(61, 184, 135, 0.16)'}
                            icon={
                                <MuteIcon
                                    style={{
                                        fill: this.isMuted() ? '' : 'rgba(61, 184, 135, 1)',
                                    }}
                                />
                            }
                            unavailable={noInputDevices || noAudioPermissions}
                        />

                        {!isDMChannel(this.props.channel) &&
                            <WidgetButton
                                id='raise-hand'
                                onToggle={() => this.onRaiseHandToggle()}
                                shortcut={reverseKeyMappings.widget[RAISE_LOWER_HAND][0]}
                                tooltipText={handTooltipText}
                                bgColor={this.isHandRaised() ? 'rgba(var(--away-indicator-rgb), 0.16)' : ''}
                                icon={
                                    <HandIcon
                                        style={{
                                            fill: this.isHandRaised() ? 'var(--away-indicator)' : '',
                                        }}
                                    />
                                }
                            />
                        }

                        {this.props.allowScreenSharing && (this.props.wider || isDMChannel(this.props.channel)) && this.renderScreenShareButton()}

                        <WidgetButton
                            id='calls-widget-toggle-menu-button'
                            onToggle={this.onMenuClick}
                            tooltipText={formatMessage({defaultMessage: 'Settings'})}
                            icon={
                                <MenuIcon
                                    style={{
                                        fill: this.state.showMenu ? 'var(--button-bg)' : '',
                                    }}
                                />
                            }
                            bgColor={this.state.showMenu ? 'rgba(var(--button-bg-rgb), 0.08)' : ''}
                        />
                        <DotMenu
                            id='calls-widget-leave-button'
                            icon={<LeaveCallIcon style={{fill: 'white'}}/>}
                            dotMenuButton={LeaveCallButton}
                            placement={'top-start'}
                            strategy={'fixed'}
                            onOpenChange={this.onLeaveMenuOpen}
                            shortcut={reverseKeyMappings.widget[LEAVE_CALL][0]}
                            tooltipText={formatMessage({defaultMessage: 'Leave call'})}
                        >
                            <LeaveCallMenu
                                callID={this.props.channel.id}
                                isHost={isHost}
                                numParticipants={this.props.sessions.length}
                                leaveCall={this.onDisconnectClick}
                            />
                        </DotMenu>
                    </div>
                </div>
            </div>
        );
    }
}

const LeaveCallButton = styled(DotMenuButton)<{ $isActive: boolean }>`
    display: inline-flex;
    border: none;
    border-radius: 4px;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    background: var(--dnd-indicator);
    padding: 5px;
    app-region: no-drag;

    &:hover {
        background: linear-gradient(0deg, var(--error-text), var(--error-text)), linear-gradient(0deg, rgba(0, 0, 0, 0.08), rgba(0, 0, 0, 0.08));
        background-blend-mode: multiply;
    }
`;
