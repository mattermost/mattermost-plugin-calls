/* eslint-disable max-lines */

// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {mosThreshold} from '@calls/common';
import {
    UserSessionState,
} from '@calls/common/lib/types';
import {MediaControlBar, MediaController, MediaFullscreenButton} from 'media-chrome/dist/react';
import React from 'react';
import {IntlShape} from 'react-intl';
import {RouteComponentProps} from 'react-router-dom';
import {compareSemVer} from 'semver-parser';
import styled, {createGlobalStyle, css} from 'styled-components';

import {Channel} from '@mattermost/types/channels';
import {Post} from '@mattermost/types/posts';
import {Team} from '@mattermost/types/teams';
import {UserProfile} from '@mattermost/types/users';
import {Client4} from 'mattermost-redux/client';
import {Theme} from 'mattermost-redux/selectors/entities/preferences';
import {
    stopCallRecording,
} from 'src/actions';
import Avatar from 'src/components/avatar/avatar';
import Badge from 'src/components/badge';
import CallDuration from 'src/components/call_widget/call_duration';
import {Emoji} from 'src/components/emoji/emoji';
import ChatThreadIcon from 'src/components/icons/chat_thread';
import CollapseIcon from 'src/components/icons/collapse';
import CompassIcon from 'src/components/icons/compassIcon';
import HandEmoji from 'src/components/icons/hand';
import LeaveCallIcon from 'src/components/icons/leave_call_icon';
import MutedIcon from 'src/components/icons/muted_icon';
import ParticipantsIcon from 'src/components/icons/participants';
import RecordCircleIcon from 'src/components/icons/record_circle';
import RecordSquareIcon from 'src/components/icons/record_square';
import ScreenIcon from 'src/components/icons/screen_icon';
import ShareScreenIcon from 'src/components/icons/share_screen';
import UnmutedIcon from 'src/components/icons/unmuted_icon';
import UnshareScreenIcon from 'src/components/icons/unshare_screen';
import {ExpandedCallContainer} from 'src/components/incoming_calls/expanded_call_container';
import {ReactionStream} from 'src/components/reaction_stream/reaction_stream';
import {
    CallAlertConfigs,
} from 'src/constants';
import {logErr} from 'src/log';
import {
    MUTE_UNMUTE,
    RAISE_LOWER_HAND,
    SHARE_UNSHARE_SCREEN,
    PARTICIPANTS_LIST_TOGGLE,
    LEAVE_CALL,
    PUSH_TO_TALK,
    RECORDING_TOGGLE,
    keyToAction,
    reverseKeyMappings,
    MAKE_REACTION,
} from 'src/shortcuts';
import * as Telemetry from 'src/types/telemetry';
import {
    AudioDevices,
    CallAlertStates,
    CallAlertStatesDefault,
    CallRecordingReduxState,
} from 'src/types/types';
import {
    getUserDisplayName,
    getScreenStream,
    isDMChannel,
    hasExperimentalFlag,
    sendDesktopEvent,
    shouldRenderDesktopWidget,
    untranslatable,
    setCallsGlobalCSSVars,
    getCallsClient,
} from 'src/utils';

import CallParticipant from './call_participant';
import ControlsButton from './controls_button';
import GlobalBanner from './global_banner';
import {ReactionButton, ReactionButtonRef} from './reaction_button';
import RecordingInfoPrompt from './recording_info_prompt';
import './component.scss';

interface Props extends RouteComponentProps {
    intl: IntlShape,
    theme: Theme,
    show: boolean,
    currentUserID: string,
    currentTeamID: string,
    profiles: {
        [userID: string]: UserProfile,
    }
    sessions: UserSessionState[],
    currentSession?: UserSessionState,
    callStartAt: number,
    callHostID: string,
    callHostChangeAt: number,
    callRecording?: CallRecordingReduxState,
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
    trackEvent: (event: Telemetry.Event, source: Telemetry.Source, props?: Record<string, string>) => void,
    allowScreenSharing: boolean,
    recordingsEnabled: boolean,
    recordingMaxDuration: number,
    startCallRecording: (callID: string) => void,
    recordingPromptDismissedAt: (callID: string, dismissedAt: number) => void,
}

interface State {
    screenStream: MediaStream | null,
    showParticipantsList: boolean,
    alerts: CallAlertStates,
}

const StyledMediaController = styled(MediaController)`
    height: 100%;
    max-height: calc(100% - 32px);
    background-color: transparent;
`;

const StyledMediaControlBar = styled(MediaControlBar)`
    display: flex;
    flex-direction: row;
    justify-content: flex-end;
    background-color: rgba(0, 0, 0, 0.5);
`;

const StyledMediaFullscreenButton = styled(MediaFullscreenButton)`
    font-size: 18px;
    background-color: transparent;
`;

const MaxParticipantsPerRow = 4;

export default class ExpandedView extends React.PureComponent<Props, State> {
    private readonly emojiButtonRef: React.RefObject<ReactionButtonRef>;
    private expandedRootRef = React.createRef<HTMLDivElement>();
    private pushToTalk = false;
    private screenPlayer : HTMLVideoElement | null = null;

    #unlockNavigation?: () => void;

    private genStyle: () => Record<string, React.CSSProperties> = () => {
        setCallsGlobalCSSVars(this.props.theme.sidebarBg);

        return {
            root: {
                display: 'flex',
                width: '100%',
                height: '100%',
                zIndex: 1000,
                background: 'var(--calls-bg)',
                color: 'white',
                gridArea: 'center',
                overflow: 'auto',
            },
            main: {
                display: 'flex',
                flexDirection: 'column',
                flex: '1',
            },
            headerSpreader: {
                marginRight: 'auto',
            },
            closeViewButton: {
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '40px',
                height: '40px',
                borderRadius: '4px',
            },
            participants: {
                display: 'grid',
                overflow: 'auto',
                margin: 'auto',
                padding: '0',
            },
            controls: {
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '16px 8px',
                width: '100%',
            },
            centerControls: {
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
            },
            topContainer: {
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '16px',
                lineHeight: '24px',
                fontWeight: 600,
                height: '56px',
                padding: '0 20px',
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
                height: '63px',
                lineHeight: '63px',
            },
            centerView: {
                display: 'flex',
                flex: 1,
                overflow: 'auto',
                background: 'rgba(var(--button-color-rgb), 0.08)',
                borderRadius: '8px',
                margin: '0 12px',
            },
        };
    };

    private style = this.genStyle();

    constructor(props: Props) {
        super(props);
        this.emojiButtonRef = React.createRef();
        this.state = {
            screenStream: null,
            showParticipantsList: false,
            alerts: CallAlertStatesDefault,
        };

        if (window.opener) {
            const callsClient = window.opener.callsClient;
            callsClient?.on('close', () => window.close());

            // don't allow navigation in expanded window e.g. permalinks in rhs
            this.#unlockNavigation = props.history.block((tx) => {
                sendDesktopEvent('calls-link-click', {link: tx.pathname});
                return false;
            });

            // Set the inter-window actions
            window.callActions = {
                setRecordingPromptDismissedAt: this.props.recordingPromptDismissedAt,
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
            this.onRaiseHandToggle(true);
            break;
        case MAKE_REACTION:
            this.emojiButtonRef.current?.toggle();
            break;
        case SHARE_UNSHARE_SCREEN:
            this.onShareScreenToggle(true);
            break;
        case PARTICIPANTS_LIST_TOGGLE:
            this.onParticipantsListToggle(true);
            break;
        case LEAVE_CALL:
            this.onDisconnectClick();
            break;
        case RECORDING_TOGGLE:
            this.onRecordToggle(true);
            break;
        }
    };

    setDevices = (devices: AudioDevices) => {
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
            callsClient?.unmute();
        } else {
            callsClient?.mute();
        }
    };

    isMuted() {
        return this.props.currentSession ? !this.props.currentSession.unmuted : true;
    }

    isHandRaised() {
        return this.props.currentSession ? this.props.currentSession.raised_hand > 0 : false;
    }

    onRecordToggle = async (fromShortcut?: boolean) => {
        if (!this.props.channel) {
            logErr('channel should be defined');
            return;
        }

        if (this.props.isRecording) {
            await stopCallRecording(this.props.channel.id);
            this.props.trackEvent(Telemetry.Event.StopRecording, Telemetry.Source.ExpandedView, {initiator: fromShortcut ? 'shortcut' : 'button'});
        } else {
            await this.props.startCallRecording(this.props.channel.id);
            this.props.trackEvent(Telemetry.Event.StartRecording, Telemetry.Source.ExpandedView, {initiator: fromShortcut ? 'shortcut' : 'button'});
        }
    };

    onShareScreenToggle = async (fromShortcut?: boolean) => {
        if (!this.props.allowScreenSharing) {
            return;
        }
        const callsClient = getCallsClient();
        if (this.props.screenSharingSession && this.props.screenSharingSession?.session_id === this.props.currentSession?.session_id) {
            callsClient?.unshareScreen();
            this.setState({
                screenStream: null,
            });
            this.props.trackEvent(Telemetry.Event.UnshareScreen, Telemetry.Source.ExpandedView, {initiator: fromShortcut ? 'shortcut' : 'button'});
        } else if (!this.props.screenSharingSession) {
            if (window.desktop && compareSemVer(window.desktop.version, '5.1.0') >= 0) {
                this.props.showScreenSourceModal();
            } else if (shouldRenderDesktopWidget()) {
                sendDesktopEvent('desktop-sources-modal-request');
            } else {
                const state = {} as State;
                const stream = await getScreenStream('', hasExperimentalFlag());
                if (window.opener && stream) {
                    window.screenSharingTrackId = stream.getVideoTracks()[0].id;
                }
                if (stream) {
                    callsClient?.setScreenStream(stream);
                    state.screenStream = stream;

                    state.alerts = {
                        ...this.state.alerts,
                        missingScreenPermissions: {
                            ...this.state.alerts.missingScreenPermissions,
                            active: false,
                            show: false,
                        },
                    };
                } else {
                    state.alerts = {
                        ...this.state.alerts,
                        missingScreenPermissions: {
                            ...this.state.alerts.missingScreenPermissions,
                            active: true,
                            show: true,
                        },
                    };
                }

                this.setState(state);
            }
            this.props.trackEvent(Telemetry.Event.ShareScreen, Telemetry.Source.ExpandedView, {initiator: fromShortcut ? 'shortcut' : 'button'});
        }
    };

    onRaiseHandToggle = (fromShortcut?: boolean) => {
        const callsClient = getCallsClient();
        if (this.isHandRaised()) {
            this.props.trackEvent(Telemetry.Event.LowerHand, Telemetry.Source.ExpandedView, {initiator: fromShortcut ? 'shortcut' : 'button'});
            callsClient?.unraiseHand();
        } else {
            this.props.trackEvent(Telemetry.Event.RaiseHand, Telemetry.Source.ExpandedView, {initiator: fromShortcut ? 'shortcut' : 'button'});
            callsClient?.raiseHand();
        }
    };

    onParticipantsListToggle = (fromShortcut?: boolean) => {
        const event = this.state.showParticipantsList ? Telemetry.Event.CloseParticipantsList : Telemetry.Event.OpenParticipantsList;
        this.props.trackEvent(event, Telemetry.Source.ExpandedView, {initiator: fromShortcut ? 'shortcut' : 'button'});
        this.setState({
            showParticipantsList: !this.state.showParticipantsList,
        });
    };

    onCloseViewClick = () => {
        this.props.trackEvent(Telemetry.Event.CloseExpandedView, Telemetry.Source.ExpandedView, {initiator: 'button'});

        if (window.opener) {
            window.close();
            return;
        }

        this.props.hideExpandedView();
    };

    public componentDidUpdate(prevProps: Props, prevState: State) {
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

    public componentDidMount() {
        const callsClient = getCallsClient();
        if (!callsClient) {
            return;
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
        callsClient.on('devicechange', this.setDevices);
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

        this.setDevices(callsClient.getAudioDevices());

        const screenStream = callsClient.getLocalScreenStream() || callsClient.getRemoteScreenStream();

        // eslint-disable-next-line react/no-did-mount-set-state
        this.setState({
            alerts: {
                ...this.state.alerts,
                missingAudioInputPermissions: {
                    ...this.state.alerts.missingAudioInputPermissions,
                    active: !this.state.alerts.missingAudioInput.active && !callsClient.audioTrack,
                    show: !this.state.alerts.missingAudioInput.active && !callsClient.audioTrack,
                },
            },
            screenStream,
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
        }

        callsClient.on('mos', (mos: number) => {
            if (!this.state.alerts.degradedCallQuality.show && mos < mosThreshold) {
                this.setState({
                    alerts: {
                        ...this.state.alerts,
                        degradedCallQuality: {
                            active: true,
                            show: true,
                        },
                    }});
            }
            if (this.state.alerts.degradedCallQuality.show && mos >= mosThreshold) {
                this.setState({
                    alerts: {
                        ...this.state.alerts,
                        degradedCallQuality: {
                            active: false,
                            show: false,
                        },
                    }});
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
                };
            }

            return (
                <GlobalBanner
                    {...alertConfig}
                    icon={alertConfig.icon}
                    body={formatMessage(alertConfig.bannerText)}
                    onClose={onClose}
                />
            );
        }

        return null;
    };

    renderScreenSharingPlayer = () => {
        const isSharing = this.props.screenSharingSession?.session_id === this.props.currentSession?.session_id;
        const {formatMessage} = this.props.intl;

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
                    maxHeight: `calc(100vh - ${this.shouldRenderAlertBanner() ? 180 : 140}px)`,
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

    renderParticipants = () => {
        const {formatMessage} = this.props.intl;
        return this.props.sessions.map((session) => {
            const isMuted = !session.unmuted;
            const isSpeaking = Boolean(session.voice);
            const isHandRaised = Boolean(session.raised_hand > 0);
            const profile = this.props.profiles[session.user_id];

            if (!profile) {
                return null;
            }

            return (
                <CallParticipant
                    key={session.session_id}
                    name={`${getUserDisplayName(profile)} ${profile.id === this.props.currentUserID ? formatMessage({defaultMessage: '(you)'}) : ''}`}
                    pictureURL={Client4.getProfilePictureUrl(profile.id, profile.last_picture_update)}
                    isMuted={isMuted}
                    isSpeaking={isSpeaking}
                    isHandRaised={isHandRaised}
                    reaction={session?.reaction}
                    isHost={profile.id === this.props.callHostID}
                />
            );
        });
    };

    renderParticipantsRHSList = () => {
        const {formatMessage} = this.props.intl;
        return this.props.sessions.map((session) => {
            const isMuted = !session.unmuted;
            const isSpeaking = Boolean(session.voice);
            const isHandRaised = Boolean(session.raised_hand > 0);
            const profile = this.props.profiles[session.user_id];

            if (!profile) {
                return null;
            }

            const MuteIcon = isMuted ? MutedIcon : UnmutedIcon;

            return (
                <li
                    key={'participants_rhs_profile_' + session.session_id}
                    style={{display: 'flex', alignItems: 'center', padding: '8px 16px', gap: '8px'}}
                >
                    <Avatar
                        size={24}
                        fontSize={10}
                        border={false}
                        borderGlowWidth={isSpeaking ? 2 : 0}
                        url={Client4.getProfilePictureUrl(profile.id, profile.last_picture_update)}
                    />

                    <span style={{fontWeight: 600, fontSize: '14px', lineHeight: '20px'}}>
                        {getUserDisplayName(profile)} {profile.id === this.props.currentUserID && formatMessage({defaultMessage: '(you)'})}
                    </span>

                    <div
                        style={{
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center',
                            marginLeft: 'auto',
                            gap: '12px',
                        }}
                    >
                        {session?.reaction &&
                            <div
                                style={{
                                    marginBottom: 4,
                                    marginRight: 2,
                                }}
                            >
                                <Emoji
                                    emoji={session.reaction.emoji}
                                    size={16}
                                />
                            </div>
                        }
                        {isHandRaised &&
                            <HandEmoji
                                style={{
                                    fill: 'var(--away-indicator)',
                                    width: '16px',
                                    height: '16px',
                                }}
                            />
                        }

                        {this.props.screenSharingSession?.session_id === session.session_id &&
                            <ScreenIcon
                                fill={'rgb(var(--dnd-indicator-rgb))'}
                                style={{width: '16px', height: '16px'}}
                            />
                        }

                        <MuteIcon
                            fill={isMuted ? '#C4C4C4' : '#3DB887'}
                            style={{width: '16px', height: '16px'}}
                        />

                    </div>
                </li>
            );
        });
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
            <Badge
                id={'calls-recording-badge'}
                text={'REC'}
                textSize={12}
                gap={6}
                margin={'0 12px 0 0'}
                padding={'8px 6px'}
                icon={(<RecordCircleIcon style={{width: '12px', height: '12px'}}/>)}
                bgColor={hasRecStarted ? '#D24B4E' : 'rgba(221, 223, 228, 0.04)'}
                loading={!hasRecStarted}
            />
        );
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

        let muteTooltipText = isMuted ? formatMessage({defaultMessage: 'Unmute'}) : formatMessage({defaultMessage: 'Mute'});
        let muteTooltipSubtext = '';

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

        const isRecording = isHost && this.props.isRecording;

        const recordTooltipText = isRecording ? formatMessage({defaultMessage: 'Stop recording'}) : formatMessage({defaultMessage: 'Record call'});
        const RecordIcon = isRecording ? RecordSquareIcon : RecordCircleIcon;
        const ShareIcon = isSharing ? UnshareScreenIcon : ShareScreenIcon;

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

                    <div style={this.style.topContainer}>
                        {this.renderRecordingBadge()}
                        <CallDuration
                            style={{margin: '4px'}}
                            startAt={this.props.callStartAt}
                        />
                        <span style={{margin: '4px'}}>{untranslatable('•')}</span>
                        <span style={{margin: '4px', whiteSpace: 'nowrap'}}>
                            {formatMessage({defaultMessage: '{count, plural, =1 {# participant} other {# participants}}'}, {count: this.props.sessions.length})}
                        </span>

                        <div style={this.style.headerSpreader}/>
                        <ExpandedCallContainer/>
                        <button
                            className='button-close'
                            style={this.style.closeViewButton}
                            onClick={this.onCloseViewClick}
                        >
                            <CollapseIcon
                                style={{
                                    width: '24px',
                                    height: '24px',
                                    fill: 'white',
                                }}
                            />
                        </button>
                    </div>

                    {!this.props.screenSharingSession &&
                        <div style={this.style.centerView}>
                            <ul
                                id='calls-expanded-view-participants-grid'
                                style={{
                                    ...this.style.participants,
                                    gridTemplateColumns: `repeat(${Math.min(this.props.sessions.length, MaxParticipantsPerRow)}, 1fr)`,
                                }}
                            >
                                {this.renderParticipants()}
                            </ul>
                        </div>
                    }
                    {this.props.screenSharingSession && this.renderScreenSharingPlayer()}
                    <div
                        id='calls-expanded-view-controls'
                        style={this.style.controls}
                    >
                        <div style={{flex: '1', display: 'flex', justifyContent: 'flex-start', marginLeft: '16px'}}>
                            <ControlsButton
                                id='calls-popout-participants-button'
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
                                            width: '28px',
                                            height: '28px',
                                        }}
                                    />
                                }
                                margin='0'
                            />
                        </div>

                        <div style={this.style.centerControls}>
                            <ControlsButton
                                id='calls-popout-mute-button'
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
                                            width: '28px',
                                            height: '28px',
                                        }}
                                    />
                                }
                                unavailable={noInputDevices || noAudioPermissions}
                            />

                            {this.props.allowScreenSharing &&
                                <ControlsButton
                                    id='calls-popout-screenshare-button'
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
                                                width: '28px',
                                                height: '28px',
                                            }}
                                        />
                                    }
                                    unavailable={noScreenPermissions}
                                    disabled={Boolean(sharingID) && !isSharing}
                                />
                            }

                            {isHost && this.props.recordingsEnabled &&
                                <ControlsButton
                                    id='calls-popout-record-button'
                                    onToggle={() => this.onRecordToggle()}
                                    tooltipText={recordTooltipText}
                                    // eslint-disable-next-line no-undefined
                                    shortcut={reverseKeyMappings.popout[RECORDING_TOGGLE][0]}
                                    bgColor={isRecording ? 'rgba(var(--dnd-indicator-rgb), 0.16)' : ''}
                                    bgColorHover={isRecording ? 'rgba(var(--dnd-indicator-rgb), 0.20)' : ''}
                                    iconFill={isRecording ? 'rgba(var(--dnd-indicator-rgb), 0.80)' : ''}
                                    iconFillHover={isRecording ? 'var(--dnd-indicator)' : ''}
                                    icon={<RecordIcon style={{width: '28px', height: '28px'}}/>}
                                />
                            }

                            <ReactionButton
                                ref={this.emojiButtonRef}
                                trackEvent={this.props.trackEvent}
                                isHandRaised={this.isHandRaised()}
                            />

                            {globalRhsSupported && (
                                <ControlsButton
                                    id='calls-popout-chat-button'
                                    onToggle={this.toggleChat}
                                    tooltipText={chatToolTipText}
                                    tooltipSubtext={chatToolTipSubtext}
                                    bgColor={showChatThread ? 'white' : ''}
                                    bgColorHover={showChatThread ? 'rgba(255, 255, 255, 0.92)' : ''}
                                    iconFill={showChatThread ? 'rgba(var(--calls-bg-rgb), 0.80)' : ''}
                                    iconFillHover={showChatThread ? 'var(--calls-bg)' : ''}
                                    icon={
                                        <div style={{position: 'relative'}}>
                                            <ChatThreadIcon
                                                style={{width: '28px', height: '28px'}}
                                            />
                                            {!chatDisabled && isChatUnread && (
                                                <UnreadIndicator mentions={this.props.threadUnreadMentions}/>
                                            )}
                                        </div>
                                    }
                                    unavailable={chatDisabled}
                                />
                            )}
                        </div>
                        <div style={{flex: '1', display: 'flex', justifyContent: 'flex-end', marginRight: '16px'}}>
                            <ControlsButton
                                id='calls-popout-leave-button'
                                onToggle={() => this.onDisconnectClick()}
                                tooltipText={formatMessage({defaultMessage: 'Leave call'})}
                                shortcut={reverseKeyMappings.popout[LEAVE_CALL][0]}
                                bgColor={'var(--dnd-indicator)'}
                                bgColorHover={'var(--dnd-indicator)'}
                                iconFill={'rgba(255, 255, 255, 0.80)'}
                                iconFillHover={'white'}
                                icon={
                                    <LeaveCallIcon
                                        style={{width: '28px', height: '28px'}}
                                    />
                                }
                                margin='0'
                            />
                        </div>
                    </div>
                </div>
                {this.state.showParticipantsList &&
                    <ul style={this.style.rhs}>
                        <div style={this.style.rhsHeaderContainer}>
                            <div style={this.style.rhsHeader}>
                                <span>{formatMessage({defaultMessage: 'Participants'})}</span>
                                <CloseButton
                                    className='style--none'
                                    onClick={() => this.onParticipantsListToggle()}
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

                <Overlay>
                    <ReactionStream/>
                    <RecordingInfoPrompt
                        isHost={this.props.callHostID === this.props.currentUserID}
                        hostChangeAt={this.props.callHostChangeAt}
                        recording={this.props.callRecording}
                        recordingMaxDuration={this.props.recordingMaxDuration}
                        onDecline={this.onDisconnectClick}
                        promptDismissed={this.dismissRecordingPrompt}
                    />
                </Overlay>
            </div>
        );
    }
}

const isActiveElementInteractable = () => {
    return document.activeElement && ['INPUT', 'SELECT', 'BUTTON', 'TEXTAREA'].includes(document.activeElement.tagName);
};

const UnreadIndicator = ({mentions}: { mentions?: number }) => {
    return (
        <UnreadDot>
            { mentions &&
            <MentionsCounter>{mentions > 99 ? untranslatable('99+') : mentions}</MentionsCounter>
            }
        </UnreadDot>
    );
};

const MentionsCounter = styled.span`
    font-weight: 700;
    font-size: 8px;
    color: var(--button-color);
`;

const UnreadDot = styled.span`
    position: absolute;
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1;
    top: -4px;
    right: -4px;
    width: 15px;
    height: 12px;
    background: var(--button-bg);
    border-radius: 8px;
    border: 2px solid white;
`;

const ExpandedViewGlobalsStyle = createGlobalStyle<{ callThreadSelected: boolean }>`
    #root {
        > #global-header,
        > .team-sidebar,
        > .app-bar,
        > #channel_view .channel__wrap,
        > #SidebarContainer {
            display: none;
        }

        #sidebar-right #sbrSearchFormContainer {
            // mobile search not supported in expanded view or expanded window
            // TODO move to hideMobileSearchBarInRHS prop of Search component in mattermost-webapp
            display: none;
        }

        .channel-view-inner {
            padding: 0;
        }

        ${({callThreadSelected}) => !callThreadSelected && css`
            .sidebar--right {
                display: none;
            }
        `}
    }

    #sidebar-right {
        z-index: 1001;
    }
`;

const CloseButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  margin-left: auto;
  color: rgba(var(--center-channel-color-rgb), 0.56);
  width: 32px;
  height: 32px;
  border-radius: 4px;

  :hover {
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

const Overlay = styled.div`
  position: absolute;
  bottom: 96px;
  display: flex;
  flex-direction: column;
  gap: 12px;
`;
