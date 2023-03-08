/* eslint-disable max-lines */

// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import {compareSemVer} from 'semver-parser';
import {MediaControlBar, MediaController, MediaFullscreenButton} from 'media-chrome/dist/react';

import {UserProfile} from '@mattermost/types/users';
import {Team} from '@mattermost/types/teams';
import {Channel} from '@mattermost/types/channels';
import {Post} from '@mattermost/types/posts';
import {Theme} from 'mattermost-redux/types/themes';

import styled, {createGlobalStyle, css, CSSObject} from 'styled-components';

import {
    ProductChannelsIcon,
    RecordCircleOutlineIcon,
    RecordSquareOutlineIcon,
} from '@mattermost/compass-icons/components';

import {RouteComponentProps} from 'react-router-dom';

import {
    getUserDisplayName,
    getScreenStream,
    isDMChannel,
    hasExperimentalFlag,
    sendDesktopEvent,
    shouldRenderDesktopWidget,
    hexToRGB,
    rgbToHSL,
    hslToRGB,
    rgbToCSS,
} from 'src/utils';
import {
    UserState,
    AudioDevices,
    CallAlertStates,
    CallAlertStatesDefault,
    CallRecordingState,
} from 'src/types/types';

import {
    CallAlertConfigs,
} from 'src/constants';

import {
    stopCallRecording,
} from 'src/actions';

import * as Telemetry from 'src/types/telemetry';
import Avatar from 'src/components/avatar/avatar';
import {ReactionStream} from 'src/components/reaction_stream/reaction_stream';
import CompassIcon from 'src/components/icons/compassIcon';
import LeaveCallIcon from 'src/components/icons/leave_call_icon';
import MutedIcon from 'src/components/icons/muted_icon';
import UnmutedIcon from 'src/components/icons/unmuted_icon';
import ScreenIcon from 'src/components/icons/screen_icon';
import ParticipantsIcon from 'src/components/icons/participants';
import CallDuration from 'src/components/call_widget/call_duration';
import Badge from 'src/components/badge';

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

import RecordingInfoPrompt from './recording_info_prompt';

import GlobalBanner from './global_banner';
import ControlsButton from './controls_button';
import CallParticipant from './call_participant';

import './component.scss';
import {ReactionButton, ReactionButtonRef} from './reaction_button';

interface Props extends RouteComponentProps {
    theme: Theme,
    show: boolean,
    currentUserID: string,
    currentTeamID: string,
    profiles: UserProfile[],
    pictures: {
        [key: string]: string,
    },
    statuses: {
        [key: string]: UserState,
    },
    callStartAt: number,
    callHostID: string,
    callHostChangeAt: number,
    callRecording?: CallRecordingState,
    hideExpandedView: () => void,
    showScreenSourceModal: () => void,
    selectRhsPost?: (postID: string) => void,
    prefetchThread: (postId: string) => void,
    closeRhs?: () => void,
    isRhsOpen?: boolean,
    screenSharingID: string,
    channel: Channel,
    channelTeam: Team,
    channelURL: string;
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
}

interface State {
    screenStream: MediaStream | null,
    showParticipantsList: boolean,
    alerts: CallAlertStates,
}

const StyledMediaController = styled(MediaController)`
    height: 100%;
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
    private readonly screenPlayer = React.createRef<HTMLVideoElement>();
    private readonly emojiButtonRef: React.RefObject<ReactionButtonRef>;
    private expandedRootRef = React.createRef<HTMLDivElement>();
    private pushToTalk = false;

    #unlockNavigation?: () => void;

    private genStyle: () => Record<string, React.CSSProperties> = () => {
        // Base color is Sidebar Hover Background.
        const baseColorHSL = rgbToHSL(hexToRGB(this.props.theme.sidebarTextHoverBg));

        // Setting lightness to 16 to improve contrast.
        baseColorHSL.l = 16;
        const baseColorRGB = hslToRGB(baseColorHSL);

        return {
            root: {
                display: 'flex',
                width: '100%',
                height: '100%',
                zIndex: 1000,
                background: rgbToCSS(baseColorRGB),
                color: 'white',
                gridArea: 'center',
                overflow: 'auto',
            },
            main: {
                display: 'flex',
                flexDirection: 'column',
                flex: '1',
            },
            closeViewButton: {
                fontSize: '24px',
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
                width: '100%',
            },
            topLeftContainer: {
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '16px',
                lineHeight: '24px',
                fontWeight: 600,
                marginLeft: '12px',
                height: '56px',
            },
            screenContainer: {
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                margin: 'auto',
                maxWidth: 'calc(100% - 16px)',
            },
            rhs: {
                display: 'flex',
                flexDirection: 'column',
                width: '280px',
                background: this.props.theme.centerChannelBg,
                color: this.props.theme.centerChannelColor,
                margin: 0,
                padding: 0,
                overflow: 'auto',
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
                background: 'rgb(255, 255, 255, 0.08)',
                borderRadius: '8px',
                margin: '0 12px',
            },
        };
    }

    private style = this.genStyle();

    constructor(props: Props) {
        super(props);
        this.screenPlayer = React.createRef();
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

    getCallsClient = () => {
        return window.opener ? window.opener.callsClient : window.callsClient;
    };

    handleBlur = () => {
        if (this.pushToTalk) {
            this.getCallsClient()?.mute();
            this.pushToTalk = false;
            this.forceUpdate();
        }
    };

    handleKeyUp = (ev: KeyboardEvent) => {
        if (isActiveElementInteractable() && !this.expandedRootRef.current?.contains(document.activeElement)) {
            return;
        }

        if (keyToAction('popout', ev) === PUSH_TO_TALK && this.pushToTalk) {
            this.getCallsClient()?.mute();
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
            this.getCallsClient()?.unmute();
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
        const callsClient = this.getCallsClient();
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
        const callsClient = this.getCallsClient();
        if (callsClient?.isMuted()) {
            callsClient.unmute();
        } else {
            callsClient?.mute();
        }
    };

    onRecordToggle = async (fromShortcut?: boolean) => {
        if (!this.props.callRecording || this.props.callRecording.end_at > 0) {
            await this.props.startCallRecording(this.props.channel.id);
            this.props.trackEvent(Telemetry.Event.StartRecording, Telemetry.Source.ExpandedView, {initiator: fromShortcut ? 'shortcut' : 'button'});
        } else {
            await stopCallRecording(this.props.channel.id);
            this.props.trackEvent(Telemetry.Event.StopRecording, Telemetry.Source.ExpandedView, {initiator: fromShortcut ? 'shortcut' : 'button'});
        }
    };

    onShareScreenToggle = async (fromShortcut?: boolean) => {
        if (!this.props.allowScreenSharing) {
            return;
        }
        const callsClient = this.getCallsClient();
        if (this.props.screenSharingID === this.props.currentUserID) {
            callsClient?.unshareScreen();
            this.setState({
                screenStream: null,
            });
            this.props.trackEvent(Telemetry.Event.UnshareScreen, Telemetry.Source.ExpandedView, {initiator: fromShortcut ? 'shortcut' : 'button'});
        } else if (!this.props.screenSharingID) {
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
        const callsClient = this.getCallsClient();
        if (callsClient?.isHandRaised) {
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
        if (window.opener) {
            return;
        }

        // This desktop (pre-global widget)'s window.
        this.props.trackEvent(Telemetry.Event.CloseExpandedView, Telemetry.Source.ExpandedView, {initiator: 'button'});
        this.props.hideExpandedView();
    };

    public componentDidUpdate(prevProps: Props) {
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

        if (this.state.screenStream && this.screenPlayer.current && this.screenPlayer.current?.srcObject !== this.state.screenStream) {
            this.screenPlayer.current.srcObject = this.state.screenStream;
        }

        const localScreenStream = this.getCallsClient()?.getLocalScreenStream();
        if (localScreenStream && this.state.screenStream?.getVideoTracks()[0].id !== localScreenStream.getVideoTracks()[0].id) {
            // eslint-disable-next-line react/no-did-update-set-state
            this.setState({screenStream: localScreenStream});
        }
    }

    public componentDidMount() {
        const callsClient = this.getCallsClient();
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
    }

    toggleChat = async () => {
        if (this.props.isRhsOpen && this.props.rhsSelectedThreadID === this.props.threadID) {
            // close rhs
            this.props.closeRhs?.();
        } else if (this.props.channel.team_id && this.props.channel.team_id !== this.props.currentTeamID) {
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

    shouldRenderAlertBanner = () => {
        return Object.entries(this.state.alerts).filter((kv) => kv[1].show).length > 0;
    };

    renderAlertBanner = () => {
        for (const keyVal of Object.entries(this.state.alerts)) {
            const [alertID, alertState] = keyVal;
            if (!alertState.show) {
                continue;
            }

            const alertConfig = CallAlertConfigs[alertID];

            return (
                <GlobalBanner
                    {...alertConfig}
                    icon={alertConfig.icon}
                    body={alertConfig.bannerText}
                    onClose={() => {
                        this.setState({
                            alerts: {
                                ...this.state.alerts,
                                [alertID]: {
                                    ...alertState,
                                    show: false,
                                },
                            },
                        });
                    }}
                />
            );
        }

        return null;
    };

    renderScreenSharingPlayer = () => {
        const isSharing = this.props.screenSharingID === this.props.currentUserID;

        let profile;
        if (!isSharing) {
            for (let i = 0; i < this.props.profiles.length; i++) {
                if (this.props.profiles[i].id === this.props.screenSharingID) {
                    profile = this.props.profiles[i];
                    break;
                }
            }
            if (!profile) {
                return null;
            }
        }

        const msg = isSharing ? 'You are sharing your screen' : `You are viewing ${getUserDisplayName(profile as UserProfile)}'s screen`;

        return (
            <div
                style={{
                    ...this.style.screenContainer,

                    // Account for when we display an alert banner.
                    maxHeight: `calc(100% - ${this.shouldRenderAlertBanner() ? 240 : 200}px)`,
                }}
            >
                <StyledMediaController
                    gesturesDisabled={true}
                >
                    <video
                        id='screen-player'
                        slot='media'
                        ref={this.screenPlayer}
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
                <span
                    style={{
                        background: 'black',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        color: 'white',
                        marginTop: '8px',
                    }}
                >
                    {msg}
                </span>
                <ReactionStream forceLeft={true}/>
            </div>
        );
    };

    renderParticipants = () => {
        return this.props.profiles.map((profile) => {
            const status = this.props.statuses[profile.id];

            let isMuted = true;
            let isSpeaking = false;
            let isHandRaised = false;
            if (status) {
                isMuted = !status.unmuted;
                isSpeaking = Boolean(status.voice);
                isHandRaised = Boolean(status.raised_hand > 0);
            }

            return (
                <CallParticipant
                    key={profile.id}
                    name={`${getUserDisplayName(profile)}${profile.id === this.props.currentUserID ? ' (you)' : ''}`}
                    pictureURL={this.props.pictures[profile.id]}
                    isMuted={isMuted}
                    isSpeaking={isSpeaking}
                    isHandRaised={isHandRaised}
                    reaction={status?.reaction}
                    isHost={profile.id === this.props.callHostID}
                />
            );
        });
    };

    renderParticipantsRHSList = () => {
        return this.props.profiles.map((profile) => {
            const status = this.props.statuses[profile.id];
            let isMuted = true;
            let isSpeaking = false;
            let isHandRaised = false;
            if (status) {
                isMuted = !status.unmuted;
                isSpeaking = Boolean(status.voice);
                isHandRaised = Boolean(status.raised_hand > 0);
            }

            const MuteIcon = isMuted ? MutedIcon : UnmutedIcon;

            return (
                <li
                    key={'participants_rhs_profile_' + profile.id}
                    style={{display: 'flex', alignItems: 'center', padding: '8px 16px'}}
                >
                    <Avatar
                        size={24}
                        fontSize={10}
                        border={false}
                        borderGlow={isSpeaking}
                        url={this.props.pictures[profile.id]}
                        style={{
                            marginRight: '8px',
                        }}
                    />
                    <span style={{fontWeight: 600, fontSize: '14px', lineHeight: '20px', margin: '8px 0'}}>
                        {getUserDisplayName(profile)}{profile.id === this.props.currentUserID && ' (you)'}
                    </span>

                    <div
                        style={{
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center',
                            marginLeft: 'auto',
                            gap: '4px',
                        }}
                    >
                        {isHandRaised &&
                            <CompassIcon
                                icon={'hand-right'}
                                style={{
                                    color: 'rgb(255, 188, 66)',
                                    marginBottom: 2,
                                    fontSize: 16,
                                }}
                            />
                        }

                        {this.props.screenSharingID === profile.id &&
                            <ScreenIcon
                                fill={'rgb(var(--dnd-indicator-rgb))'}
                                style={{width: '14px', height: '14px'}}
                            />
                        }

                        <MuteIcon
                            fill={isMuted ? '#C4C4C4' : '#3DB887'}
                            style={{width: '14px', height: '14px'}}
                            stroke={isMuted ? '#C4C4C4' : ''}
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
                icon={(<RecordCircleOutlineIcon size={12}/>)}
                bgColor={hasRecStarted ? '#D24B4E' : 'rgba(221, 223, 228, 0.04)'}
                loading={!hasRecStarted}
            />
        );
    };

    render() {
        if ((!this.props.show || !window.callsClient) && !window.opener) {
            return null;
        }

        const callsClient = this.getCallsClient();
        if (!callsClient) {
            return null;
        }

        const noInputDevices = this.state.alerts.missingAudioInput.active;
        const noAudioPermissions = this.state.alerts.missingAudioInputPermissions.active;
        const noScreenPermissions = this.state.alerts.missingScreenPermissions.active;
        const isMuted = callsClient.isMuted();
        const MuteIcon = isMuted && !noInputDevices && !noAudioPermissions ? MutedIcon : UnmutedIcon;

        let muteTooltipText = isMuted ? 'Click to unmute' : 'Click to mute';
        let muteTooltipSubtext = '';
        if (noInputDevices) {
            muteTooltipText = CallAlertConfigs.missingAudioInput.tooltipText;
            muteTooltipSubtext = CallAlertConfigs.missingAudioInput.tooltipSubtext;
        }
        if (noAudioPermissions) {
            muteTooltipText = CallAlertConfigs.missingAudioInputPermissions.tooltipText;
            muteTooltipSubtext = CallAlertConfigs.missingAudioInputPermissions.tooltipSubtext;
        }

        const sharingID = this.props.screenSharingID;
        const currentID = this.props.currentUserID;
        const isSharing = sharingID === currentID;

        let shareScreenTooltipText = isSharing ? 'Stop presenting' : 'Start presenting';
        if (noScreenPermissions) {
            shareScreenTooltipText = CallAlertConfigs.missingScreenPermissions.tooltipText;
        }
        const shareScreenTooltipSubtext = noScreenPermissions ? CallAlertConfigs.missingScreenPermissions.tooltipSubtext : '';

        const participantsText = this.state.showParticipantsList ? 'Hide participants list' : 'Show participants list';

        let chatToolTipText = this.props.isRhsOpen && this.props.rhsSelectedThreadID === this.props.threadID ? 'Click to close chat' : 'Click to open chat';
        const chatToolTipSubtext = '';
        const chatDisabled = Boolean(this.props.channel?.team_id) && this.props.channel.team_id !== this.props.currentTeamID;
        if (chatDisabled) {
            chatToolTipText = `Chat unavailable: different team selected. Click here to switch back to ${this.props.channelDisplayName} in ${this.props.channelTeam.display_name}.`;
        }

        const globalRhsSupported = Boolean(this.props.selectRhsPost);

        const isChatUnread = Boolean(this.props.threadUnreadReplies);

        const isHost = this.props.callHostID === this.props.currentUserID;
        const isRecording = isHost && this.props.callRecording && this.props.callRecording.init_at > 0 && !this.props.callRecording.end_at && !this.props.callRecording.err;
        const recordTooltipText = isRecording ? 'Stop recording' : 'Record call';
        const RecordIcon = isRecording ? RecordSquareOutlineIcon : RecordCircleOutlineIcon;

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
                        <div style={this.style.topLeftContainer}>
                            {this.renderRecordingBadge()}
                            <CallDuration
                                style={{margin: '4px'}}
                                startAt={this.props.callStartAt}
                            />
                            <span style={{margin: '4px'}}>{'•'}</span>
                            <span style={{margin: '4px'}}>{`${this.props.profiles.length} participants`}</span>
                            <span style={{flex: 1}}/>
                        </div>
                        {
                            !window.opener &&
                            <button
                                className='button-close'
                                style={this.style.closeViewButton}
                                onClick={this.onCloseViewClick}
                            >
                                <CompassIcon icon='arrow-collapse'/>
                            </button>
                        }
                    </div>

                    {!this.props.screenSharingID &&
                        <div style={this.style.centerView}>
                            <ReactionStream/>
                            <ul
                                id='calls-expanded-view-participants-grid'
                                style={{
                                    ...this.style.participants,
                                    gridTemplateColumns: `repeat(${Math.min(this.props.profiles.length, MaxParticipantsPerRow)}, 1fr)`,
                                }}
                            >
                                {this.renderParticipants()}
                            </ul>
                        </div>
                    }
                    {this.props.screenSharingID && this.renderScreenSharingPlayer()}
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
                                bgColor={this.state.showParticipantsList ? 'rgba(28, 88, 217, 0.32)' : ''}
                                icon={
                                    <ParticipantsIcon
                                        style={{
                                            width: '24px',
                                            height: '24px',
                                            fill: this.state.showParticipantsList ? 'rgb(28, 88, 217)' : 'white',
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
                                icon={
                                    <MuteIcon
                                        style={{
                                            width: '24px',
                                            height: '24px',
                                            fill: isMuted ? '' : 'rgba(61, 184, 135, 1)',
                                        }}
                                    />
                                }
                                unavailable={noInputDevices || noAudioPermissions}
                            />

                            {isHost && this.props.recordingsEnabled &&
                                <ControlsButton
                                    id='calls-popout-record-button'
                                    onToggle={() => this.onRecordToggle()}
                                    tooltipText={recordTooltipText}
                                    bgColor={isRecording ? 'rgba(var(--dnd-indicator-rgb), 0.12)' : ''}
                                    // eslint-disable-next-line no-undefined
                                    shortcut={reverseKeyMappings.popout[RECORDING_TOGGLE][0]}
                                    iconFill={isRecording ? 'rgb(var(--dnd-indicator-rgb))' : ''}
                                    icon={<RecordIcon size={24}/>}
                                />
                            }

                            {this.props.allowScreenSharing &&
                                <ControlsButton
                                    id='calls-popout-screenshare-button'
                                    onToggle={() => this.onShareScreenToggle()}
                                    tooltipText={shareScreenTooltipText}
                                    tooltipSubtext={shareScreenTooltipSubtext}
                                    // eslint-disable-next-line no-undefined
                                    shortcut={noScreenPermissions ? undefined : reverseKeyMappings.popout[SHARE_UNSHARE_SCREEN][0]}
                                    bgColor={isSharing ? 'rgba(var(--dnd-indicator-rgb), 0.12)' : ''}
                                    icon={
                                        <ScreenIcon
                                            style={{
                                                width: '24px',
                                                height: '24px',
                                                fill: isSharing ? 'rgb(var(--dnd-indicator-rgb))' : '',
                                            }}
                                        />
                                    }
                                    unavailable={noScreenPermissions}
                                    disabled={sharingID !== '' && !isSharing}
                                />
                            }

                            <ReactionButton
                                ref={this.emojiButtonRef}
                                trackEvent={this.props.trackEvent}
                            />

                            {globalRhsSupported && (
                                <ControlsButton
                                    id='calls-popout-chat-button'
                                    onToggle={this.toggleChat}
                                    tooltipText={chatToolTipText}
                                    tooltipSubtext={chatToolTipSubtext}
                                    // eslint-disable-next-line no-undefined
                                    shortcut={undefined}
                                    bgColor={''}
                                    icon={
                                        <div css={{position: 'relative'}}>
                                            <ProductChannelsIcon // TODO use 'icon-message-text-outline' once added
                                                size={24}
                                                color={'white'}
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
                                tooltipText={'Leave call'}
                                shortcut={reverseKeyMappings.popout[LEAVE_CALL][0]}
                                bgColor={'rgb(var(--dnd-indicator-rgb))'}
                                icon={
                                    <LeaveCallIcon
                                        style={{width: '24px', height: '24px', fill: 'white'}}
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
                                <span>{'Participants'}</span>
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

                <RecordingInfoPrompt
                    isHost={this.props.callHostID === this.props.currentUserID}
                    hostChangeAt={this.props.callHostChangeAt}
                    recording={this.props.callRecording}
                    recordingMaxDuration={this.props.recordingMaxDuration}
                    onDecline={this.onDisconnectClick}
                />
            </div>
        );
    }
}

const isActiveElementInteractable = () => {
    return document.activeElement && ['INPUT', 'SELECT', 'BUTTON', 'TEXTAREA'].includes(document.activeElement.tagName);
};

const UnreadIndicator = ({mentions}: { mentions?: number }) => {
    return (
        <UnreadDot>{mentions && mentions > 99 ? '99+' : mentions || null}</UnreadDot>
    );
};

const UnreadDot = styled.span`
    position: absolute;
    z-index: 1;
    top: 0;
    right: -1px;
    width: 8px;
    height: 8px;
    background: var(--mention-bg);
    border-radius: 9px;
    box-shadow: 0 0 0 2px rgb(37 38 42);
    color: white;

    &:not(:empty) {
        top: -7px;
        right: -8px;
        width: auto;
        min-width: 20px;
        height: auto;
        padding: 0 6px;
        border-radius: 8px;
        font-size: 11px;
        -webkit-font-smoothing: subpixel-antialiased;
        -moz-osx-font-smoothing: grayscale;
        font-weight: 700;
        letter-spacing: 0;
        line-height: 16px;
        text-align: center;
    }
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
