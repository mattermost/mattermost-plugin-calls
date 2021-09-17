import React from 'react';
import PropTypes from 'prop-types';
import {FormattedMessage} from 'react-intl';

import {OverlayTrigger, Tooltip} from 'react-bootstrap';

import {FontAwesomeIcon} from '@fortawesome/react-fontawesome';
import {faMicrophoneAlt, faMicrophoneAltSlash, faPhoneSlash} from '@fortawesome/free-solid-svg-icons';

import Avatar, {TAvatarSizeToken} from '../avatar';

export default class GlobalHeaderRightControls extends React.PureComponent {
    static propTypes = {
        channel: PropTypes.object,
        profiles: PropTypes.array,
        pictures: PropTypes.array,
        statuses: PropTypes.object,
    }

    constructor(props) {
        super(props);
        this.state = {
            isMuted: true,
        };
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
        this.setState({isMuted: true});
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
                        <FontAwesomeIcon icon={faMicrophoneAltSlash}/>
                    </div>
                </div>
            );
        });
    }

    render() {
        if (!this.props.channel) {
            return null;
        }

        const muteIcon = this.state.isMuted ? faMicrophoneAltSlash : faMicrophoneAlt;
        const muteStyle = this.state.isMuted ? style.unmuteButton : style.muteButton;
        const muteTooltipText = this.state.isMuted ? 'Unmute' : 'Mute';

        return (
            <div style={style.main}>
                <div style={style.status}>
                    {/* <span>{`${this.props.channel.display_name}`}</span> */}

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
                                style={muteStyle}
                                onClick={this.onMuteToggle}
                            >
                                <FontAwesomeIcon icon={muteIcon}/>
                            </button>
                        </OverlayTrigger>

                        <OverlayTrigger
                            key='disconnect'
                            placement='bottom'
                            overlay={
                                <Tooltip id='tooltip-disconnect'>
                                    {'Leave Call'}
                                </Tooltip>
                            }
                        >

                            <button
                                id='voice-disconnect'
                                className='cursor--pointer style--none'
                                style={style.disconnectButton}
                                onClick={this.onDisconnectClick}
                            >
                                {/* <FontAwesomeIcon icon={faPhoneSlash}/> */}

                                <svg
                                    width='16'
                                    height='6'
                                    viewBox='0 0 16 6'
                                    fill='none'
                                    xmlns='http://www.w3.org/2000/svg'
                                    style={{width: '20px', height: '20px'}}
                                >
                                    <path
                                        d='M8 1.8C7.04375 1.8 6.125 1.94063 5.24375 2.22188V4.07813C5.24375 4.34063 5.13125 4.52813 4.90625 4.64063C4.34375 4.92188 3.80938 5.2875 3.30313 5.7375C3.19063 5.85 3.05 5.90625 2.88125 5.90625C2.7125 5.90625 2.57188 5.85 2.45938 5.7375L0.96875 4.24688C0.85625 4.13438 0.8 3.99375 0.8 3.825C0.8 3.65625 0.85625 3.51563 0.96875 3.40313C1.90625 2.52188 2.96563 1.8375 4.14688 1.35C5.38438 0.84375 6.66875 0.590625 8 0.590625C9.33125 0.590625 10.6156 0.84375 11.8531 1.35C13.0344 1.8375 14.0937 2.52188 15.0312 3.40313C15.1437 3.51563 15.2 3.65625 15.2 3.825C15.2 3.99375 15.1437 4.13438 15.0312 4.24688L13.5406 5.7375C13.4281 5.85 13.2875 5.90625 13.1187 5.90625C12.95 5.90625 12.8094 5.85 12.6969 5.7375C12.2094 5.2875 11.675 4.92188 11.0937 4.64063C10.8687 4.52813 10.7562 4.34063 10.7562 4.07813V2.22188C9.875 1.94063 8.95625 1.8 8 1.8Z'
                                        fill='white'
                                    />
                                </svg>

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
        padding: '0 8px',
        background: 'rgba(255, 255, 255, 0.08)',
        borderRadius: '4px',
        height: '32px',
        display: 'flex',
    },
    muteButton: {
        fontSize: '15px',
        margin: '0 8px',
        width: '24px',
        heigth: '24px',
        color: 'color: rgba(255, 255, 255, 0.8)',
    },
    unmuteButton: {
        fontSize: '15px',
        margin: '0 8px',
        width: '24px',
        heigth: '24px',
        color: 'color: rgba(255, 255, 255, 0.8)',
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
};
