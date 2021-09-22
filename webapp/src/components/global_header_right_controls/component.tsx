import React from 'react';
import PropTypes from 'prop-types';

import {OverlayTrigger, Tooltip} from 'react-bootstrap';

import Avatar, {TAvatarSizeToken} from '../avatar';

import MutedIcon from 'components/icons/muted_icon';
import UnmutedIcon from 'components/icons/unmuted_icon';
import LeaveCallIcon from 'components/icons/leave_call_icon';
import HorizontalDotsIcon from 'components/icons/horizontal_dots';
import ParticipantsIcon from 'components/icons/participants';
import ShowMoreIcon from 'components/icons/show_more';

import {handleFormattedTextClick} from 'browser_routing';
import {getUserDisplayName} from 'utils';

import './component.scss';

export default class GlobalHeaderRightControls extends React.PureComponent {
    private node: React.RefObject<HTMLDivElement>;

    static propTypes = {
        currentUserID: PropTypes.string,
        channel: PropTypes.object,
        channelURL: PropTypes.string,
        profiles: PropTypes.array,
        pictures: PropTypes.array,
        statuses: PropTypes.object,
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
    }

    public componentWillUnmount() {
        document.removeEventListener('click', this.closeOnBlur, true);
        document.removeEventListener('keyup', this.keyboardClose, true);
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

    onMuteToggle = () => {
        if (this.state.isMuted) {
            console.log('unmute');
            window.voiceClient.unmute();
            this.setState({isMuted: false});
        } else {
            console.log('mute!');
            window.voiceClient.mute();
            this.setState({isMuted: true});
        }
    }

    onDisconnectClick = () => {
        console.log('disconnect!');
        window.voiceClient.disconnect();
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
                style={{position: 'relative', left: '-100%'}}
            >
                <ul className='Menu__content dropdown-menu'>
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
                <ul className='Menu__content dropdown-menu'>
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

                    <li className='MenuGroup menu-divider'/>

                    {this.renderParticipantsList()}

                    <li
                        className='MenuItem'
                        onClick={this.onParticipantsClick}
                    >
                        <button
                            className='style--none'
                            style={{display: 'flex', alignItems: 'center'}}
                            onClick={this.onParticipantsButtonClick}
                        >
                            <ParticipantsIcon
                                style={{width: '16px', height: '16px', marginRight: '8px'}}
                                fill='rgba(61, 60, 64, 0.56)'
                            />

                            <span className='MenuItem__primary-text'>Participants</span>

                            <div style={{display: 'flex', alignItems: 'center', marginLeft: 'auto', fontSize: '12px'}}>
                                <span style={{color: 'rgba(61, 60, 64, 0.56)'}}>{this.props.profiles.length}</span>
                                <ShowMoreIcon
                                    style={{width: '11px', height: '11px', marginLeft: '4px'}}
                                    fill='rgba(61, 60, 64, 0.56)'
                                />
                            </div>
                        </button>
                    </li>

                    <li className='MenuGroup menu-divider'/>

                    <li
                        className='MenuItem'
                        onClick={this.onDisconnectClick}
                    >
                        <button
                            className='style--none'
                            style={{display: 'flex', alignItems: 'center'}}
                        >
                            <LeaveCallIcon
                                style={{width: '16px', height: '16px', marginRight: '8px'}}
                                fill='#D24B4E'
                            />
                            <span
                                className='MenuItem__primary-text'
                                style={{color: '#D24B4E'}}
                            >Leave call</span>
                        </button>
                    </li>
                </ul>
            </div>
        );
    }

    renderProfiles = () => {
        return this.props.profiles.map((profile, idx) => {
            const status = this.props.statuses[profile.id];
            let isMuted = true;
            let isSpeaking = false;
            if (status) {
                isMuted = !status.unmuted;
                isSpeaking = status.voice;
            }

            return (
                <div
                    key={'call_profile_' + profile.id}
                    style={{position: 'relative', display: 'flex', height: 'auto', alignItems: 'center'}}
                >
                    <OverlayTrigger
                        placement='bottom'
                        overlay={
                            <Tooltip id='tooltip-username'>
                                { profile.username }
                            </Tooltip>
                        }
                    >

                        <Avatar
                            size='sm'
                            url={this.props.pictures[idx]}
                            style={{boxShadow: isSpeaking ? '0 0 0 2px rgba(255, 255, 255, 0.7)' : ''}}
                        />

                    </OverlayTrigger>
                    <div
                        className='user_call_status'
                        style={{display: isMuted ? 'block' : 'none', position: 'absolute', top: 'auto', bottom: '-4px', right: '-4px', fontSize: '12px', color: 'red'}}
                    >
                        <MutedIcon fill='red'/>
                    </div>
                </div>
            );
        });
    }

    render() {
        if (!this.props.channel) {
            return null;
        }

        const MuteIcon = this.state.isMuted ? MutedIcon : UnmutedIcon;
        const muteIconStyle = this.state.isMuted ? style.MutedIcon : style.UnmutedIcon;
        const muteTooltipText = this.state.isMuted ? 'Unmute' : 'Mute';

        return (
            <div
                style={style.main}
                ref={this.node}
            >
                <div style={style.status}>

                    <div style={style.profiles}>
                        {this.renderProfiles()}
                    </div>

                    <div style={style.controls}>
                        <OverlayTrigger
                            key='mute'
                            placement='bottom'
                            overlay={
                                <Tooltip id='tooltip-mute'>
                                    { muteTooltipText }
                                </Tooltip>
                            }
                        >
                            <button
                                id='voice-mute-unmute'
                                className='cursor--pointer style--none'
                                style={this.state.isMuted ? style.mutedButton : style.unmutedButton}
                                onClick={this.onMuteToggle}
                            >
                                <MuteIcon
                                    fill='rgba(255, 255, 255, 0.8)'
                                    style={{width: '16px', height: '16px'}}
                                />
                            </button>
                        </OverlayTrigger>

                        {/* <OverlayTrigger */}
                        {/*     key='disconnect' */}
                        {/*     placement='bottom' */}
                        {/*     overlay={ */}
                        {/*         <Tooltip id='tooltip-disconnect'> */}
                        {/*             {'Leave Call'} */}
                        {/*         </Tooltip> */}
                        {/*     } */}
                        {/* > */}

                        {/*     <button */}
                        {/*         id='voice-disconnect' */}
                        {/*         className='cursor--pointer style--none' */}
                        {/*         style={style.disconnectButton} */}
                        {/*         onClick={this.onDisconnectClick} */}
                        {/*     > */}
                        {/*         <LeaveCallIcon */}
                        {/*             style={{width: '16px', height: '16px'}} */}
                        {/*             fill='white' */}
                        {/*         /> */}
                        {/*     </button> */}
                        {/* </OverlayTrigger> */}

                        <button
                            id='voice-menu'
                            className='cursor--pointer style--none'
                            style={style.menuButton}
                            onClick={this.onMenuClick}
                        >
                            <HorizontalDotsIcon
                                style={{width: '16px', height: '16px'}}
                                fill='white'
                            />
                        </button>

                        {this.renderMenu()}

                    </div>
                </div>
            </div>
        );
    }
}

const style = {
    main: {
        position: 'relative',
        padding: '0 8px',
        background: 'rgba(255, 255, 255, 0.08)',
        borderRadius: '4px',
        height: '32px',
        display: 'flex',
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
    },
    mutedIcon: {
    },
    unmutedIcon: {
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
        justifyContent: 'space-between',
        alignItems: 'center',
        width: '100%',
    },
    controls: {
        display: 'flex',
        justifyContent: 'space-between',
    },
    profiles: {
        display: 'flex',
        marginRight: '16px',
    },
    menuButton: {
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        color: 'color: rgba(255, 255, 255, 0.8)',
        fontSize: '14px',
        margin: '0 8px',
        width: '24px',
        height: '24px',
    },
    menu: {
        position: 'absolute',
        background: 'white',
        color: 'black',
    },
};
