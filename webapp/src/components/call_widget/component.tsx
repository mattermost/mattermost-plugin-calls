// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

/* eslint-disable-file max-lines */

import './component.scss';

import {mosThreshold} from '@mattermost/calls-common';
import {UserSessionState} from '@mattermost/calls-common/lib/types';
import {Channel} from '@mattermost/types/channels';
import {Team} from '@mattermost/types/teams';
import {UserProfile} from '@mattermost/types/users';
import {IDMappedObjects} from '@mattermost/types/utilities';
import {Client4} from 'mattermost-redux/client';
import React, {CSSProperties, useEffect, useState} from 'react';
import {FormattedMessage, IntlShape} from 'react-intl';
import {compareSemVer} from 'semver-parser';
import {hostRemove} from 'src/actions';
import {navigateToURL} from 'src/browser_routing';
import {AudioInputPermissionsError, VideoInputPermissionsError} from 'src/client';
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
import VideoOffIcon from 'src/components/icons/video_off';
import VideoOnIcon from 'src/components/icons/video_on';
import {CallIncomingCondensed} from 'src/components/incoming_calls/call_incoming_condensed';
import {LeaveCallMenu} from 'src/components/leave_call_menu';
import {JoinLoadingOverlay, VideoLoadingOverlay} from 'src/components/loading_overlays';
import {
    CallAlertConfigs,
    CallRecordingDisclaimerStrings,
    CallTranscribingDisclaimerStrings,
    DEGRADED_CALL_QUALITY_ALERT_WAIT,
    STORAGE_CALLS_MIRROR_VIDEO_KEY,
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
import {
    CallAlertStates,
    CallAlertStatesDefault,
    CallJobReduxState,
    HostControlNotice,
    IncomingCallNotification,
    MediaDevices,
    RemoveConfirmationData,
} from 'src/types/types';
import {
    getPopOutURL,
    getUserDisplayName,
    isDMChannel,
    isGMChannel,
    isPrivateChannel,
    isPublicChannel,
    sendDesktopEvent,
    shareAudioWithScreen,
    untranslatable,
} from 'src/utils';
import styled, {css} from 'styled-components';

import CallDuration from './call_duration';
import JoinNotification from './join_notification';
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
    otherSessions: UserSessionState[];
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
    openCallsUserSettings: () => void;
    enableVideo: boolean,
    connectedDMUser: UserProfile | undefined,
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
    selfVideoStream: MediaStream | null,
    initializingSelfVideo: boolean,
    otherVideoStream: MediaStream | null,
    currentAudioInputDevice?: MediaDeviceInfo | null,
    currentAudioOutputDevice?: MediaDeviceInfo | null,
    currentVideoInputDevice?: MediaDeviceInfo | null,
    devices?: MediaDevices,
    videoDevices?: MediaDeviceInfo[],
    showAudioInputDevicesMenu?: boolean,
    showAudioOutputDevicesMenu?: boolean,
    showVideoInputDevicesMenu?: boolean,
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
    private widgetResizerObserver: ResizeObserver | null = null;
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
            topBarNew: {
                display: 'flex',
                padding: '8px 8px 0px 12px',
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
            videoContainer: {
                position: 'relative',
                display: 'flex',
                height: '140px',
                background: 'var(--calls-bg)',
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
            devicesMenu: {
                left: 'calc(100% + 4px)',
                overflow: 'auto',
                top: 0,
                width: '280px',
                maxHeight: '214px',
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
            selfVideoStream: null,
            otherVideoStream: null,
            initializingSelfVideo: false,
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
            this.onRaiseHandToggle();
            break;
        case SHARE_UNSHARE_SCREEN:
            this.onShareScreenToggle();
            break;
        case PARTICIPANTS_LIST_TOGGLE:
            this.onParticipantsButtonClick();
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

            this.widgetResizerObserver = new ResizeObserver(this.sendGlobalWidgetBounds);
            this.widgetResizerObserver.observe(this.node.current!);

            this.menuResizeObserver = new ResizeObserver(this.sendGlobalWidgetBounds);
            this.menuResizeObserver.observe(this.menuNode.current!);

            if (window.desktopAPI?.onScreenShared && window.desktopAPI?.onCallsError) {
                logDebug('registering desktopAPI.onScreenShared');
                this.unsubscribers.push(window.desktopAPI.onScreenShared((sourceID: string, withAudio: boolean) => {
                    logDebug('desktopAPI.onScreenShared', sourceID, withAudio);
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

        window.callsClient.on('localVideoStream', (stream: MediaStream) => {
            this.setState({
                selfVideoStream: stream,
            });
        });

        window.callsClient.on('remoteVideoStream', (stream: MediaStream) => {
            this.setState({
                otherVideoStream: stream,
            });
        });

        window.callsClient.on('devicechange', (devices: MediaDevices, videoDevices: MediaDeviceInfo[]) => {
            const state = {} as State;

            if (window.callsClient) {
                if (window.callsClient.currentAudioInputDevice !== this.state.currentAudioInputDevice) {
                    state.currentAudioInputDevice = window.callsClient.currentAudioInputDevice;
                }

                if (window.callsClient.currentAudioOutputDevice !== this.state.currentAudioOutputDevice) {
                    state.currentAudioOutputDevice = window.callsClient.currentAudioOutputDevice;
                }

                if (window.callsClient.currentVideoInputDevice !== this.state.currentVideoInputDevice) {
                    state.currentVideoInputDevice = window.callsClient.currentVideoInputDevice;
                }
            }

            this.setState({
                ...state,
                devices,
                videoDevices,
                alerts: {
                    ...this.state.alerts,
                    missingAudioInput: {
                        ...this.state.alerts.missingAudioInput,
                        active: devices.inputs.length === 0,
                        show: devices.inputs.length === 0,
                    },
                    missingVideoInput: {
                        ...this.state.alerts.missingVideoInput,
                        active: this.props.enableVideo && videoDevices.length === 0,
                        show: this.props.enableVideo && videoDevices.length === 0,
                    },
                },
            });
        });

        window.callsClient.on('devicefallback', (device: MediaDeviceInfo) => {
            if (device.kind === 'audioinput') {
                this.setState({
                    alerts: {
                        ...this.state.alerts,
                        audioInputDeviceFallback: {
                            active: true,
                            show: true,
                            args: {
                                deviceLabel: device.label,
                                i: (text: string) => <i>{text}</i>,
                            },
                        },
                    },
                });
            } else if (device.kind === 'audiooutput') {
                this.setState({
                    alerts: {
                        ...this.state.alerts,
                        audioOutputDeviceFallback: {
                            active: true,
                            show: true,
                            args: {
                                deviceLabel: device.label,
                                i: (text: string) => <i>{text}</i>,
                            },
                        },
                    },
                });
            }
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
            this.setState({currentVideoInputDevice: callsClient?.currentVideoInputDevice});
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
            } else if (err === VideoInputPermissionsError) {
                this.setState({
                    alerts: {
                        ...this.state.alerts,
                        missingVideoInputPermissions: {
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

        window.callsClient.on('initvideo', () => {
            this.setState({
                alerts: {
                    ...this.state.alerts,
                    missingVideoInputPermissions: {
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

        if (this.widgetResizerObserver) {
            this.widgetResizerObserver.disconnect();
        }

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
            // Check for the loading overlay which is the first child, when it renders.
            const widgetMenu = widget.children.length === 2 ? widget.children[0] : widget.children[1];
            const baseWidget = widget.children.length === 2 ? widget.children[1] : widget.children[2];

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

    private shareScreen = async (sourceID: string, withAudio: boolean) => {
        logDebug(`CallWidget.shareScreen called with sourceID: ${sourceID}, withAudio: ${withAudio}`);
        const stream = await window.callsClient?.shareScreen(sourceID, withAudio);
        if (stream) {
            logDebug(`CallWidget.shareScreen: stream received with ${stream.getVideoTracks().length} video tracks and ${stream.getAudioTracks().length} audio tracks`);
            this.setState({screenStream: stream});
            this.setMissingScreenPermissions(false, true);
        } else {
            logDebug('CallWidget.shareScreen: no stream received');
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
        } else {
            await this.props.startCallRecording(this.props.channel.id);
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

    onCallsSettingsButtonClick = () => {
        if (this.props.global && window.desktopAPI?.openCallsUserSettings) {
            logDebug('desktopAPI.openCallsUserSettings');
            window.desktopAPI.openCallsUserSettings();
        } else {
            this.props.openCallsUserSettings();
        }

        this.setState({showMenu: false});
    };

    onShareScreenToggle = async () => {
        if (!this.props.allowScreenSharing) {
            return;
        }
        const state = {} as State;

        if (this.props.screenSharingSession?.session_id === this.props.currentSession?.session_id) {
            logDebug('CallWidget.onShareScreenToggle: stopping screen share (user toggled off)');
            window.callsClient?.unshareScreen();
            state.screenStream = null;
        } else if (!this.props.screenSharingSession) {
            logDebug('CallWidget.onShareScreenToggle: starting screen share (user toggled on)');

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
                await this.shareScreen('', shareAudioWithScreen());
            }
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
            logDebug('CallWidget.onMicrophoneButtonClick: unmuting (user toggled on)');
            window.callsClient.unmute();
        } else {
            logDebug('CallWidget.onMicrophoneButtonClick: muting (user toggled off)');
            window.callsClient.mute();
        }
    };

    isMuted() {
        return this.props.currentSession ? !this.props.currentSession.unmuted : true;
    }

    onVideoToggle = async () => {
        if (!window.callsClient) {
            return;
        }

        if (this.isVideoOn()) {
            logDebug('CallWidget.onVideoToggle: stopping video (user toggled off)');
            window.callsClient.stopVideo();
            this.setState({
                selfVideoStream: null,
            });
        } else {
            logDebug('CallWidget.onVideoToggle: starting video (user toggled on)');
            this.setState({
                initializingSelfVideo: true,
            });

            const selfVideoStream = await window.callsClient.startVideo();

            this.setState({
                selfVideoStream,
                initializingSelfVideo: false,
            });
        }
    };

    isVideoOn() {
        return this.props.currentSession ? Boolean(this.props.currentSession.video) : false;
    }

    isHandRaised() {
        return this.props.currentSession ? this.props.currentSession.raised_hand > 0 : false;
    }

    onDisconnectClick = () => {
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
        if (this.state.expandedViewWindow) {
            this.state.expandedViewWindow.close();
        }
        if (window.callsClient) {
            window.callsClient.disconnect();
        }
    };

    onMenuClick = () => {
        this.setState({
            showMenu: !this.state.showMenu,
            showParticipantsList: false,
        });
    };

    onParticipantsButtonClick = () => {
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
            logDebug('CallWidget.onAudioInputDeviceClick: changing audio input device', device.label, device.deviceId);
            window.callsClient?.setAudioInputDevice(device);
        }
        this.setState({showAudioInputDevicesMenu: false, currentAudioInputDevice: device});
    };

    onVideoInputDeviceClick = (device: MediaDeviceInfo) => {
        if (device.deviceId !== this.state.currentVideoInputDevice?.deviceId) {
            logDebug('CallWidget.onVideoInputDeviceClick: changing video input device', device.label, device.deviceId);
            window.callsClient?.setVideoInputDevice(device);
        }
        this.setState({showVideoInputDevicesMenu: false, currentVideoInputDevice: device});
    };

    onAudioOutputDeviceClick = (device: MediaDeviceInfo) => {
        if (device.deviceId !== this.state.currentAudioOutputDevice?.deviceId) {
            logDebug('CallWidget.onAudioOutputDeviceClick: changing audio output device', device.label, device.deviceId);
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
                ariaLabel={shareScreenTooltipText}
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

    devicesMenuRefCb = (el: HTMLUListElement) => {
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

    renderDevicesList = (deviceType: string, devices: MediaDeviceInfo[]) => {
        const {formatMessage} = this.props.intl;

        if (deviceType === 'audioinput' && !this.state.showAudioInputDevicesMenu) {
            return null;
        }

        if (deviceType === 'audiooutput' && !this.state.showAudioOutputDevicesMenu) {
            return null;
        }

        if (deviceType === 'videoinput' && !this.state.showVideoInputDevicesMenu) {
            return null;
        }

        let currentDevice = deviceType === 'audioinput' ? this.state.currentAudioInputDevice : this.state.currentAudioOutputDevice;
        if (deviceType === 'videoinput') {
            currentDevice = this.state.currentVideoInputDevice;
        }

        // Note: this is system default, not the concept of default that we save in local storage in client.ts
        const makeDeviceLabel = (device: MediaDeviceInfo) => {
            if (device.deviceId.startsWith('default') && !device.label.startsWith('Default')) {
                return formatMessage({defaultMessage: 'Default - {deviceLabel}'}, {deviceLabel: device.label});
            }
            return device.label;
        };

        let onClickHandler = deviceType === 'audioinput' ? this.onAudioInputDeviceClick : this.onAudioOutputDeviceClick;
        if (deviceType === 'videoinput') {
            onClickHandler = this.onVideoInputDeviceClick;
        }

        const deviceList = devices.map((device) => {
            return (
                <li
                    className='MenuItem'
                    key={`${deviceType}-device-${device.deviceId}`}
                    role='menuitem'
                    aria-label={makeDeviceLabel(device)}
                >
                    <button
                        className='style--none'
                        style={{
                            background: device.deviceId === currentDevice?.deviceId || device.label === currentDevice?.label ? 'rgba(28, 88, 217, 0.08)' : '',
                            lineHeight: '20px',
                            padding: '8px 20px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                        }}
                        onClick={() => onClickHandler(device)}
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
            <div
                className='Menu'
                style={{position: 'relative'}}
            >
                <ul
                    id={`calls-widget-${deviceType}s-menu`}
                    className='Menu__content dropdown-menu'
                    style={this.style.devicesMenu}
                    // eslint-disable-next-line no-undefined
                    ref={this.props.global ? this.devicesMenuRefCb : undefined}
                    role='menu'
                >
                    {deviceList}
                </ul>
            </div>
        );
    };

    renderDevices = (deviceType: string) => {
        if (!window.callsClient || !this.state.devices) {
            return null;
        }
        if (deviceType === 'audiooutput' && this.state.devices.outputs.length === 0) {
            return null;
        }

        const {formatMessage} = this.props.intl;

        let currentDevice = deviceType === 'audioinput' ? this.state.currentAudioInputDevice : this.state.currentAudioOutputDevice;
        if (deviceType === 'videoinput') {
            currentDevice = this.state.currentVideoInputDevice;
        }

        let DeviceIcon = deviceType === 'audioinput' ? UnmutedIcon : SpeakerIcon;
        if (deviceType === 'videoinput') {
            DeviceIcon = VideoOnIcon;
        }

        const noInputDevices = (deviceType === 'audioinput' && this.state.devices.inputs?.length === 0) || (deviceType === 'videoinput' && this.state.videoDevices?.length === 0);
        const noInputPermissions = (deviceType === 'audioinput' && this.state.alerts.missingAudioInputPermissions.active) ||
      (deviceType === 'videoinput' && this.state.alerts.missingVideoInputPermissions.active);

        let label = currentDevice?.label || formatMessage({defaultMessage: 'Default'});
        if (noInputPermissions) {
            label = deviceType === 'audioinput' ? formatMessage(CallAlertConfigs.missingAudioInputPermissions.tooltipText!) : formatMessage(CallAlertConfigs.missingVideoInputPermissions.tooltipText!);
        } else if (noInputDevices) {
            label = deviceType === 'audioinput' ? formatMessage(CallAlertConfigs.missingAudioInput.tooltipText!) : formatMessage(CallAlertConfigs.missingVideoInput.tooltipText!);
        }

        const onClickHandler = () => {
            if (deviceType === 'audioinput') {
                this.setState({
                    showAudioInputDevicesMenu: !this.state.showAudioInputDevicesMenu,
                    showAudioOutputDevicesMenu: false,
                    showVideoInputDevicesMenu: false,
                });
            } else if (deviceType === 'audiooutput') {
                this.setState({
                    showAudioOutputDevicesMenu: !this.state.showAudioOutputDevicesMenu,
                    showAudioInputDevicesMenu: false,
                    showVideoInputDevicesMenu: false,
                });
            } else {
                this.setState({
                    showVideoInputDevicesMenu: !this.state.showVideoInputDevicesMenu,
                    showAudioInputDevicesMenu: false,
                    showAudioOutputDevicesMenu: false,
                });
            }
        };

        let devices = deviceType === 'audioinput' ? this.state.devices.inputs?.filter((device) => device.deviceId && device.label) :
            this.state.devices.outputs?.filter((device) => device.deviceId && device.label);
        if (deviceType === 'videoinput' && this.state.videoDevices) {
            devices = this.state.videoDevices.filter((device) => device.deviceId && device.label);
        }

        const isDisabled = devices.length === 0;

        const buttonStyle: CSSProperties = {
            display: 'flex',
            alignItems: 'start',
            padding: '6px 16px',
            color: isDisabled ? 'rgba(var(--center-channel-color-rgb), 0.32)' : '',
        };

        let showSubMenu = false;
        if ((deviceType === 'audioinput' && this.state.showAudioInputDevicesMenu) ||
      (deviceType === 'audiooutput' && this.state.showAudioOutputDevicesMenu) ||
      (deviceType === 'videoinput' && this.state.showVideoInputDevicesMenu)) {
            buttonStyle.background = 'rgba(var(--center-channel-color-rgb), 0.08)';
            showSubMenu = devices.length > 0;
        }

        let deviceTypeLabel = deviceType === 'audioinput' ?
            formatMessage({defaultMessage: 'Microphone'}) : formatMessage({defaultMessage: 'Audio output'});
        if (deviceType === 'videoinput') {
            deviceTypeLabel = formatMessage({defaultMessage: 'Camera'});
        }

        return (
            <React.Fragment>
                {devices.length > 0 && this.renderDevicesList(deviceType, devices)}
                <li
                    className='MenuItem'
                    role='menuitem'
                    aria-label={deviceTypeLabel}
                >
                    <button
                        id={`calls-widget-${deviceType}-button`}
                        aria-controls={`calls-widget-${deviceType}s-menu`}
                        aria-expanded={showSubMenu}
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
                                {deviceTypeLabel}
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

    renderAdditionalSettingsMenuItem = () => {
        const {formatMessage} = this.props.intl;

        // We should show this only if we have the matching functionality available.
        if (this.props.global && !window.desktopAPI?.openCallsUserSettings) {
            return null;
        } else if (!this.props.global && !window.WebappUtils.openUserSettings) {
            return null;
        }

        const label = formatMessage({defaultMessage: 'Additional settings'});

        return (
            <>
                <li
                    className='MenuItem'
                    role='menuitem'
                    aria-label={label}
                >
                    <button
                        id='calls-widget-menu-additional-settings-button'
                        className='style--none'
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                        }}
                        onClick={() => this.onCallsSettingsButtonClick()}
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
                            <SettingsWheelIcon
                                style={{width: '16px', height: '16px'}}
                                fill={'rgba(var(--center-channel-color-rgb), 0.64)'}
                            />
                            <span>{label}</span>
                        </div>

                    </button>
                </li>
            </>
        );
    };

    renderChatThreadMenuItem = () => {
        const {formatMessage} = this.props.intl;

        // If we are on global widget we should show this
        // only if we have the matching functionality available.
        if (this.props.global && !window.desktopAPI?.openThreadForCalls) {
            return null;
        }

        const showChatThreadLabel = formatMessage({defaultMessage: 'Show chat thread'});

        return (
            <>
                <li
                    className='MenuItem'
                    role='menuitem'
                    aria-label={showChatThreadLabel}
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
                            <span>{showChatThreadLabel}</span>
                        </div>

                    </button>
                </li>
            </>
        );
    };

    renderRecordingMenuItem = () => {
        const {formatMessage} = this.props.intl;

        const RecordIcon = this.props.isRecording ? RecordSquareIcon : RecordCircleIcon;

        const recordingActionLabel = this.props.isRecording ? formatMessage({defaultMessage: 'Stop recording'}) :
            formatMessage({defaultMessage: 'Record call'});

        return (
            <React.Fragment>
                <li
                    className='MenuItem'
                    role='menuitem'
                    aria-label={recordingActionLabel}
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
                            <span>{recordingActionLabel}</span>
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
        const screenSharingActionLabel = isSharing ? formatMessage({defaultMessage: 'Stop presenting'}) :
            formatMessage({defaultMessage: 'Start presenting'});

        return (
            <React.Fragment>
                <li
                    className='MenuItem'
                    role='menuitem'
                    aria-label={screenSharingActionLabel}
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
                            <span>{screenSharingActionLabel}</span>
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
        const {formatMessage} = this.props.intl;

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
                id='calls-widget-settings-menu'
                role='menu'
                aria-label={formatMessage({defaultMessage: 'Settings menu'})}
                data-testid='calls-widget-menu'
            >
                <ul
                    className='Menu__content dropdown-menu'
                    style={this.style.settingsMenu}
                    role='menu'
                >
                    {this.renderDevices('audiooutput')}
                    {this.renderDevices('audioinput')}
                    {this.props.enableVideo && this.renderDevices('videoinput')}
                    { divider }
                    {showScreenShareItem && this.renderScreenSharingMenuItem()}
                    {showScreenShareItem && divider}
                    {this.props.recordingsEnabled && isHost && this.renderRecordingMenuItem()}
                    {this.renderChatThreadMenuItem()}
                    {this.renderAdditionalSettingsMenuItem()}
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
                    header={formatMessage(alertConfig.bannerText, alertState.args)}
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

    onRaiseHandToggle = () => {
        if (!window.callsClient) {
            return;
        }

        // This is needed to prevent a conflict with the accessibility controller on buttons.
        if (document.activeElement instanceof HTMLElement) {
            document.activeElement.blur();
        }

        if (this.isHandRaised()) {
            window.callsClient.unraiseHand();
        } else {
            window.callsClient.raiseHand();
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

    renderTopBar = () => {
        const {formatMessage} = this.props.intl;
        const openPopOutLabel = formatMessage({defaultMessage: 'Open in new window'});
        const ShowIcon = window.desktop && !this.props.global ? ExpandIcon : PopOutIcon;

        const channelLink = (
            <React.Fragment>
                <a
                    href={this.props.channelURL}
                    onClick={this.onChannelLinkClick}
                    className='calls-channel-link'
                    style={{appRegion: 'no-drag', padding: '0', minWidth: 0, fontSize: '16px'} as CSSProperties}
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
                            fontSize: '12px',
                        }}
                    >
                        {this.props.channelDisplayName}
                    </span>
                </a>
            </React.Fragment>
        );

        return (
            <div
                style={this.style.topBarNew}
                // eslint-disable-next-line no-undefined
                onMouseDown={this.props.global ? undefined : this.onMouseDown}
            >
                {/* <div style={{width: this.props.wider ? '210px' : '152px'}}> */}
                {/*     {this.renderSpeaking()} */}
                {/*     <div style={this.style.callInfo}> */}
                {/*         {this.renderRecordingBadge()} */}
                {/*         <CallDuration */}
                {/*             startAt={this.props.callStartAt} */}
                {/*             style={{letterSpacing: '0.02em'}} */}
                {/*         /> */}
                {/*         {this.renderChannelName()} */}
                {/*     </div> */}
                {/* </div> */}

                {/* TODO: add recording badge */}
                <div
                    style={{
                        marginRight: 'auto',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        lineHeight: '16px',
                    }}
                >
                    {channelLink}

                    <div style={{fontSize: '10px', color: 'var(--center-channel-color-64, rgba(63, 67, 80, 0.64))'}}>{untranslatable('•')}</div>

                    <CallDuration
                        startAt={this.props.callStartAt}
                        style={{
                            letterSpacing: '0.02em',
                            color: 'var(--center-channel-color-64, rgba(63, 67, 80, 0.64))',
                            fontSize: '11px',
                        }}
                    />
                </div>

                <WidgetButton
                    id='calls-widget-expand-button'
                    ariaLabel={openPopOutLabel}
                    onToggle={this.onExpandClick}
                    tooltipText={openPopOutLabel}
                    tooltipPosition='left'
                    bgColor=''
                    icon={
                        <ShowIcon
                            fill={'rgba(var(--center-channel-color-rgb), 0.64)'}
                        />
                    }
                />
            </div>
        );
    };

    renderVideoContainer = () => {
        // Here we are assuming this only renders in a DM which is the case
        // right now.
        const selfProfile = this.props.profiles[this.props.currentUserID];
        const otherProfile = this.props.connectedDMUser;
        const otherSession = this.props.otherSessions.find((s) => s.video);

        return (
            <div
                className='calls-widget-video-container'
                style={this.style.videoContainer}
            >
                { selfProfile && this.props.currentSession &&
                    <CallsDMVideoPlayer
                        stream={this.state.selfVideoStream}
                        profile={selfProfile}
                        hasVideo={Boolean(this.props.currentSession?.video) || this.state.initializingSelfVideo}
                        selfView={true}
                        selfOnly={this.props.otherSessions.length === 0}
                    />
                }
                { otherProfile && this.props.otherSessions.length !== 0 &&
                    <CallsDMVideoPlayer
                        stream={this.state.otherVideoStream}
                        profile={otherProfile}
                        hasVideo={Boolean(otherSession?.video)}
                        selfView={false}
                    />
                }
            </div>
        );
    };

    renderProfiles = () => {
        // Here we are assuming this only renders in a DM which is the case
        // right now.
        const selfProfile = this.props.profiles[this.props.currentUserID];
        const otherProfile = this.props.connectedDMUser;
        const otherSession = this.props.otherSessions[0];
        const selfSession = this.props.currentSession;
        const videoView = (otherSession?.video || selfSession?.video) ?? false;
        const selfOnly = this.props.otherSessions.length === 0;

        return (
            <div
                className='calls-widget-profiles'
                style={{
                    display: 'flex',
                    gap: '8px',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '100%',
                }}
            >

                { otherProfile && otherSession &&
                <CallsWidgetProfile
                    videoStream={this.state.otherVideoStream}
                    profile={otherProfile}
                    isSpeaking={Boolean(otherSession.voice)}
                    isMuted={!otherSession.unmuted}
                    hasVideo={Boolean(otherSession.video)}
                    videoView={videoView}
                    mirrorVideo={false}
                />
                }

                { selfProfile && selfSession &&
                <CallsWidgetProfile
                    videoStream={this.state.selfVideoStream}
                    profile={selfProfile}
                    isSpeaking={Boolean(selfSession.voice)}
                    isMuted={!selfSession.unmuted}
                    hasVideo={Boolean(selfSession.video)}
                    videoView={videoView}
                    mirrorVideo={localStorage.getItem(STORAGE_CALLS_MIRROR_VIDEO_KEY) === 'true'}
                    singleSession={selfOnly}
                />
                }
            </div>
        );
    };

    renderMiddleBar = () => {
        return (
            <div
                style={{
                    display: 'flex',
                    padding: '8px',
                    alignItems: 'center',
                    justifyContent: 'center',
                }}
                data-testid={'calls-widget-middle-bar'}
            >
                {this.renderProfiles()}
            </div>
        );
    };

    render() {
        if (!this.props.channel || !window.callsClient || !this.props.show) {
            return null;
        }

        const {formatMessage} = this.props.intl;

        const noInputDevices = this.state.alerts.missingAudioInput.active;
        const noAudioPermissions = this.state.alerts.missingAudioInputPermissions.active;
        const noVideoPermissions = this.state.alerts.missingVideoInputPermissions.active;
        const noVideoInputDevices = this.state.alerts.missingVideoInput.active;

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

        const MenuIcon = HorizontalDotsIcon;

        const VideoIcon = this.isVideoOn() || noVideoInputDevices || noVideoPermissions ? VideoOnIcon : VideoOffIcon;
        let videoTooltipText = this.isVideoOn() ? formatMessage({defaultMessage: 'Turn camera off'}) : formatMessage({defaultMessage: 'Turn camera on'});
        let videoTooltipSubtext = '';

        if (noVideoInputDevices) {
            videoTooltipText = formatMessage(CallAlertConfigs.missingVideoInput.tooltipText!);
            videoTooltipSubtext = formatMessage(CallAlertConfigs.missingVideoInput.tooltipSubtext!);
        }
        if (noVideoPermissions) {
            videoTooltipText = formatMessage(CallAlertConfigs.missingVideoInputPermissions.tooltipText!);
            videoTooltipSubtext = formatMessage(CallAlertConfigs.missingVideoInputPermissions.tooltipSubtext!);
        }

        const handTooltipText = this.isHandRaised() ? formatMessage({defaultMessage: 'Lower hand'}) : formatMessage({defaultMessage: 'Raise hand'});

        const isHost = this.props.callHostID === this.props.currentUserID;
        const showLeaveMenuShim = !(this.state.showMenu || this.state.showParticipantsList || this.props.screenSharingSession) && this.state.leaveMenuOpen;

        const openPopOutLabel = formatMessage({defaultMessage: 'Open in new window'});
        const showParticipantsListLabel = this.state.showParticipantsList ?
            formatMessage({defaultMessage: 'Hide participants'}) : formatMessage({defaultMessage: 'Show participants'});
        const settingsButtonLabel = formatMessage({defaultMessage: 'More options'});
        const leaveMenuLabel = formatMessage({defaultMessage: 'Leave call'});

        // const shouldRenderVideoContainer = this.props.currentSession?.video || this.state.initializingSelfVideo || this.props.otherSessions.some((s) => s.video);

        return (
            <div
                id='calls-widget'
                style={mainStyle}
                ref={this.node}
            >
                <JoinLoadingOverlay
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

                    {!this.props.enableVideo &&
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
                                ariaLabel={openPopOutLabel}
                                onToggle={this.onExpandClick}
                                tooltipText={openPopOutLabel}
                                tooltipPosition='left'
                                bgColor=''
                                icon={
                                    <ShowIcon
                                        fill={'rgba(var(--center-channel-color-rgb), 0.64)'}
                                    />
                                }
                            />
                        </div>
                    }

                    {this.props.enableVideo && this.renderTopBar() }

                    {/* {shouldRenderVideoContainer && this.renderVideoContainer()} */}

                    {this.props.enableVideo && this.renderMiddleBar() }

                    <div
                        className='calls-widget-bottom-bar'
                        style={this.style.bottomBar}
                    >

                        <WidgetButton
                            id='calls-widget-participants-button'
                            ariaLabel={showParticipantsListLabel}
                            ariaControls='calls-widget-participants-menu'
                            ariaExpanded={this.state.showParticipantsList}
                            onToggle={this.onParticipantsButtonClick}
                            bgColor={this.state.showParticipantsList ? 'rgba(var(--button-bg-rgb), 0.08)' : ''}
                            tooltipText={showParticipantsListLabel}
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
                            ariaLabel={muteTooltipText}
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

                        {this.props.enableVideo &&
                            <WidgetButton
                                id='video-start-stop'
                                // eslint-disable-next-line no-undefined
                                onToggle={noVideoInputDevices ? undefined : this.onVideoToggle}
                                ariaLabel={videoTooltipText}

                                //shortcut={} TODO: add shortcut
                                tooltipText={videoTooltipText}
                                tooltipSubtext={videoTooltipSubtext}
                                bgColor={this.isVideoOn() ? 'rgba(61, 184, 135, 0.16)' : ''}
                                icon={
                                    <VideoIcon
                                        style={{
                                            fill: this.isVideoOn() ? 'rgba(61, 184, 135, 1)' : '',
                                        }}
                                    />
                                }
                                unavailable={noVideoInputDevices || noVideoPermissions}
                            />
                        }

                        {!isDMChannel(this.props.channel) &&
                            <WidgetButton
                                id='raise-hand'
                                ariaLabel={handTooltipText}
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
                            ariaLabel={settingsButtonLabel}
                            ariaControls='calls-widget-settings-menu'
                            ariaExpanded={this.state.showMenu}
                            onToggle={this.onMenuClick}
                            tooltipText={settingsButtonLabel}
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
                            ariaLabel={leaveMenuLabel}
                            dotMenuButton={LeaveCallButton}
                            placement={'top-start'}
                            strategy={'fixed'}
                            onOpenChange={this.onLeaveMenuOpen}
                            shortcut={reverseKeyMappings.widget[LEAVE_CALL][0]}
                            tooltipText={leaveMenuLabel}
                        >
                            <LeaveCallMenu
                                channelID={this.props.channel.id}
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
    width: 28px;
    height: 28px;

    &:hover {
        background: linear-gradient(0deg, var(--error-text), var(--error-text)), linear-gradient(0deg, rgba(0, 0, 0, 0.08), rgba(0, 0, 0, 0.08));
        background-blend-mode: multiply;
    }
`;

const VideoPlayerContainer = styled.div<{$selfView: boolean, $hasVideo: boolean, $selfOnly?: boolean}>`
  ${({$selfView}) => !$selfView && css`
      width: 100%;
      z-index: 0;
      display: flex;
      justify-content: center;
      align-items: center;
  `}

  ${({$selfView}) => $selfView && css`
      width: 60px;
      height: 60px;
      border-radius: 8px;
      display: flex;
      justify-content: center;
      align-items: center;
      position: absolute;
      left: 4px;
      top: 4px;
      z-index: 1;
  `}

  ${({$selfOnly}) => $selfOnly && css`
      width: 100%;
      height: 100%;
      top: 0;
      left: 0;
  `}

  ${({$hasVideo}) => !$hasVideo && css`
      background: var(--calls-bg);
      border: 1px solid rgba(var(--center-channel-color-rgb), 0.8);
  `}
`;

const VideoPlayer = styled.video<{$selfView: boolean, $mirror?: boolean, $selfOnly?: boolean}>`
   width: 100%;
   height: 100%;
   object-fit: cover;

  ${({$selfView, $mirror}) => $selfView && $mirror && css`
    transform: scaleX(-1);
  `}

  ${({$selfView, $selfOnly}) => $selfView && !$selfOnly && css`
    border-radius: 8px;
    box-shadow: rgba(0, 0, 0, 0.25) 0px 54px 55px, rgba(0, 0, 0, 0.12) 0px -12px 30px, rgba(0, 0, 0, 0.12) 0px 4px 6px, rgba(0, 0, 0, 0.17) 0px 12px 13px, rgba(0, 0, 0, 0.09) 0px -3px 5px;
  `}
`;

type CallsDMVideoPlayerProps = {
    stream: MediaStream | null;
    profile: UserProfile;
    hasVideo: boolean;
    selfView: boolean;
    selfOnly?: boolean;
};

const CallsDMVideoPlayer = (props: CallsDMVideoPlayerProps) => {
    const [isLoading, setIsLoading] = useState(true);
    const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);

    const videoElRefCb = (el: HTMLVideoElement | null) => {
        if (el) {
            setVideoEl(el);
        }
    };

    useEffect(() => {
        if (videoEl && props.stream) {
            videoEl.srcObject = props.stream;
        }

        if (!props.hasVideo) {
            setIsLoading(true);
        }
    }, [props.stream, isLoading, videoEl, props.hasVideo]);

    if (props.hasVideo) {
        return (
            <VideoPlayerContainer
                $selfView={props.selfView}
                $hasVideo={props.hasVideo}
                $selfOnly={props.selfOnly}
            >
                <VideoLoadingOverlay
                    visible={isLoading}
                    spinnerSize={props.selfView && !props.selfOnly ? 8 : 16}
                />
                <VideoPlayer
                    ref={videoElRefCb}
                    data-testid={`calls-widget-video-player-${props.selfView ? 'self' : 'other'}`}
                    onLoadedMetadata={() => setIsLoading(false)}
                    autoPlay={true}
                    muted={true}
                    $selfView={props.selfView}
                    $selfOnly={props.selfOnly}
                    $mirror={props.selfView && localStorage.getItem(STORAGE_CALLS_MIRROR_VIDEO_KEY) === 'true'}
                />
            </VideoPlayerContainer>
        );
    }
    return (
        <VideoPlayerContainer
            $selfView={props.selfView}
            $hasVideo={props.hasVideo}
            data-testid={`calls-widget-video-placeholder-${props.selfView ? 'self' : 'other'}`}
        >
            <Avatar
                size={props.selfView ? 36 : 96}
                border={false}
                url={Client4.getProfilePictureUrl(props.profile.id, props.profile.last_picture_update)}
            />
        </VideoPlayerContainer>
    );
};

const WidgetProfileContainer = styled.div<{$videoView: boolean, $singleSession?: boolean}>`
  display: flex;
  position: relative;
  justify-content: center;
  align-items: center;
  background: #E4EBFA;
  border-radius: 4px;
  flex: 1;

  ${({$videoView, $singleSession}) => $videoView && !$singleSession && css`
    aspect-ratio: 1;
  `}

  ${({$videoView}) => !$videoView && css`
      height: 75px;
  `}
`;

const MuteState = styled.div<{ $isMuted: boolean }>`
  position: absolute;
  bottom: 4px;
  left: 4px;
  border-radius: 20px;
  background: #14213E;
  width: 20px;
  height: 20px;
  border-radius: 20px;
  display: flex;
  justify-content: center;
  align-items: center;
`;

const WidgetProfileVideoPlayer = styled.video<{$mirror: boolean}>`
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 4px;

  ${({$mirror}) => $mirror && css`
    transform: scaleX(-1);
  `}
`;

type CallsWidgetProfileProps = {
    profile: UserProfile;
    isSpeaking: boolean;
    isMuted: boolean;
    videoStream: MediaStream | null;
    hasVideo: boolean;
    videoView: boolean;
    mirrorVideo: boolean;
    singleSession?: boolean;
}

const CallsWidgetProfile = (props: CallsWidgetProfileProps) => {
    const MuteIcon = props.isMuted ? MutedIcon : UnmutedIcon;

    const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
    const videoElRefCb = (el: HTMLVideoElement | null) => {
        if (el) {
            setVideoEl(el);
        }
    };

    useEffect(() => {
        if (videoEl && props.videoStream) {
            videoEl.srcObject = props.videoStream;
        }
    }, [props.videoStream, videoEl]);

    return (
        <WidgetProfileContainer
            $videoView={props.videoView}
            $singleSession={props.singleSession}
        >

            {!props.hasVideo &&
            <Avatar
                size={40}
                border={false}
                url={Client4.getProfilePictureUrl(props.profile.id, props.profile.last_picture_update)}
                borderGlowWidth={props.isSpeaking ? 3 : 0}
                borderGlowColor='white'
            />
            }

            {props.hasVideo &&
            <WidgetProfileVideoPlayer
                ref={videoElRefCb}
                autoPlay={true}
                muted={true}
                $mirror={props.mirrorVideo}
            />
            }

            {props.isMuted &&
            <MuteState $isMuted={props.isMuted}>
                <MuteIcon
                    style={{
                        fill: props.isMuted ? 'white' : 'rgba(61, 184, 135, 1)',
                        height: '12px',
                    }}
                />
            </MuteState>
            }
        </WidgetProfileContainer>
    );
};
