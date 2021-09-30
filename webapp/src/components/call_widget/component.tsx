import React from 'react';
import PropTypes from 'prop-types';

import {OverlayTrigger, Tooltip} from 'react-bootstrap';

import moment from 'moment-timezone';

import Avatar, {TAvatarSizeToken} from '../avatar';

import MutedIcon from 'components/icons/muted_icon';
import UnmutedIcon from 'components/icons/unmuted_icon';
import LeaveCallIcon from 'components/icons/leave_call_icon';
import HorizontalDotsIcon from 'components/icons/horizontal_dots';
import ParticipantsIcon from 'components/icons/participants';
import ShowMoreIcon from 'components/icons/show_more';
import CompassIcon from 'components/icons/compassIcon';
import ScreenIcon from 'components/icons/screen_icon';

import {handleFormattedTextClick} from 'browser_routing';
import {getUserDisplayName} from 'utils';
import './component.scss';

export default class CallWidget extends React.PureComponent {
    private node: React.RefObject<HTMLDivElement>;

    static propTypes = {
        currentUserID: PropTypes.string,
        channel: PropTypes.object,
        channelURL: PropTypes.string,
        profiles: PropTypes.array,
        pictures: PropTypes.array,
        statuses: PropTypes.object,
        callStartAt: PropTypes.number,
        screenSharingID: PropTypes.string,
    }

    constructor(props) {
        super(props);
        this.state = {
            isMuted: true,
            showMenu: false,
            showParticipantsList: false,
        };
        this.node = React.createRef();
    }

    public componentDidMount() {
        document.addEventListener('click', this.closeOnBlur, true);
        document.addEventListener('keyup', this.keyboardClose, true);

        // This is needed to force a re-render to periodically update
        // the start time.
        const id = setInterval(() => this.forceUpdate(), 1000);
        this.setState({
            intervalID: id,
        });
    }

    public componentWillUnmount() {
        document.removeEventListener('click', this.closeOnBlur, true);
        document.removeEventListener('keyup', this.keyboardClose, true);
        if (this.state.intervalID) {
            clearInterval(this.state.intervalID);
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

    onShareScreenToggle = () => {
        if (this.props.screenSharingID === this.props.currentUserID) {
            window.callsClient.unshareScreen();
        } else if (!this.props.screenSharingID) {
            window.callsClient.shareScreen();
        }
    }

    onMuteToggle = () => {
        if (this.state.isMuted) {
            console.log('unmute');
            window.callsClient.unmute();
            this.setState({isMuted: false});
        } else {
            console.log('mute!');
            window.callsClient.mute();
            this.setState({isMuted: true});
        }
    }

    onDisconnectClick = () => {
        console.log('disconnect!');
        window.callsClient.disconnect();
        this.setState({
            isMuted: true,
            showMenu: false,
            showParticipantsList: false,
        });
    }

    onMenuClick = () => {
        this.setState({
            showMenu: !this.state.showMenu,
        });
    }

    onParticipantsButtonClick = () => {
        this.setState({
            showParticipantsList: !this.state.showParticipantsList,
        });
    }

    renderScreenSharingPanel = () => {
        if (!this.props.screenSharingID) {
            return null;
        }

        let profile;
        if (this.props.screenSharingID !== this.props.currentUserID) {
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

        const msg = this.props.screenSharingID === this.props.currentUserID ? 'You are sharing your screen' : `Your are viewing ${getUserDisplayName(profile)}'s screen`;
        return (
            <div
                className='Menu'
                style={{}}
            >
                <ul
                    className='Menu__content dropdown-menu'
                    style={style.screenSharingPanel}
                >

                    <div
                        id='screen-player'
                        style={{width: '192px', height: '108px', background: '#C4C4C4'}}
                    />
                    <span style={{marginTop: 'auto', color: 'rgba(63, 67, 80, 0.72)', fontSize: '12px'}}>{msg}</span>
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
                        {isSharing ? 'Stop sharing' : 'Share screen'}
                    </Tooltip>
                }
            >
                <button
                    className={`style--none ${!sharingID || isSharing ? 'button-controls' : 'button-controls-disabled'} button-controls--wide`}
                    disabled={sharingID && !isSharing}
                    style={{background: isSharing ? '#D24B4E' : ''}}
                    onClick={this.onShareScreenToggle}
                >
                    <ScreenIcon
                        style={{width: '16px', height: '16px', fill: isSharing ? 'white' : ''}}
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
        if (!speakingProfile) {
            return null;
        }
        return (
            <div style={{fontSize: '12px'}}><span style={{fontWeight: '600'}}>{getUserDisplayName(speakingProfile)}</span> is talking...</div>
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
                    isSpeaking = status.voice;
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
                            <span style={{color: 'rgba(61, 60, 64, 0.56)'}}>&nbsp;(you)</span>
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
                    style={{bottom: 'calc(100% + 4px)', top: 'auto', width: '100%', minWidth: 'revert', maxWidth: 'revert'}}
                >
                    { renderParticipants() }
                </ul>
            </div>
        );
    }

    renderMenu = () => {
        if (!this.state.showMenu) {
            return null;
        }

        const {channel} = this.props;
        return (
            <div className='Menu'>
                <ul
                    className='Menu__content dropdown-menu'
                    style={{bottom: 'calc(100% + 4px)', top: 'auto'}}
                >
                    <li className='MenuItem'>
                        <span
                            className='MenuItem__primary-text'
                            style={{padding: '1px 16px'}}
                        >
                            <span>Call in</span>
                                &nbsp;
                            <a
                                className='mention-link'
                                style={{color: 'rgb(56, 111, 229)'}}
                                onClick={((e) => handleFormattedTextClick(e, this.props.channelURL))}
                            >{`~${channel.display_name}`}</a>
                        </span>
                    </li>
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
        if (!speakingPictureURL) {
            return null;
        }

        return (
            <div
                style={{position: 'relative', display: 'flex', height: 'auto', alignItems: 'center'}}
            >
                <Avatar
                    size='sm'
                    url={speakingPictureURL}
                />
            </div>
        );
    }

    render() {
        if (!this.props.channel) {
            return null;
        }

        const MuteIcon = this.state.isMuted ? MutedIcon : UnmutedIcon;
        const muteIconStyle = this.state.isMuted ? style.MutedIcon : style.UnmutedIcon;
        const muteTooltipText = this.state.isMuted ? 'Unmute' : 'Mute';

        const mainWidth = document.querySelector('.team-sidebar') ? '280px' : '216px';

        return (
            <div
                style={{
                    ...style.main,
                    width: mainWidth,
                }}
                ref={this.node}
            >
                <div style={style.status}>

                    {this.renderScreenSharingPanel()}
                    {this.renderParticipantsList()}
                    {this.renderMenu()}

                    <div style={style.topBar}>
                        <div style={style.profiles}>
                            {this.renderProfiles()}
                        </div>
                        <div>
                            {this.renderSpeaking()}
                            <div style={style.callInfo}>
                                <div style={{fontWeight: '600'}}>{this.getCallDuration()}</div>
                                <div style={{margin: '0 2px 0 4px'}}>•</div>
                                {this.props.channel.type === 'O' ? <CompassIcon icon='globe'/> : <CompassIcon icon='lock'/>}
                                {this.props.channel.display_name}
                            </div>
                        </div>
                    </div>

                    <div style={style.bottomBar}>
                        <button
                            className='style--none button-controls button-controls--wide'
                            style={style.leaveCallButton}
                            onClick={this.onDisconnectClick}
                        >
                            <LeaveCallIcon
                                style={{width: '16px', height: '16px'}}
                                fill='#D24B4E'
                            />
                            <span
                                className='MenuItem__primary-text'
                                style={{color: '#D24B4E', fontSize: '12px', fontWeight: 600, marginLeft: '8px'}}
                            >Leave</span>
                        </button>

                        <button
                            id='voice-menu'
                            className='cursor--pointer style--none button-controls'
                            style={style.menuButton}
                            onClick={this.onMenuClick}
                        >
                            <HorizontalDotsIcon
                                style={{width: '16px', height: '16px'}}
                            />
                        </button>

                        <button
                            className='style--none button-controls button-controls--wide'
                            style={{display: 'flex', alignItems: 'center', color: this.state.showParticipantsList ? 'white' : '', background: this.state.showParticipantsList ? '#1C58D9' : ''}}
                            onClick={this.onParticipantsButtonClick}
                        >
                            <ParticipantsIcon
                                style={{width: '16px', height: '16px', marginRight: '4px'}}
                            />

                            <span
                                className='MenuItem__primary-text'
                                style={{fontWeight: '600'}}
                            >{this.props.profiles.length}</span>
                        </button>

                        {this.renderScreenShareButton()}

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
                                style={this.state.isMuted ? style.mutedButton : style.unmutedButton}
                                onClick={this.onMuteToggle}
                            >
                                <MuteIcon
                                    style={{width: '16px', height: '16px'}}
                                />
                            </button>
                        </OverlayTrigger>
                    </div>
                </div>
            </div>
        );
    }
}

const style = {
    main: {
        position: 'fixed',
        background: 'rgba(255, 255, 255, 1)',
        borderRadius: '8px',
        display: 'flex',
        bottom: '12px',
        left: '12px',
        zIndex: '20',
        border: '1px solid rgba(63, 67, 80, 0.3)',
    },
    topBar: {
        background: 'rgba(63, 67, 80, 0.04)',
        padding: '0 12px',
        display: 'flex',
        width: '100%',
        alignItems: 'center',
        height: '44px',
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
        background: '#3DB887',
        borderRadius: '4px',
        color: 'white',
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
        color: 'color: rgba(255, 255, 255, 0.8)',
        fontSize: '14px',
        width: '24px',
        height: '24px',
    },
    menu: {
        position: 'absolute',
        background: 'white',
        color: 'black',
    },
    screenSharingPanel: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        bottom: 'calc(100% + 4px)',
        top: 'auto',
        width: '100%',
        height: '150px',
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
};
