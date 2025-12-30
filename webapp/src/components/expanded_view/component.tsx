// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

/* eslint-disable-file max-lines */

import {mosThreshold} from '@mattermost/calls-common';
import {UserSessionState} from '@mattermost/calls-common/lib/types';
import {Channel} from '@mattermost/types/channels';
import {Post} from '@mattermost/types/posts';
import {Team} from '@mattermost/types/teams';
import {UserProfile} from '@mattermost/types/users';
import {IDMappedObjects} from '@mattermost/types/utilities';
import {Client4} from 'mattermost-redux/client';
import {Theme} from 'mattermost-redux/selectors/entities/preferences';
import {MediaControlBar, MediaController, MediaFullscreenButton} from 'media-chrome/dist/react';
import React, {useEffect, useState} from 'react';
import {OverlayTrigger, Tooltip} from 'react-bootstrap';
import {IntlShape} from 'react-intl';
import {RouteComponentProps} from 'react-router-dom';
import {hostMuteOthers, hostRemove} from 'src/actions';
import Avatar from 'src/components/avatar/avatar';
import {Badge} from 'src/components/badge';
import CallDuration from 'src/components/call_widget/call_duration';
import DotMenu, {DotMenuButton, DropdownMenu} from 'src/components/dot_menu/dot_menu';
import CallParticipantRHS from 'src/components/expanded_view/call_participant_rhs';
import {LiveCaptionsStream} from 'src/components/expanded_view/live_captions_stream';
import {
    IDStopRecordingConfirmation,
    StopRecordingConfirmation,
} from 'src/components/expanded_view/stop_recording_confirmation';
import ChatThreadIcon from 'src/components/icons/chat_thread';
import CollapseIcon from 'src/components/icons/collapse';
import CompassIcon from 'src/components/icons/compassIcon';
import GridViewIcon from 'src/components/icons/grid_view';
import LeaveCallIcon from 'src/components/icons/leave_call_icon';
import MutedIcon from 'src/components/icons/muted_icon';
import ParticipantsIcon from 'src/components/icons/participants';
import RecordCircleIcon from 'src/components/icons/record_circle';
import RecordSquareIcon from 'src/components/icons/record_square';
import ScreenIcon from 'src/components/icons/screen_icon';
import ShareScreenIcon from 'src/components/icons/share_screen';
import SpeakerViewIcon from 'src/components/icons/speaker_view';
import UnmutedIcon from 'src/components/icons/unmuted_icon';
import UnshareScreenIcon from 'src/components/icons/unshare_screen';
import VideoOffIcon from 'src/components/icons/video_off';
import VideoOnIcon from 'src/components/icons/video_on';
import {ExpandedIncomingCallContainer} from 'src/components/incoming_calls/expanded_incoming_call_container';
import {LeaveCallMenu} from 'src/components/leave_call_menu';
import {ReactionStream} from 'src/components/reaction_stream/reaction_stream';
import {CallAlertConfigs, DEGRADED_CALL_QUALITY_ALERT_WAIT, STORAGE_CALLS_MIRROR_VIDEO_KEY} from 'src/constants';
import {logDebug, logErr} from 'src/log';
import {
    keyToAction,
    LEAVE_CALL,
    MAKE_REACTION,
    MUTE_UNMUTE,
    PARTICIPANTS_LIST_TOGGLE,
    PUSH_TO_TALK,
    RAISE_LOWER_HAND,
    RECORDING_TOGGLE,
    reverseKeyMappings,
    SHARE_UNSHARE_SCREEN,
} from 'src/shortcuts';
import {ModalData} from 'src/types/mattermost-webapp';
import {
    CallAlertStates,
    CallAlertStatesDefault,
    CallJobReduxState,
    MediaDevices,
    RemoveConfirmationData,
} from 'src/types/types';
import {
    getCallsClient,
    getScreenStream,
    getUserDisplayName,
    isDMChannel,
    sendDesktopEvent,
    setCallsGlobalCSSVars,
    shareAudioWithScreen,
    untranslatable,
} from 'src/utils';
import styled, {createGlobalStyle, css} from 'styled-components';

import {CallSettingsButton} from './call_settings';
import ControlsButton, {CallThreadIcon, MentionsCounter, UnreadDot} from './controls_button';
import GlobalBanner from './global_banner';
import ParticipantsGrid from './participants_grid';
import {ReactionButton, ReactionButtonRef} from './reaction_button';
import RecordingInfoPrompt from './recording_info_prompt';
import {RemoveConfirmation} from './remove_confirmation';

interface Props extends RouteComponentProps {
    intl: IntlShape,
    theme: Theme,
    show: boolean,
    currentUserID: string,
    currentTeamID: string,
    profiles: IDMappedObjects<UserProfile>,
    sessions: UserSessionState[],
    sessionsMap: { [sessionID: string]: UserSessionState },
    currentSession?: UserSessionState,
    callStartAt: number,
    callHostID: string,
    callHostChangeAt: number,
    callRecording?: CallJobReduxState,
    isRecording: boolean,
    hideExpandedView: () => void,
    showScreenSourceModal: () => void,
    selectRhsPost?: (postID: string) => void,
    prefetchThread: (postId: string) => void,
    closeRhs?: () => void,
    isRhsOpen?: boolean,
    screenSharingSession?: UserSessionState,
    channel?: Channel,
    channelTeam?: Team,
    channelDisplayName: string;
    connectedDMUser: UserProfile | undefined,
    threadID: Post['id'],
    threadUnreadReplies: number | undefined,
    threadUnreadMentions: number | undefined,
    rhsSelectedThreadID?: string,
    allowScreenSharing: boolean,
    recordingsEnabled: boolean,
    recordingMaxDuration: number,
    startCallRecording: (callID: string) => void,
    recordingPromptDismissedAt: (callID: string, dismissedAt: number) => void,
    transcriptionsEnabled: boolean,
    isAdmin: boolean,
    hostControlsAllowed: boolean,
    openModal: <P>(modalData: ModalData<P>) => void;
    enableVideo: boolean;
    otherSessions: UserSessionState[];
}

interface State {
    screenStream: MediaStream | null,
    selfVideoStream: MediaStream | null,
    otherVideoStream: MediaStream | null,
    showParticipantsList: boolean,
    showLiveCaptions: boolean,
    alerts: CallAlertStates,
    removeConfirmation: RemoveConfirmationData | null,
    viewState: 'grid' | 'speaker',
}

const StyledMediaController = styled(MediaController)`
    max-height: calc(100% - 32px);
    background-color: transparent;
    margin-top: auto;
    margin-bottom: auto;
`;

const StyledMediaControlBar = styled(MediaControlBar)`
    position: relative;
    display: flex;
    flex-direction: row;
    justify-content: flex-end;
    background-color: rgba(0, 0, 0, 0.5);
    z-index: 1;
`;

const StyledMediaFullscreenButton = styled(MediaFullscreenButton)`
    font-size: 18px;
    background-color: transparent;
`;

export default class ExpandedView extends React.PureComponent<Props, State> {
    private readonly emojiButtonRef: React.RefObject<ReactionButtonRef>;
    private expandedRootRef = React.createRef<HTMLDivElement>();
    private pushToTalk = false;
    private screenPlayer: HTMLVideoElement | null = null;
    private callQualityBannerLocked = false;

    static contextType = window.ProductApi.WebSocketProvider;

    #unlockNavigation?: () => void;

    private genStyle: () => Record<string, React.CSSProperties> = () => {
        setCallsGlobalCSSVars(this.props.theme.sidebarBg);

        return {
            root: {
                display: 'flex',
                height: '100vh',
                color: 'white',
                flex: '1',
            },
            main: {
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                flex: '1',
                background: 'var(--calls-bg)',

                // Minimum z-index value needed to prevent the onboarding widget on the bottom left from showing on top.
                zIndex: '101',
            },
            headerSpreader: {
                marginRight: 'auto',
            },
            controls: {
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '12px',
                width: '100%',
                gap: '8px',
            },
            centerControls: {
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
            },
            topContainer: {
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '14px',
                lineHeight: '20px',
                fontWeight: 600,
                padding: '8px',
                margin: '0 12px',
                gap: '4px',
                height: '56px',
            },
            screenContainer: {
                display: 'flex',
                flex: 1,
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                maxWidth: 'calc(100% - 16px)',
                background: 'rgba(var(--button-color-rgb), 0.08)',
                borderRadius: '8px',
                margin: '0 12px',
            },
            screenSharingMsg: {
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                background: 'var(--calls-bg)',
                padding: '4px 8px',
                borderRadius: '12px',
                lineHeight: '12px',
                fontSize: '10px',
                fontWeight: 600,
                letterSpacing: '0.02em',
                color: 'var(--button-color)',
                margin: '4px',
            },
            rhs: {
                display: 'flex',
                flexDirection: 'column',
                width: '280px',
                background: 'var(--center-channel-bg)',
                color: 'var(--center-channel-color)',
                margin: 0,
                padding: 0,
                overflow: 'auto',
                gap: '10px',
            },
            rhsHeaderContainer: {
                position: 'sticky',
                top: '0',
                background: 'var(--center-channel-bg)',
            },
            rhsHeader: {
                display: 'flex',
                alignItems: 'center',
                background: 'rgba(var(--center-channel-color-rgb), 0.04)',
                borderBottom: '1px solid rgba(var(--center-channel-color-rgb), 0.08)',
                fontFamily: 'Metropolis, sans-serif',
                fontWeight: 600,
                fontSize: '16px',
                padding: '0 16px',
                height: '56px',
                lineHeight: '56px',
            },
        };
    };

    private style = this.genStyle();

    constructor(props: Props) {
        super(props);
        this.emojiButtonRef = React.createRef();
        this.state = {
            screenStream: null,
            selfVideoStream: null,
            otherVideoStream: null,
            showParticipantsList: false,
            showLiveCaptions: false,
            alerts: CallAlertStatesDefault,
            removeConfirmation: null,
            viewState: 'speaker',
        };

        if (window.opener) {
            const callsClient = window.opener.callsClient;
            callsClient?.on('close', () => window.close());

            // don't allow navigation in expanded window e.g. permalinks in rhs
            this.#unlockNavigation = props.history.block((tx) => {
                if (window.desktopAPI?.openLinkFromCalls) {
                    logDebug('desktopAPI.openLinkFromCalls');
                    window.desktopAPI.openLinkFromCalls(tx.pathname);
                } else {
                    // DEPRECATED: legacy Desktop API logic (<= 5.6.0)
                    sendDesktopEvent('calls-link-click', {link: tx.pathname});
                }
                return false;
            });

            // Set the inter-window actions
            window.callActions = {
                setRecordingPromptDismissedAt: this.props.recordingPromptDismissedAt,
                setMissingScreenPermissions: this.setMissingScreenPermissions,
            };

            // Set the current state
        } else if (window.desktop) {
            // TODO: remove this as soon as we support opening a window from desktop app.
            props.history.listen((_, action) => {
                if (action === 'REPLACE') {
                    // don't hide expanded view when location is replaced e.g. permalink/id is quietly removed after permalink nav occurred
                    return;
                }

                // navigation changed, hide expanded view e.g. a permalink was clicked in rhs
                this.props.hideExpandedView();
            });
        }
    }

    setScreenPlayerRef = (node: HTMLVideoElement) => {
        if (node && this.state.screenStream) {
            node.srcObject = this.state.screenStream;
        }
        this.screenPlayer = node;
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

        if (forward && window.opener?.callActions?.setMissingScreenPermissions) {
            window.opener.callActions.setMissingScreenPermissions(missing);
        }
    };

    handleBlur = () => {
        if (this.pushToTalk) {
            getCallsClient()?.mute();
            this.pushToTalk = false;
            this.forceUpdate();
        }
    };

    handleKeyUp = (ev: KeyboardEvent) => {
        if (isActiveElementInteractable() && !this.expandedRootRef.current?.contains(document.activeElement)) {
            return;
        }

        if (keyToAction('popout', ev) === PUSH_TO_TALK && this.pushToTalk) {
            getCallsClient()?.mute();
            this.pushToTalk = false;
            this.forceUpdate();
            return;
        }

        // Disabling Alt+ sequences as they would show the window menu on Linux Desktop.
        if (window.opener?.desktop && (ev.key === 'Alt' || ev.altKey)) {
            ev.preventDefault();
            ev.stopImmediatePropagation();
        }
    };

    handleKBShortcuts = (ev: KeyboardEvent) => {
        if ((!this.props.show || !window.callsClient) && !window.opener) {
            return;
        }

        if (isActiveElementInteractable() && !this.expandedRootRef.current?.contains(document.activeElement)) {
            return;
        }

        switch (keyToAction('popout', ev)) {
        case PUSH_TO_TALK:
            if (this.pushToTalk) {
                return;
            }
            getCallsClient()?.unmute();
            this.pushToTalk = true;
            this.forceUpdate();
            break;
        case MUTE_UNMUTE:
            this.onMuteToggle();
            break;
        case RAISE_LOWER_HAND:
            this.onRaiseHandToggle();
            break;
        case MAKE_REACTION:
            this.emojiButtonRef.current?.toggle();
            break;
        case SHARE_UNSHARE_SCREEN:
            this.onShareScreenToggle();
            break;
        case PARTICIPANTS_LIST_TOGGLE:
            this.onParticipantsListToggle();
            break;
        case LEAVE_CALL:
            this.onDisconnectClick();
            break;
        case RECORDING_TOGGLE:
            this.onRecordToggle();
            break;
        }
    };

    setAudioDevices = (devices: MediaDevices) => {
        this.setState({
            alerts: {
                ...this.state.alerts,
                missingAudioInput: {
                    ...this.state.alerts.missingAudioInput,
                    active: devices.inputs.length === 0,
                    show: devices.inputs.length === 0,
                },
            },
        });
    };

    setVideoDevices = (devices: MediaDeviceInfo[]) => {
        this.setState({
            alerts: {
                ...this.state.alerts,
                missingVideoInput: {
                    ...this.state.alerts.missingVideoInput,
                    active: devices.length === 0,
                    show: devices.length === 0,
                },
            },
        });
    };

    onDisconnectClick = () => {
        this.props.hideExpandedView();
        const callsClient = getCallsClient();
        if (callsClient) {
            callsClient.disconnect();
            if (window.opener) {
                window.close();
            }
        }
    };

    onMuteToggle = () => {
        if (this.pushToTalk) {
            return;
        }
        const callsClient = getCallsClient();
        if (this.isMuted()) {
            logDebug('ExpandedView.onMuteToggle: unmuting (user toggled on)');
            callsClient?.unmute();
        } else {
            logDebug('ExpandedView.onMuteToggle: muting (user toggled off)');
            callsClient?.mute();
        }
    };

    onVideoToggle = () => {
        const callsClient = getCallsClient();
        if (this.isVideoOn()) {
            logDebug('ExpandedView.onVideoToggle: stopping video (user toggled off)');
            callsClient?.stopVideo();
        } else {
            logDebug('ExpandedView.onVideoToggle: starting video (user toggled on)');
            callsClient?.startVideo();
        }
    };

    isMuted() {
        return this.props.currentSession ? !this.props.currentSession.unmuted : true;
    }

    isVideoOn() {
        return this.props.currentSession ? this.props.currentSession.video : false;
    }

    isHandRaised() {
        return this.props.currentSession ? this.props.currentSession.raised_hand > 0 : false;
    }

    onRecordToggle = async () => {
        if (!this.props.channel) {
            logErr('channel should be defined');
            return;
        }

        if (this.props.isRecording) {
            this.props.openModal({
                modalId: IDStopRecordingConfirmation,
                dialogType: StopRecordingConfirmation,
                dialogProps: {
                    channelID: this.props.channel.id,
                },
            });
        } else {
            await this.props.startCallRecording(this.props.channel.id);
        }
    };

    onShareScreenToggle = async () => {
        if (!this.props.allowScreenSharing) {
            return;
        }
        const callsClient = getCallsClient();
        if (this.props.screenSharingSession && this.props.screenSharingSession?.session_id === this.props.currentSession?.session_id) {
            callsClient?.unshareScreen();
            this.setState({
                screenStream: null,
            });
        } else if (!this.props.screenSharingSession) {
            if (window.desktopAPI?.openScreenShareModal) {
                logDebug('desktopAPI.openScreenShareModal');
                window.desktopAPI.openScreenShareModal();
            } else {
                const stream = await getScreenStream('', shareAudioWithScreen());
                if (window.opener && stream) {
                    window.screenSharingTrackId = stream.getVideoTracks()[0].id;
                }
                if (stream) {
                    await callsClient?.setScreenStream(stream);

                    this.setState({screenStream: stream});
                    this.setMissingScreenPermissions(false, true);
                } else {
                    this.setMissingScreenPermissions(true, true);
                }
            }
        }
    };

    onRaiseHandToggle = () => {
        const callsClient = getCallsClient();
        if (this.isHandRaised()) {
            callsClient?.unraiseHand();
        } else {
            callsClient?.raiseHand();
        }
    };

    onParticipantsListToggle = () => {
        this.setState({
            showParticipantsList: !this.state.showParticipantsList,
        });
    };

    onLiveCaptionsToggle = () => {
        this.setState({
            showLiveCaptions: !this.state.showLiveCaptions,
        });
    };

    onCloseViewClick = () => {
        if (window.opener) {
            window.close();
            return;
        }

        this.props.hideExpandedView();
    };

    onSwitchViewClick = () => {
        this.setState({
            viewState: this.state.viewState === 'grid' ? 'speaker' : 'grid',
        });
    };

    public componentDidUpdate(prevProps: Props, prevState: State) {
        if (prevProps.theme.type !== this.props.theme.type) {
            this.style = this.genStyle();
        }

        if (window.opener) {
            if (document.title.indexOf('Call') === -1 && this.props.channel) {
                if (isDMChannel(this.props.channel) && this.props.connectedDMUser) {
                    document.title = `Call - ${getUserDisplayName(this.props.connectedDMUser)}`;
                } else if (!isDMChannel(this.props.channel)) {
                    document.title = `Call - ${this.props.channel.display_name}`;
                }
            }

            if (this.props.selectRhsPost) {
                // global rhs supported

                if (this.props.threadID && !prevProps.threadID) {
                    // prefetch to get initial unreads
                    this.props.prefetchThread(this.props.threadID);
                }
            }
        }

        if (this.screenPlayer && this.state.screenStream !== prevState.screenStream) {
            this.screenPlayer.srcObject = this.state.screenStream;
        }
    }

    requestCallState = () => {
        const callsClient = getCallsClient();
        if (!callsClient) {
            logErr('callsClient should be defined');
            return;
        }

        // On WebSocket connect we request the call state. This avoids
        // making a potentially racy HTTP call and should guarantee
        // a consistent state.
        logDebug('requesting call state through ws');
        this.context.sendMessage('custom_com.mattermost.calls_call_state', {channelID: callsClient.channelID});
    };

    public componentDidMount() {
        const callsClient = getCallsClient();
        if (!callsClient) {
            logErr('callsClient should be defined');
            return;
        }

        if (!this.context) {
            logErr('context should be defined');
            return;
        }

        if (this.context?.conn?.readyState === WebSocket.OPEN) {
            this.requestCallState();
        } else {
            logDebug('ws not connected still, adding listener');
            this.context.addFirstConnectListener(this.requestCallState);
        }

        // keyboard shortcuts
        window.addEventListener('keydown', this.handleKBShortcuts, true);
        window.addEventListener('keyup', this.handleKeyUp, true);
        window.addEventListener('blur', this.handleBlur, true);

        callsClient.on('remoteScreenStream', (stream: MediaStream) => {
            this.setState({
                screenStream: stream,
            });
        });
        callsClient.on('localScreenStream', (stream: MediaStream) => {
            this.setState({
                screenStream: stream,
            });
        });

        callsClient.on('devicefallback', (device: MediaDeviceInfo) => {
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

        callsClient.on('localVideoStream', (stream: MediaStream) => {
            this.setState({
                selfVideoStream: stream,
            });
        });
        callsClient.on('remoteVideoStream', (stream: MediaStream) => {
            this.setState({
                otherVideoStream: stream,
            });
        });
        callsClient.on('devicechange', (audioDevices: MediaDevices, videoDevices: MediaDeviceInfo[]) => {
            this.setAudioDevices(audioDevices);
            this.setVideoDevices(videoDevices);
        });
        callsClient.on('initaudio', () => {
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
        callsClient.on('initvideo', () => {
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

        this.setAudioDevices(callsClient.getAudioDevices());
        this.setVideoDevices(callsClient.getVideoDevices());

        const screenStream = callsClient.getLocalScreenStream() || callsClient.getRemoteScreenStream();
        const selfVideoStream = callsClient.localVideoStream;
        const otherVideoStream = callsClient.getRemoteVideoStream();

        // eslint-disable-next-line react/no-did-mount-set-state
        this.setState({
            alerts: {
                ...this.state.alerts,
                missingAudioInputPermissions: {
                    ...this.state.alerts.missingAudioInputPermissions,
                    active: !this.state.alerts.missingAudioInput.active && !callsClient.audioTrack,
                    show: !this.state.alerts.missingAudioInput.active && !callsClient.audioTrack,
                },
                missingVideoInputPermissions: {
                    ...this.state.alerts.missingVideoInputPermissions,
                    active: this.props.enableVideo && !this.state.alerts.missingVideoInput.active && !callsClient.localVideoStream,
                    show: this.props.enableVideo && !this.state.alerts.missingVideoInput.active && !callsClient.localVideoStream,
                },
            },
            screenStream,
            selfVideoStream,
            otherVideoStream,
        });

        if (window.opener) {
            // core styling for rhs in expanded window
            document.body.classList.add('app__body');

            if (this.props.selectRhsPost) {
                // global rhs supported

                if (this.props.threadID) {
                    // prefetch to get initial unreads
                    this.props.prefetchThread(this.props.threadID);
                }
            }

            if (window.opener.currentCallData.missingScreenPermissions) {
                this.setMissingScreenPermissions(true);
            }
        }

        callsClient.on('mos', (mos: number) => {
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

    toggleChat = async () => {
        if (this.props.isRhsOpen && this.props.rhsSelectedThreadID === this.props.threadID) {
            // close rhs
            this.props.closeRhs?.();
        } else if (this.props.channelTeam && this.props.channelTeam.id !== this.props.currentTeamID) {
            // go to call thread in channels
            this.props.history.push(`/${this.props.channelTeam.name}/pl/${this.props.threadID}`);
        } else if (this.props.threadID) {
            // open thread
            this.props.selectRhsPost?.(this.props.threadID);
        }
    };

    public componentWillUnmount() {
        window.removeEventListener('keydown', this.handleKBShortcuts, true);
        window.removeEventListener('keyup', this.handleKeyUp, true);
        window.removeEventListener('blur', this.handleBlur, true);
        this.#unlockNavigation?.();
        this.context?.removeFirstConnectListener(this.requestCallState);
    }

    dismissRecordingPrompt = () => {
        if (!this.props.channel) {
            logErr('channel should be defined');
            return;
        }

        // Dismiss our prompt.
        this.props.recordingPromptDismissedAt(this.props.channel.id, Date.now());

        // Dismiss the parent window's prompt.
        window.opener?.callActions?.setRecordingPromptDismissedAt(this.props.channel.id, Date.now());
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

    shouldRenderAlertBanner = () => {
        return Object.entries(this.state.alerts).filter((kv) => kv[1].show).length > 0;
    };

    renderAlertBanner = () => {
        const {formatMessage} = this.props.intl;
        for (const keyVal of Object.entries(this.state.alerts)) {
            const [alertID, alertState] = keyVal;
            if (!alertState.show) {
                continue;
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
                <GlobalBanner
                    {...alertConfig}
                    icon={alertConfig.icon}
                    body={formatMessage(alertConfig.bannerText, alertState.args)}
                    onClose={onClose}
                />
            );
        }

        return null;
    };

    renderTopVideoContainer = () => {
        const {formatMessage} = this.props.intl;

        // Here we are assuming this only renders in a DM which is the case
        // right now.
        const selfProfile = this.props.profiles[this.props.currentUserID];
        const selfSession = this.props.currentSession;
        const otherProfile = this.props.connectedDMUser;
        const otherSession = this.props.otherSessions[0];

        return (
            <VideoProfilesTopContainer
                className='calls-popout-top-video-container'
            >
                { selfProfile && selfSession &&
                    <div style={{width: '156px', height: '88px'}}>
                        <VideoProfile
                            stream={this.state.selfVideoStream}
                            profile={selfProfile}
                            profileName={formatMessage({defaultMessage: '(you)'})}
                            isMuted={!selfSession.unmuted}
                            hasVideo={Boolean(selfSession.video)}
                            isSpeaking={Boolean(selfSession.voice)}
                            mirrorVideo={localStorage.getItem(STORAGE_CALLS_MIRROR_VIDEO_KEY) === 'true'}
                        />
                    </div>
                }

                {this.props.screenSharingSession && otherProfile && otherSession &&
                    <div style={{width: '156px', height: '88px'}}>
                        <VideoProfile
                            stream={this.state.otherVideoStream}
                            profile={otherProfile}
                            profileName={getUserDisplayName(otherProfile)}
                            isMuted={!otherSession.unmuted}
                            hasVideo={Boolean(otherSession.video)}
                            isSpeaking={Boolean(otherSession.voice)}
                            mirrorVideo={false}
                        />
                    </div>
                }
            </VideoProfilesTopContainer>
        );
    };

    renderVideoContainer = () => {
        const {formatMessage} = this.props.intl;

        // Here we are assuming this only renders in a DM which is the case
        // right now.
        const selfProfile = this.props.profiles[this.props.currentUserID];
        const selfSession = this.props.currentSession;
        const otherProfile = this.props.connectedDMUser;
        const otherSession = this.props.otherSessions[0];

        // If current user is the only one in the call, we show their video, otherwise we show the other user's video.
        const session = this.props.otherSessions.length === 0 ? selfSession : otherSession;
        const profile = this.props.otherSessions.length === 0 ? selfProfile : otherProfile;
        const stream = this.props.otherSessions.length === 0 ? this.state.selfVideoStream : this.state.otherVideoStream;
        const mirrorSelfVideo = localStorage.getItem(STORAGE_CALLS_MIRROR_VIDEO_KEY) === 'true';

        const shouldRenderTopVideoContainer = this.state.viewState === 'speaker' && ((this.props.currentSession?.video && this.props.otherSessions.length > 0) || this.props.otherSessions.some((s) => s.video));

        const renderSpeakerView = () => {
            if (!profile || !session) {
                return null;
            }
            return (
                <VideoProfile
                    stream={stream}
                    profile={profile}
                    profileName={session === selfSession ? `${getUserDisplayName(profile)} ${formatMessage({defaultMessage: '(you)'})}` : getUserDisplayName(profile)}
                    isMuted={!session.unmuted}
                    hasVideo={Boolean(session.video)}
                    isSpeaking={Boolean(session.voice)}
                    mirrorVideo={session === selfSession && mirrorSelfVideo}
                    aspectRatio={session === otherSession && !session.video ? '16/9' : ''}
                />
            );
        };

        const renderGridView = () => {
            return (
                <>
                    { otherProfile && otherSession &&
                    <VideoProfile
                        stream={this.state.otherVideoStream}
                        profile={otherProfile}
                        profileName={getUserDisplayName(profile)}
                        isMuted={!otherSession.unmuted}
                        hasVideo={Boolean(otherSession.video)}
                        isSpeaking={Boolean(otherSession.voice)}
                        mirrorVideo={false}
                        width={'100%'}
                    />
                    }

                    { selfProfile && selfSession &&
                    <VideoProfile
                        stream={this.state.selfVideoStream}
                        profile={selfProfile}
                        profileName={`${getUserDisplayName(selfProfile)} ${formatMessage({defaultMessage: '(you)'})}`}
                        isMuted={!selfSession.unmuted}
                        hasVideo={Boolean(selfSession.video)}
                        isSpeaking={Boolean(selfSession.voice)}
                        mirrorVideo={mirrorSelfVideo}
                        width={'100%'}
                    />
                    }
                </>
            );
        };

        return (
            <VideoProfilesContainer
                className='calls-popout-video-container'
                $height={`calc(100vh - ${shouldRenderTopVideoContainer ? 220 : 124}px)`}
            >
                {this.state.viewState === 'speaker' && renderSpeakerView()}
                {this.state.viewState === 'grid' && !this.props.screenSharingSession && renderGridView()}
            </VideoProfilesContainer>
        );
    };

    renderScreenSharingPlayer = () => {
        const isSharing = this.props.screenSharingSession?.session_id === this.props.currentSession?.session_id;
        const {formatMessage} = this.props.intl;
        const shouldRenderTopVideoContainer = (this.props.currentSession?.video && this.props.otherSessions.length > 0) || this.props.otherSessions.some((s) => s.video);

        let heightAllowance = this.shouldRenderAlertBanner() ? 164 : 124;
        if (shouldRenderTopVideoContainer) {
            heightAllowance += 96;
        }

        let profile;
        if (!isSharing) {
            for (let i = 0; i < this.props.sessions.length; i++) {
                if (this.props.sessions[i].session_id === this.props.screenSharingSession?.session_id) {
                    profile = this.props.profiles[this.props.sessions[i].user_id];
                    break;
                }
            }
            if (!profile) {
                return null;
            }
        }

        const msg = isSharing ? formatMessage({defaultMessage: 'You\'re sharing your screen'}) : formatMessage({defaultMessage: 'You\'re viewing {presenterName}\'s screen'}, {presenterName: getUserDisplayName(profile)});

        return (
            <div
                style={{
                    ...this.style.screenContainer,

                    // Account for when we display an alert banner.
                    maxHeight: `calc(100vh - ${heightAllowance}px)`,
                }}
            >
                <StyledMediaController
                    gesturesDisabled={true}
                >
                    <video
                        id='screen-player'
                        slot='media'
                        ref={this.setScreenPlayerRef}
                        muted={true}
                        autoPlay={true}
                        onClick={(ev) => ev.preventDefault()}
                        controls={false}
                    />
                    <StyledMediaControlBar>
                        <StyledMediaFullscreenButton>
                            <CompassIcon
                                slot='enter'
                                icon='arrow-expand-all'
                            />
                            <CompassIcon
                                slot='exit'
                                icon='arrow-collapse'
                            />
                        </StyledMediaFullscreenButton>
                    </StyledMediaControlBar>
                </StyledMediaController>
                <span style={this.style.screenSharingMsg}>
                    <ScreenIcon
                        fill={'rgba(255, 255, 255, 0.56)'}
                        style={{width: '12px', height: '12px'}}
                    />
                    {msg}
                </span>
            </div>
        );
    };

    renderParticipantsRHSList = () => {
        return this.props.sessions.map((session) => (
            <CallParticipantRHS
                key={'participants_rhs_profile_' + session.session_id}
                session={session}
                profile={this.props.profiles[session.user_id]}
                isYou={this.props.currentSession?.session_id === session.session_id}
                isHost={this.props.callHostID === session.user_id}
                isSharingScreen={this.props.screenSharingSession?.session_id === session.session_id}
                iAmHost={this.props.currentSession?.user_id === this.props.callHostID}
                callID={this.props.channel?.id}
                onRemove={() => this.onRemove(session.session_id, session.user_id)}
            />
        ));
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

        const badge = (
            <Badge
                id={'calls-recording-badge'}
                text={'REC'}
                textSize={12}
                lineHeight={16}
                gap={4}
                margin={'0 8px 0 0'}
                padding={'6px 8px'}
                icon={(<RecordCircleIcon style={{width: '12px', height: '12px'}}/>)}
                hoverIcon={(<RecordSquareIcon style={{width: '12px', height: '12px'}}/>)}
                bgColor={hasRecStarted ? '#D24B4E' : 'rgba(221, 223, 228, 0.04)'}
                loading={!hasRecStarted}
            />
        );

        if (hasRecStarted) {
            const {formatMessage} = this.props.intl;
            return (
                <OverlayTrigger
                    placement='bottom'
                    key={'badge-stop-recording'}
                    overlay={
                        <Tooltip id='tooltip-badge-stop-recording'>
                            {formatMessage({defaultMessage: 'Click to stop'})}
                        </Tooltip>
                    }
                >

                    <button
                        className='style--none'
                        onClick={() => this.onRecordToggle()}
                        aria-label={formatMessage({defaultMessage: 'Click to stop recording'})}
                    >
                        {badge}
                    </button>
                </OverlayTrigger>
            );
        }

        return badge;
    };

    render() {
        if ((!this.props.show || !window.callsClient) && !window.opener) {
            return null;
        }

        const callsClient = getCallsClient();
        if (!callsClient) {
            return null;
        }

        const {formatMessage} = this.props.intl;

        const noInputDevices = this.state.alerts.missingAudioInput.active;
        const noAudioPermissions = this.state.alerts.missingAudioInputPermissions.active;
        const noScreenPermissions = this.state.alerts.missingScreenPermissions.active;
        const isMuted = this.isMuted();
        const MuteIcon = isMuted && !noInputDevices && !noAudioPermissions ? MutedIcon : UnmutedIcon;

        const noVideoInputDevices = this.state.alerts.missingVideoInput.active;
        const noVideoPermissions = this.state.alerts.missingVideoInputPermissions.active;
        const isVideoOn = this.isVideoOn();
        const VideoIcon = this.isVideoOn() || noVideoInputDevices || noVideoPermissions ? VideoOnIcon : VideoOffIcon;
        let videoTooltipText = isVideoOn ? formatMessage({defaultMessage: 'Turn camera off'}) : formatMessage({defaultMessage: 'Turn camera on'});
        let videoTooltipSubtext = '';
        if (noVideoInputDevices) {
            videoTooltipText = formatMessage(CallAlertConfigs.missingVideoInput.tooltipText!);
            videoTooltipSubtext = formatMessage(CallAlertConfigs.missingVideoInput.tooltipSubtext!);
        }
        if (noVideoPermissions) {
            videoTooltipText = formatMessage(CallAlertConfigs.missingVideoInputPermissions.tooltipText!);
            videoTooltipSubtext = formatMessage(CallAlertConfigs.missingVideoInputPermissions.tooltipSubtext!);
        }

        let muteTooltipText = isMuted ? formatMessage({defaultMessage: 'Unmute'}) : formatMessage({defaultMessage: 'Mute'});
        let muteTooltipSubtext = isMuted ? formatMessage({defaultMessage: 'Or hold space bar'}) : '';

        if (noInputDevices) {
            muteTooltipText = formatMessage(CallAlertConfigs.missingAudioInput.tooltipText!);
            muteTooltipSubtext = formatMessage(CallAlertConfigs.missingAudioInput.tooltipSubtext!);
        }
        if (noAudioPermissions) {
            muteTooltipText = formatMessage(CallAlertConfigs.missingAudioInputPermissions.tooltipText!);
            muteTooltipSubtext = formatMessage(CallAlertConfigs.missingAudioInputPermissions.tooltipSubtext!);
        }

        const sharingID = this.props.screenSharingSession?.session_id;
        const isSharing = sharingID === this.props.currentSession?.session_id;

        let shareScreenTooltipText = isSharing ? formatMessage({defaultMessage: 'Stop presenting'}) : formatMessage({defaultMessage: 'Start presenting'});
        if (noScreenPermissions) {
            shareScreenTooltipText = formatMessage(CallAlertConfigs.missingScreenPermissions.tooltipText!);
        }
        const shareScreenTooltipSubtext = noScreenPermissions ? formatMessage(CallAlertConfigs.missingScreenPermissions.tooltipSubtext!) : '';

        const participantsText = this.state.showParticipantsList ? formatMessage({defaultMessage: 'Hide participants list'}) : formatMessage({defaultMessage: 'Show participants list'});

        const showChatThread = this.props.isRhsOpen && this.props.rhsSelectedThreadID === this.props.threadID;
        let chatToolTipText = showChatThread ? formatMessage({defaultMessage: 'Hide chat'}) : formatMessage({defaultMessage: 'Show chat'});

        const chatToolTipSubtext = '';
        const chatDisabled = this.props.channelTeam && this.props.channelTeam.id !== this.props.currentTeamID;
        if (chatDisabled) {
            chatToolTipText = formatMessage({
                defaultMessage: 'Chat unavailable: different team selected. Click here to switch back to {channelName} in {teamName}.',
            }, {
                channelName: this.props.channelDisplayName,
                teamName: this.props.channelTeam!.display_name,
            });
        }

        const globalRhsSupported = Boolean(this.props.selectRhsPost);

        const isChatUnread = Boolean(this.props.threadUnreadReplies);

        const isHost = this.props.callHostID === this.props.currentUserID;
        const hostControlsAvailable = this.props.hostControlsAllowed && (isHost || this.props.isAdmin);
        const showMuteOthers = hostControlsAvailable && this.props.sessions.some((s) => s.unmuted && s.user_id !== this.props.currentUserID);

        const isRecording = isHost && this.props.isRecording;

        const recordTooltipText = isRecording ? formatMessage({defaultMessage: 'Stop recording'}) : formatMessage({defaultMessage: 'Record call'});
        const RecordIcon = isRecording ? RecordSquareIcon : RecordCircleIcon;
        const ShareIcon = isSharing ? UnshareScreenIcon : ShareScreenIcon;

        const leaveCallTooltipText = formatMessage({defaultMessage: 'Leave call'});
        const closeViewLabel = formatMessage({defaultMessage: 'Close window'});

        const switchViewLabel = this.state.viewState === 'speaker' ? formatMessage({defaultMessage: 'Switch to grid view'}) : formatMessage({defaultMessage: 'Switch to speaker view'});
        const SwitchViewIcon = this.state.viewState === 'speaker' ? SpeakerViewIcon : GridViewIcon;

        const shouldRenderVideoContainer = this.props.currentSession?.video || this.props.otherSessions.some((s) => s.video);
        const shouldRenderTopVideoContainer = (this.state.viewState === 'speaker' || this.props.screenSharingSession) && ((this.props.currentSession?.video && this.props.otherSessions.length > 0) || this.props.otherSessions.some((s) => s.video));

        return (
            <div
                ref={this.expandedRootRef}
                id='calls-expanded-view'
                style={globalRhsSupported ? this.style.root : {
                    ...this.style.root,
                    position: 'absolute',
                    top: 0,
                    left: 0,
                }}
            >
                <div style={this.style.main}>
                    {this.renderAlertBanner()}

                    <div
                        data-testid={'calls-expanded-view-top-container'}
                        style={this.style.topContainer}
                    >
                        {this.renderRecordingBadge()}
                        <CallDuration
                            startAt={this.props.callStartAt}
                        />

                        <div style={this.style.headerSpreader}/>
                        <ExpandedIncomingCallContainer/>

                        { this.props.enableVideo && !this.props.screenSharingSession && shouldRenderVideoContainer && this.props.otherSessions.length > 0 &&
                        <OverlayTrigger
                            placement='bottom'
                            key={'switch-view'}
                            overlay={
                                <Tooltip id='tooltip-switch-view'>
                                    {switchViewLabel}
                                </Tooltip>
                            }
                        >
                            <SwitchViewButton
                                className='style--none'
                                onClick={this.onSwitchViewClick}
                                aria-label={switchViewLabel}
                            >
                                <SwitchViewIcon
                                    style={{
                                        width: '20px',
                                        height: '20px',
                                    }}
                                />
                            </SwitchViewButton>
                        </OverlayTrigger>
                        }

                        <OverlayTrigger
                            placement='bottom'
                            key={'close-window'}
                            overlay={
                                <Tooltip id='tooltip-close-window'>
                                    {closeViewLabel}
                                </Tooltip>
                            }
                        >
                            <CloseViewButton
                                className='style--none'
                                onClick={this.onCloseViewClick}
                                aria-label={closeViewLabel}
                            >
                                <CollapseIcon
                                    style={{
                                        width: '20px',
                                        height: '20px',
                                    }}
                                />
                            </CloseViewButton>
                        </OverlayTrigger>
                    </div>

                    {shouldRenderTopVideoContainer && this.renderTopVideoContainer()}

                    {!this.props.screenSharingSession && !shouldRenderVideoContainer && this.props.currentSession && this.props.channel &&
                    <ParticipantsGrid
                        callID={this.props.channel.id}
                        callHostID={this.props.callHostID}
                        currentSessionID={this.props.currentSession.session_id}
                        currentUserID={this.props.currentUserID}
                        profiles={this.props.profiles}
                        sessions={this.props.sessions}
                        onParticipantRemove={this.onRemove}
                    />
                    }

                    {!this.props.screenSharingSession && shouldRenderVideoContainer && this.renderVideoContainer()}

                    {this.props.screenSharingSession && this.renderScreenSharingPlayer()}

                    {this.state.showLiveCaptions &&
                        <LiveCaptionsOverlay>
                            <LiveCaptionsStream/>
                        </LiveCaptionsOverlay>
                    }
                    <div
                        id='calls-expanded-view-controls'
                        style={this.style.controls}
                    >
                        <div style={{flex: '1', display: 'flex', justifyContent: 'flex-start'}}>
                            <ControlsButton
                                id='calls-popout-participants-button'
                                ariaLabel={participantsText}
                                ariaControls='rhs-participant-list'
                                ariaExpanded={this.state.showParticipantsList}
                                onToggle={() => this.onParticipantsListToggle()}
                                tooltipText={participantsText}
                                shortcut={reverseKeyMappings.popout[PARTICIPANTS_LIST_TOGGLE][0]}
                                bgColor={this.state.showParticipantsList ? 'white' : ''}
                                bgColorHover={this.state.showParticipantsList ? 'rgba(255, 255, 255, 0.92)' : ''}
                                iconFill={this.state.showParticipantsList ? 'rgba(var(--calls-bg-rgb), 0.80)' : ''}
                                iconFillHover={this.state.showParticipantsList ? 'var(--calls-bg)' : ''}
                                icon={
                                    <ParticipantsIcon
                                        style={{
                                            width: '20px',
                                            height: '20px',
                                        }}
                                    />
                                }
                                text={`${this.props.sessions.length}`}
                            />
                        </div>

                        <div style={this.style.centerControls}>
                            <ControlsButton
                                id='calls-popout-mute-button'
                                dataTestId={isMuted ? 'calls-popout-muted' : 'calls-popout-unmuted'}
                                ariaLabel={muteTooltipText}
                                // eslint-disable-next-line no-undefined
                                onToggle={noInputDevices ? undefined : this.onMuteToggle}
                                tooltipText={muteTooltipText}
                                tooltipSubtext={muteTooltipSubtext}
                                // eslint-disable-next-line no-undefined
                                shortcut={noInputDevices || noAudioPermissions ? undefined : reverseKeyMappings.popout[MUTE_UNMUTE][0]}
                                bgColor={isMuted ? '' : 'rgba(61, 184, 135, 0.16)'}
                                bgColorHover={isMuted ? '' : 'rgba(61, 184, 135, 0.20)'}
                                iconFill={isMuted ? '' : 'rgba(61, 184, 135, 0.80)'}
                                iconFillHover={isMuted ? '' : 'rgba(61, 184, 135, 0.80)'}
                                icon={
                                    <MuteIcon
                                        style={{
                                            width: '20px',
                                            height: '20px',
                                        }}
                                    />
                                }
                                unavailable={noInputDevices || noAudioPermissions}
                            />

                            {this.props.enableVideo &&
                            <ControlsButton
                                id='calls-popout-video-button'
                                dataTestId={isVideoOn ? 'calls-popout-stop-video' : 'calls-popout-start-video'}
                                ariaLabel={videoTooltipText}
                                // eslint-disable-next-line no-undefined
                                onToggle={noVideoInputDevices ? undefined : this.onVideoToggle}
                                tooltipText={videoTooltipText}
                                tooltipSubtext={videoTooltipSubtext}
                                // eslint-disable-next-line no-undefined
                                // shortcut={noVideoInputDevices || noVideoPermissions ? undefined : reverseKeyMappings.popout[MUTE_UNMUTE][0]}
                                bgColor={isVideoOn ? 'rgba(61, 184, 135, 0.16)' : ''}
                                bgColorHover={isVideoOn ? 'rgba(61, 184, 135, 0.20)' : ''}
                                iconFill={isVideoOn ? 'rgba(61, 184, 135, 0.80)' : ''}
                                iconFillHover={isVideoOn ? 'rgba(61, 184, 135, 0.80)' : ''}
                                icon={
                                    <VideoIcon
                                        style={{
                                            width: '20px',
                                            height: '20px',
                                        }}
                                    />
                                }
                                unavailable={noVideoInputDevices || noVideoPermissions}
                            />
                            }

                            {this.props.allowScreenSharing &&
                                <ControlsButton
                                    id='calls-popout-screenshare-button'
                                    ariaLabel={shareScreenTooltipText}
                                    onToggle={() => this.onShareScreenToggle()}
                                    tooltipText={shareScreenTooltipText}
                                    tooltipSubtext={shareScreenTooltipSubtext}
                                    // eslint-disable-next-line no-undefined
                                    shortcut={noScreenPermissions ? undefined : reverseKeyMappings.popout[SHARE_UNSHARE_SCREEN][0]}
                                    bgColor={isSharing ? 'rgba(var(--dnd-indicator-rgb), 0.16)' : ''}
                                    bgColorHover={isSharing ? 'rgba(var(--dnd-indicator-rgb), 0.20)' : ''}
                                    iconFill={isSharing ? 'rgba(var(--dnd-indicator-rgb), 0.80)' : ''}
                                    iconFillHover={isSharing ? 'var(--dnd-indicator)' : ''}
                                    icon={
                                        <ShareIcon
                                            style={{
                                                width: '20px',
                                                height: '20px',
                                            }}
                                        />
                                    }
                                    unavailable={noScreenPermissions}
                                    disabled={Boolean(sharingID) && !isSharing}
                                />
                            }

                            <ReactionButton
                                ref={this.emojiButtonRef}
                                isHandRaised={this.isHandRaised()}
                            />

                            {isHost && this.props.recordingsEnabled &&
                                <ControlsButton
                                    id='calls-popout-record-button'
                                    ariaLabel={recordTooltipText}
                                    onToggle={() => this.onRecordToggle()}
                                    tooltipText={recordTooltipText}
                                    // eslint-disable-next-line no-undefined
                                    shortcut={reverseKeyMappings.popout[RECORDING_TOGGLE][0]}
                                    bgColor={isRecording ? 'rgba(var(--dnd-indicator-rgb), 0.16)' : ''}
                                    bgColorHover={isRecording ? 'rgba(var(--dnd-indicator-rgb), 0.20)' : ''}
                                    iconFill={isRecording ? 'rgba(var(--dnd-indicator-rgb), 0.80)' : ''}
                                    iconFillHover={isRecording ? 'var(--dnd-indicator)' : ''}
                                    icon={<RecordIcon style={{width: '20px', height: '20px'}}/>}
                                />
                            }

                            {globalRhsSupported && (
                                <ControlsButton
                                    id='calls-popout-chat-button'
                                    ariaLabel={chatToolTipText}
                                    onToggle={this.toggleChat}
                                    tooltipText={chatToolTipText}
                                    tooltipSubtext={chatToolTipSubtext}
                                    bgColor={showChatThread ? 'white' : ''}
                                    bgColorHover={showChatThread ? 'rgba(255, 255, 255, 0.92)' : ''}
                                    iconFill={showChatThread ? 'rgba(var(--calls-bg-rgb), 0.80)' : ''}
                                    iconFillHover={showChatThread ? 'var(--calls-bg)' : ''}
                                    icon={
                                        <CallThreadIcon>
                                            <ChatThreadIcon
                                                style={{width: '20px', height: '20px'}}
                                            />
                                            {!chatDisabled && isChatUnread && (
                                                <UnreadIndicator mentions={this.props.threadUnreadMentions}/>
                                            )}
                                        </CallThreadIcon>
                                    }
                                    unavailable={chatDisabled}
                                />
                            )}

                            <CallSettingsButton
                                onLiveCaptionsToggle={this.onLiveCaptionsToggle}
                                showLiveCaptions={this.state.showLiveCaptions}
                            />
                        </div>
                        <div style={{flex: '1', display: 'flex', justifyContent: 'flex-end'}}>
                            <DotMenu
                                id='calls-popout-leave-button'
                                ariaLabel={leaveCallTooltipText}
                                icon={<LeaveCallIcon style={{fill: 'white', width: '20px', height: '20px'}}/>}
                                dotMenuButton={LeaveCallButton}
                                dropdownMenu={StyledDropdownMenu}
                                placement={'top-end'}
                                strategy={'fixed'}
                                shortcut={reverseKeyMappings.widget[LEAVE_CALL][0]}
                                tooltipText={leaveCallTooltipText}
                            >
                                <LeaveCallMenu
                                    channelID={callsClient.channelID}
                                    isHost={isHost}
                                    numParticipants={this.props.sessions.length}
                                    leaveCall={this.onDisconnectClick}
                                />
                            </DotMenu>
                        </div>
                    </div>
                </div>
                {this.state.showParticipantsList &&
                    <ul
                        id='rhs-participant-list'
                        data-testid={'rhs-participant-list'}
                        style={this.style.rhs}
                    >
                        <div
                            data-testid={'rhs-participant-list-header'}
                            style={this.style.rhsHeaderContainer}
                        >
                            <div style={this.style.rhsHeader}>
                                <span>{formatMessage({defaultMessage: 'Participants'})}</span>
                                <ToTheRight/>
                                {showMuteOthers &&
                                    <MuteOthersButton onClick={() => hostMuteOthers(this.props.channel?.id)}>
                                        <MutedIcon
                                            fill='var(--button-bg)'
                                            style={{width: '12px', height: '12px'}}
                                        />
                                        {formatMessage({defaultMessage: 'Mute others'})}
                                    </MuteOthersButton>
                                }
                                <CloseButton
                                    className='style--none'
                                    onClick={() => this.onParticipantsListToggle()}
                                    aria-label={participantsText}
                                >
                                    <CompassIcon icon='close'/>
                                </CloseButton>
                            </div>
                        </div>
                        {this.renderParticipantsRHSList()}
                    </ul>
                }
                {globalRhsSupported &&
                    <ExpandedViewGlobalsStyle
                        callThreadSelected={this.props.rhsSelectedThreadID === this.props.threadID}
                    />
                }

                <ReactionOverlay>
                    <ReactionStream/>
                    <RecordingInfoPrompt
                        isHost={this.props.callHostID === this.props.currentUserID}
                        hostChangeAt={this.props.callHostChangeAt}
                        recording={this.props.callRecording}
                        recordingMaxDuration={this.props.recordingMaxDuration}
                        onDecline={this.onDisconnectClick}
                        promptDismissed={this.dismissRecordingPrompt}
                        transcriptionsEnabled={this.props.transcriptionsEnabled}
                    />
                    {Boolean(this.state.removeConfirmation) &&
                        Boolean(this.props.sessionsMap[this.state.removeConfirmation?.sessionID || '']) &&
                        <RemoveConfirmation
                            profile={this.props.profiles[this.state.removeConfirmation?.userID || '']}
                            onConfirm={this.onRemoveConfirm}
                            onCancel={this.onRemoveCancel}
                        />
                    }
                </ReactionOverlay>
            </div>
        );
    }
}

const isActiveElementInteractable = () => {
    return document.activeElement && ['INPUT', 'SELECT', 'BUTTON', 'TEXTAREA'].includes(document.activeElement.tagName);
};

const UnreadIndicator = ({mentions}: { mentions?: number }) => {
    return (
        <UnreadDot
            $padding={mentions ? '0.5px 2px' : ''}
        >
            {mentions &&
                <MentionsCounter>{mentions > 99 ? untranslatable('99+') : mentions}</MentionsCounter>
            }
        </UnreadDot>
    );
};

const ExpandedViewGlobalsStyle = createGlobalStyle<{ callThreadSelected: boolean }>`
    body.app__body #root {
        > #global-header,
        > .team-sidebar,
        > .app-bar,
        > #channel_view .channel__wrap,
        > button,
        > #SidebarContainer {
            display: none;
        }

        display: flex;

        > .announcement-bar {
            display: none;
        }

        > .main-wrapper {
            position: absolute;
            display: flex;
            margin: 0;
            padding: 0;
            border-radius: 0;
            border: 0;
            width: 100%;
            height: 100%;
        }

        #sidebar-right #sbrSearchFormContainer {
            // mobile search not supported in expanded view or expanded window
            // TODO move to hideMobileSearchBarInRHS prop of Search component in mattermost-webapp
            display: none;
        }

        #sidebar-right {
          position: relative;
        }

        .channel-view-inner {
            padding: 0;
        }

        .sidebar--right.sidebar--right--width-holder {
            display: none;
        }

        ${({callThreadSelected}) => !callThreadSelected && css`
            .sidebar--right {
                display: none;
            }
        `}

        #sidebar-right {
            border: 0;
        }
    }
`;

const ToTheRight = styled.div`
    margin-left: auto;
`;

const MuteOthersButton = styled.button`
    display: flex;
    padding: 8px 8px;
    margin-right: 6px;
    gap: 6px;
    font-family: 'Open Sans', sans-serif;
    font-size: 11px;
    font-weight: 600;
    line-height: 16px;
    color: var(--button-bg);
    align-items: center;

    border: none;
    background: none;
    border-radius: 4px;

    &:hover {
        background: rgba(var(--button-bg-rgb), 0.08);
    }

    i {
        font-size: 14px;
    }
`;

const CloseButton = styled.button`
    display: flex;
    align-items: center;
    justify-content: center;
    color: rgba(var(--center-channel-color-rgb), 0.56);
    width: 32px;
    height: 32px;
    border-radius: 4px;

    &:hover {
        background: rgba(var(--center-channel-color-rgb), 0.08);
        color: rgba(var(--center-channel-color-rgb), 0.72);
        fill: rgba(var(--center-channel-color-rgb), 0.72);
    }

    i {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 18px;
    }
`;

const CloseViewButton = styled.button`
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    padding: 10px;
    border-radius: 4px;

    svg {
        fill: rgba(255, 255, 255, 0.64);
    }

    &:hover {
        background: rgba(255, 255, 255, 0.08);

        svg {
            fill: rgba(255, 255, 255, 0.72);
        }
    }

    &:active {
        background: rgba(255, 255, 255, 0.16);

        svg {
            fill: rgba(255, 255, 255, 0.80);
        }
    }
`;

const SwitchViewButton = styled.button`
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    padding: 10px;
    border-radius: 4px;

    svg {
        fill: rgba(255, 255, 255, 0.64);
    }

    &:hover {
        background: rgba(255, 255, 255, 0.08);

        svg {
            fill: rgba(255, 255, 255, 0.72);
        }
    }

    &:active {
        background: rgba(255, 255, 255, 0.16);

        svg {
            fill: rgba(255, 255, 255, 0.80);
        }
    }
`;

const ReactionOverlay = styled.div`
    position: absolute;
    bottom: 96px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    pointer-events: none;
    z-index: 102;
`;

const LiveCaptionsOverlay = styled.div`
    position: absolute;
    width: calc(100%);
    display: flex;
    justify-content: center;
    bottom: 96px;
    z-index: auto;
`;

const LeaveCallButton = styled(DotMenuButton)`
    display: inline-flex;
    border: none;
    border-radius: 8px;
    padding: 12px;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    background: var(--dnd-indicator);
    width: unset;
    height: unset;

    &:hover {
        background: linear-gradient(0deg, var(--error-text), var(--error-text)), linear-gradient(0deg, rgba(0, 0, 0, 0.08), rgba(0, 0, 0, 0.08));
        background-blend-mode: multiply;
    }
`;

const StyledDropdownMenu = styled(DropdownMenu)`
    margin-bottom: 2px;
    border-radius: 8px;
`;

const VideoProfilesTopContainer = styled.div`
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 0px 20px 8px 20px;
`;

const VideoProfilesContainer = styled.div<{$height: string}>`
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    flex: 1;
    padding: 8px 20px;
    max-width: 100vw;

    ${({$height}) => $height && css`
      height: ${$height};
      max-height: ${$height};
    `}
`;

const VideoProfileContainer = styled.div<{$width?: string, $aspectRatio?: string}>`
  display: flex;
  position: relative;
  align-items: center;
  justify-content: center;
  background: black;
  border-radius: 8px;
  height: 100%;
  max-height: 100%;
  max-width: 100%;

  ${({$aspectRatio}) => $aspectRatio && css`
    aspect-ratio: ${$aspectRatio};
  `}

  ${({$width}) => $width && css`
      width: ${$width};
  `}
`;

const VideoProfilePlayer = styled.video<{$mirror: boolean}>`
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 8px;

  ${({$mirror}) => $mirror && css`
    transform: scaleX(-1);
  `}
`;

const VideoProfileState = styled.div`
  display: flex;
  position: absolute;
  bottom: 0;
  left: 0;
  align-items: center;
  justify-content: center;
  border-radius: 0px 4px;
  background: rgba(0, 0, 0, 0.80);
  padding: 4px 6px;
  gap: 2px;

  font-size: 12px;
  font-style: normal;
  font-weight: 600;
  line-height: 16px;
`;

type VideoProfileProps = {
    stream: MediaStream | null;
    profile: UserProfile;
    profileName: string;
    isMuted: boolean;
    hasVideo: boolean;
    isSpeaking: boolean;
    mirrorVideo: boolean;
    width?: string;
    aspectRatio?: string;
};

const VideoProfile = (props: VideoProfileProps) => {
    const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);

    const MuteIcon = props.isMuted ? MutedIcon : UnmutedIcon;

    useEffect(() => {
        if (videoEl && props.stream) {
            videoEl.srcObject = props.stream;
        }
    }, [props.stream, videoEl]);

    return (
        <VideoProfileContainer
            $width={props.width}
            $aspectRatio={props.aspectRatio}
        >
            {!props.hasVideo &&
            <Avatar
                size={80}
                border={false}
                url={Client4.getProfilePictureUrl(props.profile.id, props.profile.last_picture_update)}
                borderGlowWidth={props.isSpeaking ? 3 : 0}
                borderGlowColor='white'
            />
            }

            {props.hasVideo &&
            <VideoProfilePlayer
                ref={(el) => setVideoEl(el)}
                autoPlay={true}
                muted={true}
                $mirror={props.mirrorVideo}
            />
            }

            {props.isMuted &&
            <VideoProfileState>
                <MuteIcon
                    fill={'#FF585B'}
                    style={{
                        width: '14px',
                        height: '14px',
                    }}
                />
                {props.profileName}
            </VideoProfileState>
            }
        </VideoProfileContainer>
    );
};

