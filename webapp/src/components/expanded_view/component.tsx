import React, {CSSProperties} from 'react';
import {Dispatch} from 'redux';
import {GenericAction} from 'mattermost-redux/types/actions';

import moment from 'moment-timezone';

import {UserProfile} from 'mattermost-redux/types/users';

import {getUserDisplayName} from '../../utils';

import Avatar from '../avatar/avatar';

import CompassIcon from '../../components/icons/compassIcon';
import LeaveCallIcon from '../../components/icons/leave_call_icon';
import MutedIcon from '../../components/icons/muted_icon';
import UnmutedIcon from '../../components/icons/unmuted_icon';
import ScreenIcon from '../../components/icons/screen_icon';
import RaisedHandIcon from '../../components/icons/raised_hand';

import './component.scss';

interface Props {
    show: boolean,
    currentUserID: string,
    profiles: UserProfile[],
    pictures: string[],
    statuses: {
        [key: string]: {
            voice?: boolean,
            unmuted?: boolean,
        },
    },
    callStartAt: number,
    hideExpandedView: () => void,
}

interface State {
    show: boolean,
    intervalID?: NodeJS.Timer,
}

export default class ExpandedView extends React.PureComponent<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = {
            show: false,
        };
    }

    getCallDuration = () => {
        const dur = moment.utc(moment().diff(moment(this.props.callStartAt)));
        if (dur.hours() === 0) {
            return dur.format('mm:ss');
        }
        return dur.format('HH:mm:ss');
    }

    onDisconnectClick = () => {
        // if (this.state.screenWindow) {
        //     this.state.screenWindow.close();
        // }
        const callsClient = window.opener ? window.opener.callsClient : window.callsClient;
        if (callsClient) {
            callsClient.disconnect();
            delete window.callsClient;
            if (window.opener) {
                window.close();
            }
        }
        this.setState({
            show: false,
        });
    }

    onMuteToggle = () => {
        const callsClient = window.opener ? window.opener.callsClient : window.callsClient;
        if (callsClient.isMuted()) {
            callsClient.unmute();
        } else {
            callsClient.mute();
        }
    }

    public componentDidMount() {
        // This is needed to force a re-render to periodically update
        // the start time.
        const id = setInterval(() => this.forceUpdate(), 1000);
        // eslint-disable-next-line react/no-did-mount-set-state
        this.setState({
            intervalID: id,
        });
    }

    public componentWillUnmount() {
        if (this.state.intervalID) {
            clearInterval(this.state.intervalID);
        }
    }

    renderParticipants = () => {
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
                    key={'participants_profile_' + idx}
                    style={{display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', margin: '16px'}}
                >

                    <div style={{position: 'relative'}}>
                        <Avatar
                            size='xl'
                            url={this.props.pictures[0]}
                            style={{
                                boxShadow: isSpeaking ? '0px 0px 4px 4px rgba(61, 184, 135, 0.8)' : '',
                            }}
                        />
                        <div
                            style={{
                                position: 'absolute',
                                display: 'flex',
                                justifyContent: 'center',
                                alignItems: 'center',
                                bottom: 0,
                                right: 0,
                                background: 'rgba(37, 38, 42, 1)',
                                borderRadius: '30px',
                                width: '20px',
                                height: '20px',
                            }}
                        >
                            <MuteIcon
                                fill={isMuted ? '#C4C4C4' : '#3DB887'}
                                style={{width: '14px', height: '14px'}}
                            />
                        </div>
                    </div>

                    <span style={{fontWeight: 600, fontSize: '12px', margin: '8px 0'}}>
                        {getUserDisplayName(profile)}{profile.id === this.props.currentUserID && ' (you)'}
                    </span>

                </li>
            );
        });
    }

    render() {
        if ((!this.props.show || !window.callsClient) && !window.opener) {
            return null;
        }

        const callsClient = window.opener ? window.opener.callsClient : window.callsClient;
        const MuteIcon = callsClient.isMuted() ? MutedIcon : UnmutedIcon;
        const muteButtonText = callsClient.isMuted() ? 'Unmute' : 'Mute';

        return (
            <div style={style.main as CSSProperties}>
                <div style={style.topLeftContainer as CSSProperties}>
                    <span style={{margin: '4px', fontWeight: 600}}>{this.getCallDuration()}</span>
                    <span style={{margin: '4px'}}>{'•'}</span>
                    <span style={{margin: '4px'}}>{`${this.props.profiles.length} participants`}</span>

                </div>
                {
                    !window.opener &&
                    <button
                        className='button-close'
                        style={style.closeViewButton as CSSProperties}
                        onClick={this.props.hideExpandedView}
                    >
                        <CompassIcon icon='close'/>
                    </button>
                }
                <ul style={style.participants as CSSProperties}>
                    { this.renderParticipants() }
                </ul>
                <div style={style.controls}>
                    <div style={{flex: '1'}}/>
                    <div style={style.centerControls}>

                        <div style={style.buttonContainer as CSSProperties}>
                            <button
                                className='button-center-controls'
                            >
                                <ScreenIcon
                                    style={{width: '28px', height: '28px'}}
                                    fill='white'
                                />

                            </button>
                            <span
                                style={{fontSize: '14px', fontWeight: 600, marginTop: '12px'}}
                            >{'Share screen'}</span>
                        </div>

                        <div style={style.buttonContainer as CSSProperties}>
                            <button
                                className='button-center-controls'
                                onClick={this.onMuteToggle}
                            >
                                <MuteIcon
                                    style={{width: '28px', height: '28px'}}
                                    fill='white'
                                />

                            </button>
                            <span
                                style={{fontSize: '14px', fontWeight: 600, marginTop: '12px'}}
                            >{muteButtonText}</span>
                        </div>

                        <div style={style.buttonContainer as CSSProperties}>
                            <button
                                className='button-center-controls'
                            >
                                <RaisedHandIcon
                                    style={{width: '28px', height: '28px'}}
                                    fill='white'
                                />

                            </button>
                            <span
                                style={{fontSize: '14px', fontWeight: 600, marginTop: '12px'}}
                            >{'Raise hand'}</span>
                        </div>

                    </div>

                    <div style={{flex: '1', display: 'flex', justifyContent: 'flex-end'}}>
                        <button
                            className='button-leave'
                            onClick={this.onDisconnectClick}
                        >

                            <LeaveCallIcon
                                style={{width: '24px', height: '24px'}}
                                fill='white'
                            />
                            <span
                                style={{fontSize: '18px', fontWeight: 600, marginLeft: '8px'}}
                            >{'Leave'}</span>

                        </button>
                    </div>
                </div>
            </div>
        );
    }
}

const style = {
    main: {
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        background: 'rgba(37, 38, 42, 1)',
        color: 'white',
        zIndex: 100,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
    },
    closeViewButton: {
        position: 'absolute',
        top: '16px',
        right: '16px',
        fontSize: '24px',
    },
    participants: {
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        flexWrap: 'wrap',
        overflow: 'auto',
        maxHeight: '80%',
        flex: '1',
        padding: '0',
        margin: '40px 0',
        width: '50%',
    },
    controls: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 'auto',
        padding: '0 16px 16px 16px',
        width: '100%',
    },
    centerControls: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
    },
    buttonContainer: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        margin: '0 16px',
    },
    topLeftContainer: {
        position: 'absolute',
        top: '16px',
        left: '16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '16px',
    },
};
