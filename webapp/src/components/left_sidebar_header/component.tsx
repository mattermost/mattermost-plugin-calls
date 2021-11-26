import React from 'react';
import PropTypes from 'prop-types';
import {FormattedMessage} from 'react-intl';

import {OverlayTrigger, Tooltip} from 'react-bootstrap';

import {FontAwesomeIcon} from '@fortawesome/react-fontawesome';
import {faMicrophoneAlt, faMicrophoneAltSlash, faPhoneSlash} from '@fortawesome/free-solid-svg-icons';

// LeftSidebarHeader is a pure component, later connected to the Redux store so as to
// show the plugin's enabled / disabled status.
export default class LeftSidebarHeader extends React.PureComponent {
    static propTypes = {
        channel: PropTypes.object,
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

    render() {
        if (!this.props.channel) {
            return null;
        }

        const muteIcon = this.state.isMuted ? faMicrophoneAltSlash : faMicrophoneAlt;
        const muteStyle = this.state.isMuted ? style.unmuteButton : style.muteButton;
        const muteTooltipText = this.state.isMuted ? 'Unmute' : 'Mute';

        return (
            <div style={style.main}>
                <div>
                    <span style={{fontWeight: '600'}}>{'VOICE CONNECTION'}</span>
                </div>
                <div style={style.status}>
                    <span>{`${this.props.channel.display_name}`}</span>

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
                                    {'Disconnect'}
                                </Tooltip>
                            }
                        >

                            <button
                                id='voice-disconnect'
                                className='cursor--pointer style--none'
                                style={style.disconnectButton}
                                onClick={this.onDisconnectClick}
                            >
                                <FontAwesomeIcon icon={faPhoneSlash}/>
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
        margin: '16px 0 0 0',
        padding: '0 15px 0 15px',
        color: 'rgba(255,255,255,0.6)',
    },
    muteButton: {
        fontSize: '14px',
        margin: '4px',
    },
    unmuteButton: {
        fontSize: '14px',
        margin: '4px',
        color: '#E00000',
    },
    disconnectButton: {
        color: '#E00000',
        fontSize: '14px',
        margin: '4px',
    },
    status: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        width: '100%',
        marginTop: '4px',
    },
    controls: {
        display: 'flex',
        justifyContent: 'space-between',
    },
};
