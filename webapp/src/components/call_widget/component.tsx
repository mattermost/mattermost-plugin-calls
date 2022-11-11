import React, {CSSProperties} from 'react';
import {OverlayTrigger, Tooltip} from 'react-bootstrap';
import {compareSemVer} from 'semver-parser';

import {UserProfile} from '@mattermost/types/users';
import {Channel} from '@mattermost/types/channels';
import {Team} from '@mattermost/types/teams';
import {IDMappedObjects} from '@mattermost/types/utilities';

import {changeOpacity} from 'mattermost-redux/utils/theme_utils';
import {isDirectChannel, isGroupChannel, isOpenChannel, isPrivateChannel} from 'mattermost-redux/utils/channel_utils';
import {Theme} from 'mattermost-redux/types/themes';

import {RecordCircleOutlineIcon} from '@mattermost/compass-icons/components';

import {
    UserState,
    AudioDevices,
    CallAlertStates,
    CallAlertStatesDefault,
    CallRecordingState,
} from 'src/types/types';
import * as Telemetry from 'src/types/telemetry';
import {
    getUserDisplayName,
    hasExperimentalFlag,
    getPopOutURL,
    sendDesktopEvent,
} from 'src/utils';
import {
    MUTE_UNMUTE,
    RAISE_LOWER_HAND,
    SHARE_UNSHARE_SCREEN,
    PARTICIPANTS_LIST_TOGGLE,
    LEAVE_CALL,
    keyToAction,
    reverseKeyMappings,
} from 'src/shortcuts';
import {
    CallAlertConfigs,
    CallRecordingDisclaimerStrings,
} from 'src/constants';

import {logDebug, logErr} from 'src/log';

import Avatar from '../avatar/avatar';
import MutedIcon from '../../components/icons/muted_icon';
import UnmutedIcon from '../../components/icons/unmuted_icon';
import LeaveCallIcon from '../../components/icons/leave_call_icon';
import HorizontalDotsIcon from '../../components/icons/horizontal_dots';
import ParticipantsIcon from '../../components/icons/participants';
import ShowMoreIcon from '../../components/icons/show_more';
import CompassIcon from '../../components/icons/compassIcon';
import ScreenIcon from '../../components/icons/screen_icon';
import PopOutIcon from '../../components/icons/popout';
import ExpandIcon from '../../components/icons/expand';
import RaisedHandIcon from '../../components/icons/raised_hand';
import UnraisedHandIcon from '../../components/icons/unraised_hand';
import SpeakerIcon from '../../components/icons/speaker_icon';

import Shortcut from 'src/components/shortcut';
import Badge from 'src/components/badge';
import {AudioInputPermissionsError} from 'src/client';

import CallDuration from './call_duration';
import WidgetBanner from './widget_banner';
import WidgetButton from './widget_button';
import UnavailableIconWrapper from './unavailable_icon_wrapper';

import './component.scss';

interface Props {
    store: any,
    theme: Theme,
    currentUserID: string,
    channel: Channel,
    team: Team,
    channelURL: string,
    channelDisplayName: string,
    profiles: UserProfile[],
    profilesMap: IDMappedObjects<UserProfile>,
    picturesMap: {
        [key: string]: string,
    },
    statuses: {
        [key: string]: UserState,
    },
    callStartAt: number,
    callHostID: string,
    callRecording?: CallRecordingState,
    screenSharingID: string,
    show: boolean,
    showExpandedView: () => void,
    showScreenSourceModal: () => void,
    trackEvent: (event: Telemetry.Event, source: Telemetry.Source, props?: Record<string, any>) => void,
    allowScreenSharing: boolean,
    global?: true,
    position?: {
        bottom: number,
        left: number,
    },
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
    screenSharingID?: string,
    screenStream?: any,
    currentAudioInputDevice?: any,
    currentAudioOutputDevice?: any,
    devices?: any,
    showAudioInputDevicesMenu?: boolean,
    showAudioOutputDevicesMenu?: boolean,
    dragging: DraggingState,
    expandedViewWindow: Window | null,
    showUsersJoined: string[],
    audioEls: HTMLAudioElement[],
    alerts: CallAlertStates,
    recDisclaimerDismissedAt: number,
}

export default class CallWidget extends React.PureComponent<Props, State> {
    private node: React.RefObject<HTMLDivElement>;
    private menuNode: React.RefObject<HTMLDivElement>;
    private menuResizeObserver: ResizeObserver | null = null;
    private audioMenuResizeObserver: ResizeObserver | null = null;
    private screenPlayer = React.createRef<HTMLVideoElement>()

    private genStyle = () => {
        return {
            main: {
                position: 'fixed',
                display: 'flex',
                bottom: `${this.props.position ? this.props.position.bottom : 12}px`,
                left: `${this.props.position ? this.props.position.left : 12}px`,
                lineHeight: '16px',
                zIndex: '1000',
                userSelect: 'none',
                color: this.props.theme.centerChannelColor,
                appRegion: 'drag',
            },
            topBar: {
                background: changeOpacity(this.props.theme.centerChannelColor, 0.04),
                padding: '0 12px',
                display: 'flex',
                width: '100%',
                alignItems: 'center',
                height: '44px',
                cursor: 'move',
            },
            bottomBar: {
                padding: '6px 8px',
                display: 'flex',
                justifyContent: 'flex-end',
                width: '100%',
                alignItems: 'center',
            },
            disconnectButton: {
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                color: 'color: rgba(255, 255, 255, 0.8)',
                fontSize: '14px',
                margin: '0 8px',
                width: '24px',
                height: '24px',
                borderRadius: '4px',
                backgroundColor: '#D24B4E',
            },
            status: {
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                alignItems: 'center',
                width: '100%',
                background: this.props.theme.centerChannelBg,
                border: `1px solid ${changeOpacity(this.props.theme.centerChannelColor, 0.3)}`,
                borderRadius: '8px',
            },
            callInfo: {
                display: 'flex',
                alignItems: 'center',
                fontSize: '11px',
                lineHeight: '11px',
                color: changeOpacity(this.props.theme.centerChannelColor, 0.64),
                marginTop: '3px',
            },
            profiles: {
                display: 'flex',
                marginRight: '8px',
            },
            menuButton: {
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                color: changeOpacity(this.props.theme.centerChannelColor, 0.8),
                fontSize: '14px',
                width: 'auto',
                padding: '0 6px',
            },
            menu: {
                position: 'absolute',
                background: 'white',
                color: this.props.theme.centerChannelColor,
            },
            screenSharingPanel: {
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                width: '100%',
                minWidth: 'revert',
                maxWidth: 'revert',
            },
            leaveCallButton: {
                display: 'flex',
                alignItems: 'center',
                padding: '0 8px',
                height: '28px',
                borderRadius: '4px',
                color: '#D24B4E',
                background: 'rgba(var(--dnd-indicator-rgb), 0.08)',
                marginRight: 'auto',
            },
            dotsMenu: {
                position: 'relative',
                width: '100%',
                minWidth: 'revert',
                maxWidth: 'revert',
            },
            audioInputsOutputsMenu: {
                left: 'calc(100% + 4px)',
                top: 'auto',
            },
            expandButton: {
                position: 'absolute',
                right: '8px',
                top: '8px',
                margin: 0,
            },
        };
    }

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
            showUsersJoined: [],
            audioEls: [],
            alerts: CallAlertStatesDefault,
            recDisclaimerDismissedAt: 0,
        };
        this.node = React.createRef();
        this.menuNode = React.createRef();
        this.screenPlayer = React.createRef();
    }

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
    }

    public componentDidMount() {
        if (this.props.global) {
            this.menuResizeObserver = new ResizeObserver((entries) => {
                if (entries.length === 0) {
                    return;
                }
                sendDesktopEvent('calls-widget-resize', {
                    element: 'calls-widget-menu',
                    height: Math.round(entries[0].contentRect.height),
                    width: Math.round(entries[0].contentRect.width),
                });
            });
            this.menuResizeObserver.observe(this.menuNode.current!);
        } else {
            document.addEventListener('mouseup', this.onMouseUp, false);
        }
        document.addEventListener('click', this.closeOnBlur, true);
        document.addEventListener('keyup', this.keyboardClose, true);

        // keyboard shortcuts
        document.addEventListener('keydown', this.handleKBShortcuts, true);

        // eslint-disable-next-line react/no-did-mount-set-state
        this.setState({
            showUsersJoined: [this.props.currentUserID],
        });

        setTimeout(() => {
            this.setState({
                showUsersJoined: this.state.showUsersJoined.filter((userID) => userID !== this.props.currentUserID),
            });
        }, 5000);

        window.callsClient.on('remoteVoiceStream', (stream: MediaStream) => {
            const voiceTrack = stream.getAudioTracks()[0];
            const audioEl = document.createElement('audio');
            audioEl.srcObject = stream;
            audioEl.controls = false;
            audioEl.autoplay = true;
            audioEl.style.display = 'none';
            audioEl.onerror = (err) => logErr(err);
            audioEl.id = voiceTrack.id;

            const deviceID = window.callsClient.currentAudioOutputDevice?.deviceId;
            if (deviceID) {
                // @ts-ignore - setSinkId is an experimental feature
                audioEl.setSinkId(deviceID);
            }

            this.setState({
                audioEls: [...this.state.audioEls, audioEl],
            });

            document.body.appendChild(audioEl);
            voiceTrack.onended = () => {
                audioEl.srcObject = null;
                audioEl.remove();
            };
        });

        window.callsClient.on('remoteScreenStream', (stream: MediaStream) => {
            this.setState({
                screenStream: stream,
            });
        });

        window.callsClient.on('devicechange', (devices: AudioDevices) => {
            this.setState({devices,
                alerts: {
                    ...this.state.alerts,
                    missingAudioInput: {
                        ...this.state.alerts.missingAudioInput,
                        active: devices.inputs.length === 0,
                        show: devices.inputs.length === 0,
                    },
                }});
        });

        window.callsClient.on('connect', () => {
            if (this.props.global) {
                sendDesktopEvent('calls-joined-call', {
                    callID: window.callsClient?.channelID,
                });
            }

            if (isDirectChannel(this.props.channel) || isGroupChannel(this.props.channel)) {
                // FIXME (MM-46048) - HACK
                // There's a race condition between unmuting and receiving existing tracks from other participants.
                // Fixing this properly requires extensive and potentially breaking changes.
                // Waiting for a second before unmuting is a decent workaround that should work in most cases.
                setTimeout(() => {
                    window.callsClient?.unmute();
                }, 1000);
            }
            this.setState({currentAudioInputDevice: window.callsClient.currentAudioInputDevice});
            this.setState({currentAudioOutputDevice: window.callsClient.currentAudioOutputDevice});
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
                    }});
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
                }});
        });
    }

    public componentWillUnmount() {
        if (!this.props.global) {
            document.removeEventListener('mouseup', this.onMouseUp, false);
        }

        if (this.menuResizeObserver) {
            this.menuResizeObserver.disconnect();
        }

        document.removeEventListener('click', this.closeOnBlur, true);
        document.removeEventListener('keyup', this.keyboardClose, true);
        document.removeEventListener('keydown', this.handleKBShortcuts, true);
    }

    public componentDidUpdate(prevProps: Props, prevState: State) {
        if (prevProps.theme.type !== this.props.theme.type) {
            this.style = this.genStyle();
        }

        let screenStream = this.state.screenStream;
        if (this.props.screenSharingID === this.props.currentUserID) {
            screenStream = window.callsClient.getLocalScreenStream();
        }

        const wasRendering = Boolean(prevProps.screenSharingID && prevState.screenStream && prevProps.show);
        const shouldRender = Boolean(this.props.screenSharingID && screenStream);

        if (!this.state.screenStream && screenStream) {
            // eslint-disable-next-line react/no-did-update-set-state
            this.setState({screenStream});
        } else if (!wasRendering && shouldRender && this.screenPlayer.current) {
            this.screenPlayer.current.srcObject = screenStream;
        }

        let profiles;
        if (this.props.profiles.length > prevProps.profiles.length) {
            profiles = this.props.profiles;
        } else if (this.props.profiles.length < prevProps.profiles.length) {
            profiles = prevProps.profiles.length;
        }
        let ids: string[] = [];
        const currIDs = Object.keys(this.props.statuses);
        const prevIDs = Object.keys(prevProps.statuses);
        if (currIDs.length > prevIDs.length) {
            ids = currIDs;
            if (prevIDs.length === 0) {
                return;
            }
        } else if (currIDs.length < prevIDs.length) {
            ids = prevIDs;
        }
        if (ids.length > 0) {
            const statuses = this.props.statuses;
            const prevStatuses = prevProps.statuses;
            for (let i = 0; i < ids.length; i++) {
                const userID = ids[i];
                if (statuses[userID] && !prevStatuses[userID]) {
                    // eslint-disable-next-line react/no-did-update-set-state
                    this.setState({
                        showUsersJoined: [
                            ...this.state.showUsersJoined,
                            userID,
                        ],
                    });
                    setTimeout(() => {
                        this.setState({
                            showUsersJoined: this.state.showUsersJoined.filter((id) => id !== userID),
                        });
                    }, 5000);
                }
            }
        }
    }

    private keyboardClose = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            this.setState({showMenu: false});
        }
    }

    private closeOnBlur = (e: Event) => {
        if (this.node && this.node.current && e.target && this.node.current.contains(e.target as Node)) {
            return;
        }
        this.setState({showMenu: false});
    }

    onShareScreenToggle = async (fromShortcut?: boolean) => {
        if (!this.props.allowScreenSharing) {
            return;
        }
        const state = {} as State;

        if (this.props.screenSharingID === this.props.currentUserID) {
            window.callsClient.unshareScreen();
            state.screenStream = null;
            this.props.trackEvent(Telemetry.Event.UnshareScreen, Telemetry.Source.Widget, {initiator: fromShortcut ? 'shortcut' : 'button'});
        } else if (!this.props.screenSharingID) {
            if (window.desktop && compareSemVer(window.desktop.version, '5.1.0') >= 0) {
                if (this.props.global) {
                    sendDesktopEvent('desktop-sources-modal-request');
                } else {
                    this.props.showScreenSourceModal();
                }
            } else {
                const stream = await window.callsClient.shareScreen('', hasExperimentalFlag());
                if (stream) {
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
            }
            this.props.trackEvent(Telemetry.Event.ShareScreen, Telemetry.Source.Widget, {initiator: fromShortcut ? 'shortcut' : 'button'});
        }

        this.setState({
            ...state,
            showMenu: false,
        });
    }

    onMuteToggle = () => {
        if (!window.callsClient) {
            return;
        }

        // This is needed to prevent a conflict with the accessibility controller on buttons.
        if (document.activeElement instanceof HTMLElement) {
            document.activeElement.blur();
        }

        const isMuted = window.callsClient.isMuted();
        if (isMuted) {
            window.callsClient.unmute();
        } else {
            window.callsClient.mute();
        }
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
    }

    onMenuClick = () => {
        this.setState({
            showMenu: !this.state.showMenu,
            showParticipantsList: false,
        });
    }

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
    }

    onAudioInputDeviceClick = (device: MediaDeviceInfo) => {
        if (device.deviceId !== this.state.currentAudioInputDevice?.deviceId) {
            window.callsClient.setAudioInputDevice(device);
        }
        this.setState({showAudioInputDevicesMenu: false, currentAudioInputDevice: device});
    }

    onAudioOutputDeviceClick = (device: MediaDeviceInfo) => {
        if (device.deviceId !== this.state.currentAudioOutputDevice?.deviceId) {
            window.callsClient.setAudioOutputDevice(device);
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
    }

    renderScreenSharingPanel = () => {
        if (!this.props.screenSharingID) {
            return null;
        }

        const isSharing = this.props.screenSharingID === this.props.currentUserID;

        let profile;
        if (!isSharing) {
            profile = this.props.profilesMap[this.props.screenSharingID];
            if (!profile) {
                return null;
            }
        }

        const msg = isSharing ? 'You are sharing your screen' : `You are viewing ${getUserDisplayName(profile as UserProfile)}'s screen`;
        return (
            <div
                className='Menu'
                style={{
                    display: 'flex',
                    position: 'relative',
                }}
            >
                { isSharing &&
                <div
                    style={{
                        position: 'absolute',
                        display: 'flex',
                        width: '100%',
                        height: '100%',
                        background: 'rgba(var(--dnd-indicator-rgb), 0.4)',
                        justifyContent: 'center',
                        alignItems: 'center',
                        zIndex: 1001,
                    }}
                >
                    <button
                        className='cursor--pointer style--none'
                        style={{
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center',
                            padding: '8px 16px',
                            background: 'rgb(var(--dnd-indicator-rgb))',
                            color: 'white',
                            borderRadius: '4px',
                            fontWeight: 600,
                        }}
                        onClick={() => this.onShareScreenToggle()}
                    >
                        {'Stop sharing'}
                    </button>
                </div>
                }
                <ul
                    className='Menu__content dropdown-menu'
                    style={this.style.screenSharingPanel as CSSProperties}
                >
                    <div
                        style={{position: 'relative', width: '80%', background: '#C4C4C4'}}
                    >
                        <video
                            id='screen-player'
                            ref={this.screenPlayer}
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
                            <span>{'Pop out'}</span>
                        </button>

                    </div>
                    <span style={{marginTop: '8px', color: changeOpacity(this.props.theme.centerChannelColor, 0.72), fontSize: '12px', padding: '0 8px', textAlign: 'center'}}>{msg}</span>
                </ul>
            </div>
        );
    }

    renderScreenShareButton = () => {
        const sharingID = this.props.screenSharingID;
        const currentID = this.props.currentUserID;
        const isSharing = sharingID === currentID;

        let fill = '';
        if (isSharing) {
            fill = 'rgb(var(--dnd-indicator-rgb))';
        } else if (sharingID) {
            fill = changeOpacity(this.props.theme.centerChannelColor, 0.34);
        }

        const noScreenPermissions = this.state.alerts.missingScreenPermissions.active;
        let shareScreenTooltipText = isSharing ? 'Stop presenting' : 'Start presenting';
        if (noScreenPermissions) {
            shareScreenTooltipText = CallAlertConfigs.missingScreenPermissions.tooltipText;
        }
        const shareScreenTooltipSubtext = noScreenPermissions ? CallAlertConfigs.missingScreenPermissions.tooltipSubtext : '';

        return (
            <WidgetButton
                id='share-screen'
                onToggle={() => this.onShareScreenToggle()}
                tooltipText={shareScreenTooltipText}
                tooltipSubtext={shareScreenTooltipSubtext}
                // eslint-disable-next-line no-undefined
                shortcut={noScreenPermissions ? undefined : reverseKeyMappings.widget[SHARE_UNSHARE_SCREEN][0]}
                bgColor={isSharing ? 'rgba(var(--dnd-indicator-rgb), 0.12)' : ''}
                icon={<ScreenIcon style={{width: '16px', height: '16px', fill}}/>}
                unavailable={this.state.alerts.missingScreenPermissions.active}
                disabled={sharingID !== '' && !isSharing}
            />
        );
    }

    renderSpeaking = () => {
        let speakingProfile;
        for (let i = 0; i < this.props.profiles.length; i++) {
            const profile = this.props.profiles[i];
            const status = this.props.statuses[profile.id];
            if (status?.voice) {
                speakingProfile = profile;
                break;
            }
        }
        return (
            <div style={{fontSize: '12px', display: 'flex', whiteSpace: 'pre'}}>
                <span style={{fontWeight: speakingProfile ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis'}}>
                    {speakingProfile ? getUserDisplayName(speakingProfile) : 'No one'} <span style={{fontWeight: 400}}>{'is talking...'}</span>
                </span>
            </div>
        );
    }

    renderParticipantsList = () => {
        if (!this.state.showParticipantsList) {
            return null;
        }

        const renderParticipants = () => {
            return this.props.profiles.map((profile, idx) => {
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
                        className='MenuItem'
                        key={'participants_profile_' + profile.id}
                        style={{display: 'flex', padding: '1px 16px'}}
                    >
                        <Avatar
                            size={24}
                            fontSize={10}
                            url={this.props.picturesMap[profile.id]}
                            style={{marginRight: '8px'}}
                            borderGlow={isSpeaking}
                        />

                        <span className='MenuItem__primary-text'>
                            {getUserDisplayName(profile)}
                            { profile.id === this.props.currentUserID &&
                            <span style={{color: changeOpacity(this.props.theme.centerChannelColor, 0.56), whiteSpace: 'pre-wrap'}}>{' (you)'}</span>
                            }
                        </span>

                        <span
                            style={{
                                display: 'flex',
                                justifyContent: 'center',
                                alignItems: 'center',
                                marginLeft: 'auto',
                                gap: '4px',
                            }}
                        >
                            { isHandRaised &&
                            <RaisedHandIcon
                                fill={'rgba(255, 188, 66, 1)'}
                                style={{width: '14px', height: '14px'}}
                            />
                            }

                            { this.props.screenSharingID === profile.id &&
                            <ScreenIcon
                                fill={'rgb(var(--dnd-indicator-rgb))'}
                                style={{width: '14px', height: '14px'}}
                            />
                            }

                            <MuteIcon
                                fill={isMuted ? '#C4C4C4' : '#3DB887'}
                                style={{width: '14px', height: '14px'}}
                                stroke={isMuted ? '#C4C4C4' : '#3DB887'}
                            />

                        </span>
                    </li>
                );
            });
        };

        return (
            <div
                id='calls-widget-participants-menu'
                className='Menu'
            >
                <ul
                    id='calls-widget-participants-list'
                    className='Menu__content dropdown-menu'
                    style={{width: '100%', minWidth: 'revert', maxWidth: 'revert', maxHeight: '188px', overflow: 'auto', position: 'relative'}}
                >
                    <li
                        className='MenuHeader'
                        style={{paddingBottom: '4px', color: this.props.theme.centerChannelColor}}
                    >
                        {'Participants'}
                    </li>
                    { renderParticipants() }
                </ul>
            </div>
        );
    }

    audioDevicesMenuRefCb = (el: HTMLUListElement) => {
        if (this.audioMenuResizeObserver) {
            this.audioMenuResizeObserver.disconnect();
        }

        if (el) {
            this.audioMenuResizeObserver = new ResizeObserver((entries) => {
                if (entries.length === 0) {
                    return;
                }
                sendDesktopEvent('calls-widget-resize', {
                    element: 'calls-widget-audio-menu',
                    width: Math.round(entries[0].contentRect.width),
                    height: Math.round(entries[0].contentRect.height),
                });
            });
            this.audioMenuResizeObserver.observe(el);
        } else {
            sendDesktopEvent('calls-widget-resize', {
                element: 'calls-widget-audio-menu',
                width: 0,
                height: 0,
            });
        }
    }

    renderAudioDevicesMenu = (deviceType: string) => {
        if (deviceType === 'input' && !this.state.showAudioInputDevicesMenu) {
            return null;
        }

        if (deviceType === 'output' && !this.state.showAudioOutputDevicesMenu) {
            return null;
        }

        const devices = deviceType === 'input' ? this.state.devices.inputs : this.state.devices.outputs;
        const currentDevice = deviceType === 'input' ? this.state.currentAudioInputDevice : this.state.currentAudioOutputDevice;

        return (
            <div className='Menu'>
                <ul
                    id={`calls-widget-audio-${deviceType}s-menu`}
                    className='Menu__content dropdown-menu'
                    style={this.style.audioInputsOutputsMenu}
                    // eslint-disable-next-line no-undefined
                    ref={this.props.global ? this.audioDevicesMenuRefCb : undefined}
                >
                    {
                        devices.map((device: any, idx: number) => {
                            return (
                                <li
                                    className='MenuItem'
                                    key={`audio-${deviceType}-device-${idx}`}
                                >
                                    <button
                                        className='style--none'
                                        style={{background: device.deviceId === currentDevice?.deviceId ? 'rgba(28, 88, 217, 0.12)' : ''}}
                                        onClick={() => (deviceType === 'input' ? this.onAudioInputDeviceClick(device) : this.onAudioOutputDeviceClick(device))}
                                    >
                                        <span style={{color: changeOpacity(this.props.theme.centerChannelColor, 0.56), fontSize: '12px', width: '100%'}}>{device.label}</span>
                                    </button>
                                </li>
                            );
                        })
                    }
                </ul>
            </div>
        );
    }

    renderAudioDevices = (deviceType: string) => {
        if (!window.callsClient || !this.state.devices) {
            return null;
        }
        if (deviceType === 'output' && this.state.devices.outputs.length === 0) {
            return null;
        }

        const currentDevice = deviceType === 'input' ? this.state.currentAudioInputDevice : this.state.currentAudioOutputDevice;
        const DeviceIcon = deviceType === 'input' ? UnmutedIcon : SpeakerIcon;

        const noInputDevices = deviceType === 'input' && this.state.devices.inputs?.length === 0;
        const noAudioPermissions = deviceType === 'input' && this.state.alerts.missingAudioInputPermissions.active;
        const isDisabled = noInputDevices || noAudioPermissions;

        let label = currentDevice?.label || 'Default';
        if (noAudioPermissions) {
            label = CallAlertConfigs.missingAudioInputPermissions.tooltipText;
        } else if (noInputDevices) {
            label = CallAlertConfigs.missingAudioInput.tooltipText;
        }

        const onClickHandler = () => {
            if (deviceType === 'input') {
                this.setState({showAudioInputDevicesMenu: !this.state.showAudioInputDevicesMenu, showAudioOutputDevicesMenu: false});
            } else {
                this.setState({showAudioOutputDevicesMenu: !this.state.showAudioOutputDevicesMenu, showAudioInputDevicesMenu: false});
            }
        };

        return (
            <React.Fragment>
                {this.renderAudioDevicesMenu(deviceType)}
                <li
                    className='MenuItem'
                >
                    <button
                        id={`calls-widget-audio-${deviceType}-button`}
                        className='style--none'
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            color: isDisabled ? changeOpacity(this.props.theme.centerChannelColor, 0.32) : '',
                        }}
                        onClick={onClickHandler}
                        disabled={isDisabled}
                    >
                        <div style={{display: 'flex', alignItems: 'center', justifyContent: 'flex-start', width: '100%', padding: '2px 0'}}>
                            <UnavailableIconWrapper
                                icon={(
                                    <DeviceIcon
                                        style={{
                                            fill: changeOpacity(this.props.theme.centerChannelColor, isDisabled ? 0.32 : 0.56),
                                        }}
                                    />
                                )}
                                unavailable={isDisabled}
                                margin={'0 8px 0 0'}
                            />

                            <span
                                className='MenuItem__primary-text'
                                style={{padding: '0'}}
                            >{deviceType === 'input' ? 'Microphone' : 'Audio Output'}</span>
                            <ShowMoreIcon
                                style={{
                                    width: '11px',
                                    height: '11px',
                                    marginLeft: 'auto',
                                    fill: changeOpacity(this.props.theme.centerChannelColor, isDisabled ? 0.32 : 0.56),
                                }}
                            />
                        </div>
                        <span
                            style={{
                                color: changeOpacity(this.props.theme.centerChannelColor, isDisabled ? 0.32 : 0.56),
                                fontSize: '12px',
                                width: '100%',
                                lineHeight: '16px',
                                textOverflow: 'ellipsis',
                                overflow: 'hidden',
                                whiteSpace: isDisabled ? 'initial' : 'nowrap',
                            }}
                        >
                            {label}
                        </span>
                    </button>
                </li>
            </React.Fragment>
        );
    }

    renderScreenSharingMenuItem = () => {
        const sharingID = this.props.screenSharingID;
        const currentID = this.props.currentUserID;
        const isSharing = sharingID === currentID;
        const isDisabled = Boolean(sharingID !== '' && !isSharing);
        const noPermissions = this.state.alerts.missingScreenPermissions.active;

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
                            color: isDisabled || noPermissions ? changeOpacity(this.props.theme.centerChannelColor, 0.34) : '',
                        }}
                        disabled={isDisabled}
                        onClick={() => this.onShareScreenToggle()}
                    >

                        <div style={{display: 'flex', alignItems: 'center', justifyContent: 'flex-start', width: '100%', padding: '2px 0'}}>
                            <UnavailableIconWrapper
                                icon={(
                                    <ScreenIcon
                                        style={{width: '16px', height: '16px'}}
                                        fill={isSharing ? 'rgb(var(--dnd-indicator-rgb))' : changeOpacity(this.props.theme.centerChannelColor, 0.64)}
                                    />
                                )}
                                unavailable={noPermissions}
                                margin={'0 8px 0 0'}
                            />
                            <span>{isSharing ? 'Stop presenting' : 'Start presenting'}</span>
                        </div>

                        { noPermissions &&
                        <span
                            style={{
                                color: changeOpacity(this.props.theme.centerChannelColor, 0.32),
                                fontSize: '12px',
                                width: '100%',
                                lineHeight: '16px',
                                whiteSpace: 'initial',
                            }}
                        >
                            {CallAlertConfigs.missingScreenPermissions.tooltipText}
                        </span>
                        }

                    </button>
                </li>
                <li className='MenuGroup menu-divider'/>
            </React.Fragment>
        );
    }

    renderMenu = (widerWidget: boolean) => {
        if (!this.state.showMenu) {
            return null;
        }

        const {channel} = this.props;
        return (
            <div className='Menu'>
                <ul
                    className='Menu__content dropdown-menu'
                    style={this.style.dotsMenu as CSSProperties}
                >
                    {this.props.allowScreenSharing && !widerWidget && this.renderScreenSharingMenuItem()}
                    {this.renderAudioDevices('output')}
                    {this.renderAudioDevices('input')}
                </ul>
            </div>
        );
    }

    renderProfiles = () => {
        let speakingPictureURL;
        for (let i = 0; i < this.props.profiles.length; i++) {
            const profile = this.props.profiles[i];
            const status = this.props.statuses[profile.id];
            if (status?.voice) {
                speakingPictureURL = this.props.picturesMap[profile.id];
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
                        size={24}
                        fontSize={10}
                        url={speakingPictureURL}
                    />
                }

                {
                    !speakingPictureURL &&
                    <Avatar
                        size={24}
                        fontSize={10}
                        icon='account-outline'
                        style={{
                            background: changeOpacity(this.props.theme.centerChannelColor, 0.16),
                            color: changeOpacity(this.props.theme.centerChannelColor, 0.48),
                            fontSize: '14px',
                        }}
                    />
                }

            </div>
        );
    }

    renderRecordingDisclaimer = () => {
        // This component should render if all of the following conditions apply:
        // - Recording has started.
        // - Recording has not ended.
        // - Diclaimer has not been dismissed already.

        if (!this.props.callRecording?.start_at || this.props.callRecording?.end_at) {
            return null;
        }

        if (this.state.recDisclaimerDismissedAt > this.props.callRecording?.start_at) {
            return null;
        }

        const isHost = this.props.callHostID === this.props.currentUserID;

        return (
            <WidgetBanner
                key={'widget_banner_recording_disclaimer'}
                type='info'
                icon={(
                    <RecordCircleOutlineIcon
                        size={12}
                    />)}
                iconFill='rgb(var(--dnd-indicator-rgb))'
                iconColor='rgb(var(--dnd-indicator-rgb))'
                header={CallRecordingDisclaimerStrings[isHost ? 'host' : 'participant'].header}
                body={CallRecordingDisclaimerStrings[isHost ? 'host' : 'participant'].body}
                confirmText={isHost ? 'Dismiss' : 'Understood'}
                onClose={() => this.setState({recDisclaimerDismissedAt: Date.now()})}
            />
        );
    }

    renderRecordingBadge = () => {
        if (!this.props.callRecording?.start_at || this.props.callRecording?.end_at) {
            return null;
        }

        return (
            <React.Fragment>
                <Badge
                    text={'REC'}
                    textSize={11}
                    gap={2}
                    icon={(<RecordCircleOutlineIcon size={11}/>)}
                    color={'#D24B4E'}
                />
                <div style={{margin: '0 2px 0 4px'}}>{'•'}</div>
            </React.Fragment>
        );
    }

    renderAlertBanners = () => {
        return Object.entries(this.state.alerts).map((keyVal) => {
            const [alertID, alertState] = keyVal;
            if (!alertState.show) {
                return null;
            }

            const alertConfig = CallAlertConfigs[alertID];

            return (
                <WidgetBanner
                    {...alertConfig}
                    key={`widget_banner_${alertID}`}
                    header={alertConfig.bannerText}
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
        });
    }

    renderNotificationBar = () => {
        if (!this.props.currentUserID) {
            return null;
        }

        const isMuted = window.callsClient.isMuted();
        const MuteIcon = isMuted ? MutedIcon : UnmutedIcon;
        const onJoinSelf = (
            <React.Fragment>
                <span>{`You are ${isMuted ? 'muted' : 'unmuted'}. Click `}</span>
                <MuteIcon
                    style={{width: '11px', height: '11px', fill: isMuted ? changeOpacity(this.props.theme.centerChannelColor, 1.0) : '#3DB887'}}
                    stroke={isMuted ? 'rgb(var(--dnd-indicator-rgb))' : '#3DB887'}
                />
                <span>{` to ${isMuted ? 'unmute' : 'mute'}.`}</span>
            </React.Fragment>
        );

        const notificationContent = onJoinSelf;

        const joinedUsers = this.state.showUsersJoined.map((userID, idx) => {
            if (userID === this.props.currentUserID) {
                return null;
            }

            const profile = this.props.profilesMap[userID];
            const picture = this.props.picturesMap[userID];
            if (!profile) {
                return null;
            }

            return (
                <div
                    className='calls-notification-bar calls-slide-top'
                    style={{justifyContent: 'flex-start'}}
                    key={profile.id}
                >
                    <Avatar
                        size={16}
                        fontSize={8}
                        url={picture}
                        style={{margin: '0 8px'}}
                    />
                    {`${getUserDisplayName(profile)} has joined the call.`}
                </div>
            );
        });

        return (
            <React.Fragment>
                <div style={{display: 'flex', flexDirection: 'column-reverse'}}>
                    { joinedUsers }
                </div>
                { this.state.showUsersJoined.includes(this.props.currentUserID) &&
                <div className='calls-notification-bar calls-slide-top'>
                    {notificationContent}
                </div>
                }
            </React.Fragment>
        );
    }

    onMouseDown = (ev: React.MouseEvent<HTMLDivElement>) => {
        document.addEventListener('mousemove', this.onMouseMove, false);
        const target = ev.target as HTMLElement;
        this.setState({
            dragging: {
                ...this.state.dragging,
                dragging: true,
                initX: ev.clientX - this.state.dragging.offX,
                initY: ev.clientY - this.state.dragging.offY,
            },
        });
    }

    onMouseUp = (ev: MouseEvent) => {
        document.removeEventListener('mousemove', this.onMouseMove, false);
        const target = ev.target as HTMLElement;
        this.setState({
            dragging: {
                ...this.state.dragging,
                dragging: false,
                initX: this.state.dragging.x,
                initY: this.state.dragging.y,
            },
        });
    }

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
    }

    onExpandClick = () => {
        if (this.state.expandedViewWindow && !this.state.expandedViewWindow.closed) {
            this.state.expandedViewWindow.focus();
            return;
        }

        this.props.trackEvent(Telemetry.Event.OpenExpandedView, Telemetry.Source.Widget, {initiator: 'button'});

        // TODO: remove this as soon as we support opening a window from desktop app.
        if (window.desktop && !this.props.global) {
            this.props.showExpandedView();
        } else {
            let features = 'resizable=yes';
            if (this.props.global) {
                features += ',frame=false';
            }
            const expandedViewWindow = window.open(
                getPopOutURL(this.props.team, this.props.channel),
                'ExpandedView',
                features,
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
    }

    onRaiseHandToggle = (fromShortcut?: boolean) => {
        if (!window.callsClient) {
            return;
        }

        // This is needed to prevent a conflict with the accessibility controller on buttons.
        if (document.activeElement instanceof HTMLElement) {
            document.activeElement.blur();
        }

        if (window.callsClient.isHandRaised) {
            window.callsClient.unraiseHand();
            this.props.trackEvent(Telemetry.Event.LowerHand, Telemetry.Source.Widget, {initiator: fromShortcut ? 'shortcut' : 'button'});
        } else {
            window.callsClient.raiseHand();
            this.props.trackEvent(Telemetry.Event.RaiseHand, Telemetry.Source.Widget, {initiator: fromShortcut ? 'shortcut' : 'button'});
        }
    }

    onChannelLinkClick = (ev: React.MouseEvent<HTMLElement>) => {
        ev.preventDefault();
        const message = {pathName: this.props.channelURL};
        if (this.props.global) {
            sendDesktopEvent('calls-widget-channel-link-click', message);
        } else {
            window.postMessage({type: 'browser-history-push-return', message}, window.origin);
        }
        this.props.trackEvent(Telemetry.Event.OpenChannelLink, Telemetry.Source.Widget);
    }

    renderChannelName = (widerWidget: boolean) => {
        return (
            <React.Fragment>
                <div style={{margin: '0 2px 0 4px'}}>{'•'}</div>

                <a
                    href={this.props.channelURL}
                    onClick={this.onChannelLinkClick}
                    className='calls-channel-link'
                    style={{appRegion: 'no-drag', padding: '0'} as CSSProperties}
                >
                    {isOpenChannel(this.props.channel) && <CompassIcon icon='globe'/>}
                    {isPrivateChannel(this.props.channel) && <CompassIcon icon='lock'/>}
                    {isDirectChannel(this.props.channel) && <CompassIcon icon='account-outline'/>}
                    {isGroupChannel(this.props.channel) && <CompassIcon icon='account-multiple-outline'/>}
                    <span
                        style={{
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            maxWidth: widerWidget ? '22ch' : '12ch',
                        }}
                    >
                        {this.props.channelDisplayName}
                    </span>
                </a>
            </React.Fragment>
        );
    }

    render() {
        if (!this.props.channel || !window.callsClient || !this.props.show) {
            return null;
        }

        const noInputDevices = this.state.alerts.missingAudioInput.active;
        const noAudioPermissions = this.state.alerts.missingAudioInputPermissions.active;
        const MuteIcon = window.callsClient.isMuted() && !noInputDevices && !noAudioPermissions ? MutedIcon : UnmutedIcon;
        let muteTooltipText = window.callsClient.isMuted() ? 'Click to unmute' : 'Click to mute';
        let muteTooltipSubtext = '';
        if (noInputDevices) {
            muteTooltipText = CallAlertConfigs.missingAudioInput.tooltipText;
            muteTooltipSubtext = CallAlertConfigs.missingAudioInput.tooltipSubtext;
        }
        if (noAudioPermissions) {
            muteTooltipText = CallAlertConfigs.missingAudioInputPermissions.tooltipText;
            muteTooltipSubtext = CallAlertConfigs.missingAudioInputPermissions.tooltipSubtext;
        }

        const widerWidget = Boolean(document.querySelector('.team-sidebar')) || Boolean(this.props.global);
        const mainWidth = widerWidget ? '280px' : '216px';

        const ShowIcon = window.desktop && !this.props.global ? ExpandIcon : PopOutIcon;

        const HandIcon = window.callsClient.isHandRaised ? UnraisedHandIcon : RaisedHandIcon;
        const handTooltipText = window.callsClient.isHandRaised ? 'Click to lower hand' : 'Click to raise hand';

        return (
            <div
                id='calls-widget'
                style={{
                    ...this.style.main as CSSProperties,
                    width: mainWidth,
                }}
                ref={this.node}
            >

                <div
                    ref={this.menuNode}
                    style={{position: 'absolute', bottom: 'calc(100% + 4px)', width: '100%', zIndex: -1}}
                >
                    {this.renderNotificationBar()}
                    {this.renderAlertBanners()}
                    {this.renderRecordingDisclaimer()}
                    {this.props.allowScreenSharing && this.renderScreenSharingPanel()}
                    {this.renderParticipantsList()}
                    {this.renderMenu(widerWidget)}
                </div>

                <div style={this.style.status as CSSProperties}>
                    <div
                        style={this.style.topBar}
                        // eslint-disable-next-line no-undefined
                        onMouseDown={this.props.global ? undefined : this.onMouseDown}
                    >
                        <button
                            id='calls-widget-expand-button'
                            className='style--none button-controls button-controls--wide'
                            style={this.style.expandButton as CSSProperties}
                            onClick={this.onExpandClick}
                        >
                            <ShowIcon
                                style={{width: '14px', height: '14px'}}
                                fill={changeOpacity(this.props.theme.centerChannelColor, 0.64)}
                            />
                        </button>

                        <div style={this.style.profiles}>
                            {this.renderProfiles()}
                        </div>
                        <div style={{width: widerWidget ? '200px' : '136px'}}>
                            {this.renderSpeaking()}
                            <div style={this.style.callInfo}>
                                {this.renderRecordingBadge()}
                                <CallDuration startAt={this.props.callStartAt}/>
                                {this.renderChannelName(widerWidget)}
                            </div>
                        </div>
                    </div>

                    <div
                        className='calls-widget-bottom-bar'
                        style={this.style.bottomBar}
                    >
                        <OverlayTrigger
                            key='leave'
                            placement='top'
                            overlay={
                                <Tooltip id='tooltip-leave'>
                                    {'Click to leave call'}
                                    <Shortcut shortcut={reverseKeyMappings.widget[LEAVE_CALL][0]}/>
                                </Tooltip>
                            }
                        >

                            <button
                                id='calls-widget-leave-button'
                                className='style--none button-controls button-controls--wide'
                                style={this.style.leaveCallButton}
                                onClick={this.onDisconnectClick}
                            >
                                <LeaveCallIcon
                                    style={{width: '16px', height: '16px', fill: '#D24B4E'}}
                                />
                            </button>
                        </OverlayTrigger>

                        <button
                            id='calls-widget-toggle-menu-button'
                            className='cursor--pointer style--none button-controls'
                            style={this.style.menuButton}
                            onClick={this.onMenuClick}
                        >
                            <HorizontalDotsIcon
                                style={{width: '16px', height: '16px'}}
                            />
                        </button>

                        <OverlayTrigger
                            key='participants'
                            placement='top'
                            overlay={
                                <Tooltip id='tooltip-mute'>
                                    {this.state.showParticipantsList ? 'Hide participants' : 'Show participants'}
                                    <Shortcut shortcut={reverseKeyMappings.widget[PARTICIPANTS_LIST_TOGGLE][0]}/>
                                </Tooltip>
                            }
                        >
                            <button
                                className='style--none button-controls button-controls--wide'
                                id='calls-widget-participants-button'
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    color: this.state.showParticipantsList ? 'rgba(28, 88, 217, 1)' : '',
                                    background: this.state.showParticipantsList ? 'rgba(28, 88, 217, 0.12)' : '',
                                }}
                                onClick={() => this.onParticipantsButtonClick()}
                            >
                                <ParticipantsIcon
                                    style={{width: '16px', height: '16px', marginRight: '4px'}}
                                />

                                <span
                                    style={{fontWeight: 600, color: changeOpacity(this.props.theme.centerChannelColor, 0.64)}}
                                >{this.props.profiles.length}</span>
                            </button>
                        </OverlayTrigger>

                        { !isDirectChannel(this.props.channel) &&
                        <WidgetButton
                            id='raise-hand'
                            onToggle={() => this.onRaiseHandToggle()}
                            shortcut={reverseKeyMappings.widget[RAISE_LOWER_HAND][0]}
                            tooltipText={handTooltipText}
                            bgColor={window.callsClient.isHandRaised ? 'rgba(255, 188, 66, 0.16)' : ''}
                            icon={<HandIcon style={{width: '16px', height: '16px', fill: window.callsClient.isHandRaised ? 'rgba(255, 188, 66, 1)' : ''}}/>}
                        />
                        }

                        {this.props.allowScreenSharing && (widerWidget || isDirectChannel(this.props.channel)) && this.renderScreenShareButton()}

                        <WidgetButton
                            id='voice-mute-unmute'
                            // eslint-disable-next-line no-undefined
                            onToggle={noInputDevices ? undefined : this.onMuteToggle}
                            // eslint-disable-next-line no-undefined
                            shortcut={noInputDevices || noAudioPermissions ? undefined : reverseKeyMappings.widget[MUTE_UNMUTE][0]}
                            tooltipText={muteTooltipText}
                            tooltipSubtext={muteTooltipSubtext}
                            bgColor={window.callsClient.isMuted() ? '' : 'rgba(61, 184, 135, 0.16)'}
                            icon={<MuteIcon style={{width: '16px', height: '16px', fill: window.callsClient.isMuted() ? '' : 'rgba(61, 184, 135, 1)'}}/>}
                            unavailable={noInputDevices || noAudioPermissions}
                        />
                    </div>
                </div>
            </div>
        );
    }
}
