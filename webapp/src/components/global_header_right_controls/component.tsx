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
import CompassIcon from 'components/icons/compassIcon';


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
                <ul
                    className='Menu__content dropdown-menu'
                    style={{bottom: 'calc(100% + 4px)', top: 'auto'}}
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
        return this.props.profiles.map((profile, idx) => {
            const status = this.props.statuses[profile.id];
            let isSpeaking = false;
            if (status) {
                isSpeaking = status.voice;
            }

            return (
                <div
                    key={'call_profile_' + profile.id}
                    style={{position: 'relative', display: 'flex', height: 'auto', alignItems: 'center'}}
                >
                    <Avatar
                        size='sm'
                        url={this.props.pictures[idx]}
                        style={{boxShadow: isSpeaking ? '0 0 0 2px rgba(255, 255, 255, 0.7)' : ''}}
                    />
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

                    <div style={style.topBar}>
                        <div style={style.profiles}>
                            {this.renderProfiles()}
                        </div>
                        <div>
                            <div style={{ fontSize: '12px' }}><span style={{ fontWeight: '600' }}>Lance Riley</span> is talking...</div>
                            <div style={style.callInfo}>
                                <div style={{ fontWeight: '600' }}>3:39</div>
                                <div style={{ margin: '0 2px 0 4px' }}>•</div>
                                {this.props.channel.type === 'O' ? <CompassIcon icon='globe'/> : <CompassIcon icon='lock'/>}
                                {this.props.channel.display_name}
                            </div>
                        </div>
                    </div>

                    <div style={style.bottomBar}>
                        <button
                            className='style--none'
                            style={{ display: 'flex', alignItems: 'center', padding: '0 8px', height: '28px', borderRadius: '4px', background: 'rgba(210, 75, 78, 0.04)'}}
                            onClick={this.onDisconnectClick}
                        >
                            <LeaveCallIcon
                                style={{width: '16px', height: '16px', marginRight: '8px'}}
                                fill='#D24B4E'
                            />
                            <span
                                className='MenuItem__primary-text'
                                style={{color: '#D24B4E', fontSize: '12px', fontWeight: 600}}
                            >Leave</span>
                        </button>

                        <div>
                            <div style={style.controls}>
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
                                    className='cursor--pointer style--none button-controls'
                                    style={style.menuButton}
                                    onClick={this.onMenuClick}
                                >
                                    <HorizontalDotsIcon
                                        style={{ width: '16px', height: '16px' }}
                                    />
                                </button>
                                {this.renderMenu()}

                                {this.renderParticipantsList()}

                                <div
                                    className='MenuItem'
                                >
                                    <button
                                        className='style--none button-controls button-controls--wide'
                                        style={{ display: 'flex', alignItems: 'center' }}
                                        onClick={this.onParticipantsButtonClick}
                                    >
                                        <ParticipantsIcon
                                            style={{ width: '16px', height: '16px', marginRight: '4px' }}
                                        />

                                        <span className='MenuItem__primary-text'>{this.props.profiles.length}</span>
                                    </button>
                                </div>

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
                                            style={{ width: '16px', height: '16px' }}
                                        />
                                    </button>
                                </OverlayTrigger>
                            </div>
                        </div>
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
        width: '216px',
        zIndex: '20',
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
        justifyContent: 'space-between',
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
        flexDirection: 'column',
        justifyContent: 'space-between',
        alignItems: 'center',
        width: '100%',
    },
    controls: {
        display: 'flex',
        justifyContent: 'space-between',
    },
    callInfo: {
        display: 'flex',
        fontSize: '10px',
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
