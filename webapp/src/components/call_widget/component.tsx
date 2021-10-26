import React, {CSSProperties} from 'react';
import {Dispatch} from 'redux';
import {GenericAction} from 'mattermost-redux/types/actions';

import {OverlayTrigger, Tooltip} from 'react-bootstrap';

import moment from 'moment-timezone';

import {UserProfile} from 'mattermost-redux/types/users';
import {Channel} from 'mattermost-redux/types/channels';
import {Team} from 'mattermost-redux/types/teams';

import {changeOpacity} from 'mattermost-redux/utils/theme_utils';

import {UserState} from '../../types/types';

import Avatar from '../avatar/avatar';
import {id as pluginID} from '../../manifest';

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

import {handleFormattedTextClick} from '../../browser_routing';
import {getUserDisplayName} from '../../utils';
import './component.scss';

interface Props {
    theme: any,
    currentUserID: string,
    channel: Channel,
    team: Team,
    channelURL: string,
    profiles: UserProfile[],
    pictures: string[],
    statuses: {
        [key: string]: UserState,
    },
    callStartAt: number,
    screenSharingID: string,
    show: boolean,
    showExpandedView: () => void,
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
    intervalID?: NodeJS.Timer,
    screenStream?: any,
    currentAudioInputDevice?: any,
    devices?: any,
    showAudioInputsMenu?: boolean,
    dragging: DraggingState,
    expandedViewWindow: Window | null,
}

export default class CallWidget extends React.PureComponent<Props, State> {
    private node: React.RefObject<HTMLDivElement>;
    private screenPlayer = React.createRef<HTMLVideoElement>()

    private style = {
        main: {
            position: 'fixed',
            background: this.props.theme.centerChannelBg,
            borderRadius: '8px',
            display: 'flex',
            bottom: '12px',
            left: '12px',
            zIndex: '1000',
            border: '1px solid rgba(63, 67, 80, 0.3)',
            userSelect: 'none',
            color: this.props.theme.centerChannelColor,
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
        mutedButton: {
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            width: '24px',
        },
        unmutedButton: {
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            width: '24px',
            background: 'rgba(61, 184, 135, 0.16)',
            borderRadius: '4px',
            color: 'rgba(61, 184, 135, 1)',
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
        },
        callInfo: {
            display: 'flex',
            fontSize: '11px',
            opacity: '0.64',
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
            width: '24px',
            height: '24px',
        },
        menu: {
            position: 'absolute',
            background: 'white',
            color: this.props.theme.centerChannelColor,
        },
        screenSharingPanel: {
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            bottom: 'calc(100% + 4px)',
            top: 'auto',
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
            background: 'rgba(210, 75, 78, 0.04)',
            marginRight: 'auto',
        },
        dotsMenu: {
            bottom: 'calc(100% + 4px)',
            top: 'auto',
            width: '100%',
            minWidth: 'revert',
            maxWidth: 'revert',
        },
        audioInputsMenu: {
            left: 'calc(100% + 4px)',
            top: '0',
        },
        expandButton: {
            position: 'absolute',
            right: '8px',
            top: '8px',
            margin: 0,
        },
    };

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
        };
        this.node = React.createRef();
        this.screenPlayer = React.createRef();
    }

    public componentDidMount() {
        document.addEventListener('mouseup', this.onMouseUp, false);
        document.addEventListener('click', this.closeOnBlur, true);
        document.addEventListener('keyup', this.keyboardClose, true);

        // This is needed to force a re-render to periodically update
        // the start time.
        const id = setInterval(() => this.forceUpdate(), 1000);
        // eslint-disable-next-line react/no-did-mount-set-state
        this.setState({
            intervalID: id,
        });

        window.callsClient.on('remoteVoiceStream', (stream: MediaStream) => {
            const voiceTrack = stream.getAudioTracks()[0];
            const audioEl = document.createElement('audio');
            audioEl.srcObject = stream;
            audioEl.controls = false;
            audioEl.autoplay = true;
            audioEl.style.display = 'none';
            audioEl.onerror = (err) => console.log(err);
            document.body.appendChild(audioEl);
            voiceTrack.onended = () => {
                audioEl.remove();
            };
        });

        window.callsClient.on('remoteScreenStream', (stream: MediaStream) => {
            this.setState({
                screenStream: stream,
            });
        });
    }

    public componentWillUnmount() {
        document.removeEventListener('mouseup', this.onMouseUp, false);
        document.removeEventListener('click', this.closeOnBlur, true);
        document.removeEventListener('keyup', this.keyboardClose, true);
        if (this.state.intervalID) {
            clearInterval(this.state.intervalID);
        }
    }

    public componentDidUpdate(prevProps: Props, prevState: State) {
        if ((!prevProps.screenSharingID || prevState.showMenu || prevState.showParticipantsList || !prevProps.show ||
        (prevState.screenStream !== this.state.screenStream && this.state.screenStream)) &&
        this.props.screenSharingID && this.screenPlayer.current) {
            console.log('setting remote stream');
            this.screenPlayer.current.srcObject = this.state.screenStream;
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

    getCallDuration = () => {
        const dur = moment.utc(moment().diff(moment(this.props.callStartAt)));
        if (dur.hours() === 0) {
            return dur.format('mm:ss');
        }
        return dur.format('HH:mm:ss');
    }

    onShareScreenToggle = async () => {
        const state = {} as State;
        if (this.props.screenSharingID === this.props.currentUserID) {
            window.callsClient.unshareScreen();
        } else if (!this.props.screenSharingID) {
            const stream = await window.callsClient.shareScreen();
            state.screenStream = stream;
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
            delete window.callsClient;
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
            devices: window.callsClient?.getAudioDevices(),
            showParticipantsList: false,
        });
    }

    onParticipantsButtonClick = () => {
        this.setState({
            showParticipantsList: !this.state.showParticipantsList,
            showMenu: false,
        });
    }

    onAudioInputDeviceClick = (device: any) => {
        window.callsClient.setAudioInputDevice(device);
        this.setState({showAudioInputsMenu: false, currentAudioInputDevice: device});
    }

    renderScreenSharingPanel = () => {
        if (!this.props.screenSharingID || this.state.showMenu || this.state.showParticipantsList) {
            return null;
        }

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

        const msg = isSharing ? 'You are sharing your screen' : `Your are viewing ${getUserDisplayName(profile as UserProfile)}'s screen`;
        return (
            <div
                className='Menu'
                style={{}}
            >
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
                    <span style={{marginTop: '8px', color: 'rgba(63, 67, 80, 0.72)', fontSize: '12px'}}>{msg}</span>
                </ul>
            </div>
        );
    }

    renderScreenShareButton = () => {
        const sharingID = this.props.screenSharingID;
        const currentID = this.props.currentUserID;
        const isSharing = sharingID === currentID;

        return (
            <OverlayTrigger
                key='share_screen'
                placement='top'
                overlay={
                    <Tooltip
                        id='tooltip-mute'
                        style={{display: sharingID && !isSharing ? 'none' : ''}}
                    >
                        {isSharing ? 'Stop presenting' : 'Start presenting'}
                    </Tooltip>
                }
            >
                <button
                    className={`style--none ${!sharingID || isSharing ? 'button-controls' : 'button-controls-disabled'} button-controls--wide`}
                    disabled={sharingID !== '' && !isSharing}
                    style={{background: isSharing ? 'rgba(210, 75, 78, 0.12)' : ''}}
                    onClick={this.onShareScreenToggle}
                >
                    <ScreenIcon
                        style={{width: '16px', height: '16px', fill: isSharing ? 'rgba(210, 75, 78, 1)' : ''}}
                    />
                </button>
            </OverlayTrigger>
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
                    {speakingProfile ? getUserDisplayName(speakingProfile) : 'No one'}
                </span><span>{' is talking...'}</span>
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
                if (status) {
                    isMuted = !status.unmuted;
                    isSpeaking = Boolean(status.voice);
                }

                const MuteIcon = isMuted ? MutedIcon : UnmutedIcon;

                return (
                    <li
                        className='MenuItem'
                        key={'participants_profile_' + profile.id}
                        style={{display: 'flex', padding: '1px 16px'}}
                    >
                        <Avatar
                            size='sm'
                            url={this.props.pictures[idx]}
                            style={{marginRight: '8px'}}
                        />

                        <span className='MenuItem__primary-text'>
                            {getUserDisplayName(profile)}
                            { profile.id === this.props.currentUserID &&
                            <span style={{color: changeOpacity(this.props.theme.centerChannelColor, 0.56), whiteSpace: 'pre-wrap'}}>{' (you)'}</span>
                            }
                        </span>

                        <MuteIcon
                            fill={isMuted ? '#C4C4C4' : '#3DB887'}
                            style={{width: '14px', height: '14px', marginLeft: 'auto'}}
                        />
                    </li>
                );
            });
        };

        return (
            <div
                className='Menu'
                style={{}}
            >
                <ul
                    className='Menu__content dropdown-menu'
                    style={{bottom: 'calc(100% + 4px)', top: 'auto', width: '100%', minWidth: 'revert', maxWidth: 'revert', maxHeight: '188px', overflow: 'auto'}}
                >
                    { renderParticipants() }
                </ul>
            </div>
        );
    }

    renderAudioInputsMenu = () => {
        if (!this.state.showAudioInputsMenu) {
            return null;
        }
        return (
            <div className='Menu'>
                <ul
                    className='Menu__content dropdown-menu'
                    style={this.style.audioInputsMenu}
                >
                    {
                        this.state.devices.inputs.map((device: any, idx: number) => {
                            return (
                                <li
                                    className='MenuItem'
                                    key={'audio-input-device-' + idx}
                                >
                                    <button
                                        className='style--none'
                                        style={{background: device.deviceId === this.state.currentAudioInputDevice?.deviceId ? 'rgba(28, 88, 217, 0.12)' : ''}}
                                        onClick={() => this.onAudioInputDeviceClick(device)}
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

    renderAudioDevices = () => {
        if (!window.callsClient || !this.state.devices) {
            return null;
        }

        return (
            <React.Fragment>
                {this.renderAudioInputsMenu()}
                <li
                    className='MenuItem'
                >
                    <button
                        className='style--none'
                        style={{display: 'flex', flexDirection: 'column'}}
                        onClick={() => this.setState({showAudioInputsMenu: !this.state.showAudioInputsMenu, devices: window.callsClient?.getAudioDevices()})}
                    >
                        <div style={{display: 'flex', alignItems: 'center', justifyContent: 'flex-start', width: '100%'}}>
                            <UnmutedIcon
                                style={{width: '14px', height: '14px', marginRight: '8px', fill: changeOpacity(this.props.theme.centerChannelColor, 0.56)}}
                            />
                            <span
                                className='MenuItem__primary-text'
                                style={{padding: '0'}}
                            >{'Microphone'}</span>
                            <ShowMoreIcon
                                style={{width: '11px', height: '11px', marginLeft: 'auto', fill: changeOpacity(this.props.theme.centerChannelColor, 0.56)}}
                            />
                        </div>
                        <span
                            style={{
                                color: changeOpacity(this.props.theme.centerChannelColor, 0.56),
                                fontSize: '12px',
                                width: '100%',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                            }}
                        >
                            {this.state.currentAudioInputDevice?.label || 'Default'}
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

        return (
            <React.Fragment>
                <li
                    className='MenuItem'
                >
                    <button
                        className='style--none'
                        style={{
                            display: 'flex',
                            color: sharingID !== '' && !isSharing ? 'rgba(63, 67, 80, 0.34)' : '',
                        }}
                        disabled={Boolean(sharingID !== '' && !isSharing)}
                        onClick={this.onShareScreenToggle}
                    >
                        <ScreenIcon
                            style={{width: '16px', height: '16px', fill: isSharing ? 'rgba(210, 75, 78, 1)' : '', marginRight: '8px'}}
                        />
                        <span>{isSharing ? 'Stop presenting' : 'Start presenting'}</span>
                    </button>
                </li>
                <li className='MenuGroup menu-divider'/>
            </React.Fragment>
        );
    }

    renderMenu = (hasTeamSidebar: boolean) => {
        if (!this.state.showMenu) {
            return null;
        }

        const {channel} = this.props;
        return (
            <div className='Menu'>
                <ul
                    className='Menu__content dropdown-menu'
                    style={this.style.dotsMenu}
                >
                    {!hasTeamSidebar && this.renderScreenSharingMenuItem()}
                    {this.renderAudioDevices()}
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
                speakingPictureURL = this.props.pictures[i];
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
                        size='sm'
                        url={speakingPictureURL}
                    />
                }

                {
                    !speakingPictureURL &&
                    <Avatar
                        size='sm'
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

        // const expandedViewWindow = window.open(
        //     `/${this.props.team.name}/${pluginID}/expanded/${this.props.channel.id}`,
        //     'ExpandedView',
        //     'resizable=yes',
        // );

        // this.setState({
        //     expandedViewWindow,
        // });

        this.props.showExpandedView();
    }

    render() {
        if (!this.props.channel || !window.callsClient || !this.props.show) {
            return null;
        }

        const MuteIcon = window.callsClient.isMuted() ? MutedIcon : UnmutedIcon;
        const muteTooltipText = window.callsClient.isMuted() ? 'Click to unmute' : 'Click to mute';

        const hasTeamSidebar = Boolean(document.querySelector('.team-sidebar'));
        const mainWidth = hasTeamSidebar ? '280px' : '216px';

        return (
            <div
                style={{
                    ...this.style.main as CSSProperties,
                    width: mainWidth,
                }}
                ref={this.node}
            >
                <div style={this.style.status as CSSProperties}>
                    {this.renderScreenSharingPanel()}
                    {this.renderParticipantsList()}
                    {this.renderMenu(hasTeamSidebar)}

                    <div
                        style={this.style.topBar}
                        onMouseDown={this.onMouseDown}
                    >
                        <button
                            className='style--none button-controls button-controls--wide'
                            style={this.style.expandButton as CSSProperties}
                            onClick={this.onExpandClick}
                        >
                            <ExpandIcon
                                style={{width: '14px', height: '14px'}}
                                fill={changeOpacity(this.props.theme.centerChannelColor, 0.64)}
                            />
                        </button>

                        <div style={this.style.profiles}>
                            {this.renderProfiles()}
                        </div>
                        <div style={{width: '85%'}}>
                            {this.renderSpeaking()}
                            <div style={this.style.callInfo}>
                                <div style={{fontWeight: 600}}>{this.getCallDuration()}</div>
                                <div style={{margin: '0 2px 0 4px'}}>{'•'}</div>
                                {this.props.channel.type === 'O' ? <CompassIcon icon='globe'/> : <CompassIcon icon='lock'/>}
                                {this.props.channel.display_name}
                            </div>
                        </div>
                    </div>

                    <div style={this.style.bottomBar}>
                        <button
                            className='style--none button-controls button-controls--wide'
                            style={this.style.leaveCallButton}
                            onClick={this.onDisconnectClick}
                        >
                            <LeaveCallIcon
                                style={{width: '16px', height: '16px', fill: '#D24B4E'}}
                            />
                            <span
                                className='MenuItem__primary-text'
                                style={{color: '#D24B4E', fontSize: '12px', fontWeight: 600, marginLeft: '8px'}}
                            >{'Leave'}</span>
                        </button>

                        <button
                            id='voice-menu'
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
                                </Tooltip>
                            }
                        >
                            <button
                                className='style--none button-controls button-controls--wide'
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    color: this.state.showParticipantsList ? 'rgba(28, 88, 217, 1)' : '',
                                    background: this.state.showParticipantsList ? 'rgba(28, 88, 217, 0.12)' : '',
                                }}
                                onClick={this.onParticipantsButtonClick}
                            >
                                <ParticipantsIcon
                                    style={{width: '16px', height: '16px', marginRight: '4px'}}
                                />

                                <span
                                    style={{fontWeight: 600, color: changeOpacity(this.props.theme.centerChannelColor, 0.64)}}
                                >{this.props.profiles.length}</span>
                            </button>
                        </OverlayTrigger>

                        {hasTeamSidebar && this.renderScreenShareButton()}

                        <OverlayTrigger
                            key='mute'
                            placement='top'
                            overlay={
                                <Tooltip id='tooltip-mute'>
                                    {muteTooltipText}
                                </Tooltip>
                            }
                        >
                            <button
                                id='voice-mute-unmute'
                                className='cursor--pointer style--none button-controls'
                                style={window.callsClient.isMuted() ? this.style.mutedButton : this.style.unmutedButton}
                                onClick={this.onMuteToggle}
                            >
                                <MuteIcon
                                    style={{width: '16px', height: '16px', fill: window.callsClient.isMuted() ? '' : 'rgba(61, 184, 135, 1)'}}
                                />
                            </button>
                        </OverlayTrigger>
                    </div>
                </div>
            </div>
        );
    }
}

