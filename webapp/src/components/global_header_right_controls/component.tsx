import React from 'react';
import PropTypes from 'prop-types';
import {FormattedMessage} from 'react-intl';

import {OverlayTrigger, Tooltip} from 'react-bootstrap';

import Avatar, {TAvatarSizeToken} from '../avatar';

import MutedIcon from 'components/icons/muted_icon';
import UnmutedIcon from 'components/icons/unmuted_icon';
import LeaveCallIcon from 'components/icons/leave_call_icon';

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
                                style={style.muteButton}
                                onClick={this.onMuteToggle}
                            >
                                <MuteIcon fill='rgba(255, 255, 255, 0.8)'/>
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
                                <LeaveCallIcon
                                    style={{width: '20px', height: '20px'}}
                                    fill='white'
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
        padding: '0 8px',
        background: 'rgba(255, 255, 255, 0.08)',
        borderRadius: '4px',
        height: '32px',
        display: 'flex',
    },
    muteButton: {
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        width: '24px',
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
};
