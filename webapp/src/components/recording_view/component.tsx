import React, {CSSProperties} from 'react';

import moment from 'moment-timezone';

import {Channel} from 'mattermost-redux/types/channels';
import {UserProfile} from 'mattermost-redux/types/users';

import {getUserDisplayName, getScreenStream, isDMChannel} from 'src/utils';
import {UserState} from 'src/types/types';

import Avatar from '../avatar/avatar';

import CompassIcon from '../../components/icons/compassIcon';
import MutedIcon from '../../components/icons/muted_icon';
import UnmutedIcon from '../../components/icons/unmuted_icon';
import ScreenIcon from '../../components/icons/screen_icon';
import RaisedHandIcon from '../../components/icons/raised_hand';

interface Props {
    show: boolean,
    currentUserID: string,
    profiles: UserProfile[],
    pictures: {
        [key: string]: string,
    },
    statuses: {
        [key: string]: UserState,
    },
    callStartAt: number,
    screenSharingID: string,
    channel: Channel,
    connectedDMUser: UserProfile | undefined,
    connected: boolean,
}

interface State {
    intervalID?: NodeJS.Timer,
    screenStream: MediaStream | null,
    initialized: boolean,
}

const style = {
    root: {
        position: 'absolute',
        display: 'flex',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: 100,
        background: 'rgba(37, 38, 42, 1)',
        color: 'white',
    },
    main: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        flex: '1',
    },
    screenContainer: {
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        margin: 'auto',
        height: 'calc(100% - 80px)',
    },
    participants: {
        display: 'grid',
        overflow: 'hidden',
        margin: 'auto',
        padding: '20px',
    },
    topLeftContainer: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '16px',
        marginRight: 'auto',
        padding: '4px',
    },
};

export default class RecordingView extends React.PureComponent<Props, State> {
    private screenPlayer = React.createRef<HTMLVideoElement>()

    constructor(props: Props) {
        super(props);
        this.state = {
            screenStream: null,
            initialized: false,
        };
        this.screenPlayer = React.createRef();
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

    public componentDidUpdate(prevProps: Props) {
        if (this.state.screenStream && this.screenPlayer.current && this.screenPlayer.current.srcObject !== this.state.screenStream) {
            this.screenPlayer.current.srcObject = this.state.screenStream;
        }

        if (!this.state.initialized && !prevProps.connected && this.props.connected) {
            console.log('initializing');

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

            // eslint-disable-next-line react/no-did-update-set-state
            this.setState({initialized: true});
        }
    }

    getCallDuration = () => {
        const dur = moment.utc(moment().diff(moment(this.props.callStartAt)));
        if (dur.hours() === 0) {
            return dur.format('mm:ss');
        }
        return dur.format('HH:mm:ss');
    }

    renderParticipants = () => {
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
                    key={'participants_profile_' + idx}
                    style={{display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', margin: '16px'}}
                >

                    <div style={{position: 'relative'}}>
                        <Avatar
                            size={50}
                            fontSize={18}
                            border={false}
                            url={this.props.pictures[profile.id]}
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
                                background: 'rgba(50, 50, 50, 1)',
                                borderRadius: '30px',
                                width: '20px',
                                height: '20px',
                            }}
                        >
                            <MuteIcon
                                fill={isMuted ? '#C4C4C4' : '#3DB887'}
                                style={{width: '14px', height: '14px'}}
                                stroke={isMuted ? '#C4C4C4' : ''}
                            />
                        </div>
                        <div
                            style={{
                                position: 'absolute',
                                display: isHandRaised ? 'flex' : 'none',
                                justifyContent: 'center',
                                alignItems: 'center',
                                top: 0,
                                right: 0,
                                background: 'rgba(50, 50, 50, 1)',
                                borderRadius: '30px',
                                width: '20px',
                                height: '20px',
                                fontSize: '12px',
                            }}
                        >
                            {'✋'}
                        </div>
                    </div>

                    <span style={{fontWeight: 600, fontSize: '12px', margin: '8px 0'}}>
                        {getUserDisplayName(profile)}{profile.id === this.props.currentUserID && ' (you)'}
                    </span>

                </li>
            );
        });
    }

    renderScreenSharingPlayer = () => {
        let profile;
        for (let i = 0; i < this.props.profiles.length; i++) {
            if (this.props.profiles[i].id === this.props.screenSharingID) {
                profile = this.props.profiles[i];
                break;
            }
        }
        if (!profile) {
            return null;
        }

        return (
            <div style={style.screenContainer as CSSProperties}>
                <video
                    id='screen-player'
                    ref={this.screenPlayer}
                    width='100%'
                    height='100%'
                    muted={false}
                    autoPlay={true}
                    controls={false}
                />
                <span
                    style={{
                        background: 'black',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        color: 'white',
                        marginTop: '8px',
                    }}
                >
                    {`You are viewing ${getUserDisplayName(profile as UserProfile)}'s screen`}
                </span>
            </div>
        );
    }

    render() {
        return (
            <div
                id='calls-recording-view'
                style={style.root as CSSProperties}
            >
                <div style={style.main as CSSProperties}>
                    <div style={{display: 'flex', alignItems: 'center', width: '100%'}}>
                        <div style={style.topLeftContainer as CSSProperties}>
                            <span style={{margin: '4px', fontWeight: 600}}>{this.getCallDuration()}</span>
                            <span style={{margin: '4px'}}>{'•'}</span>
                            <span style={{margin: '4px'}}>{`${this.props.profiles.length} participants`}</span>
                        </div>
                    </div>

                    { !this.props.screenSharingID &&
                    <ul
                        id='calls-expanded-view-participants-grid'
                        style={{
                            ...style.participants,
                            gridTemplateColumns: `repeat(${Math.min(this.props.profiles.length, 10)}, 1fr)`,
                        }}
                    >
                        { this.renderParticipants() }
                    </ul>
                    }
                    { this.props.screenSharingID && this.renderScreenSharingPlayer() }
                </div>
            </div>
        );
    }
}
