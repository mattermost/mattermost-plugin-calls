import React, {CSSProperties} from 'react';
import moment from 'moment-timezone';
import {compareSemVer} from 'semver-parser';
import {OverlayTrigger, Tooltip} from 'react-bootstrap';

import {UserProfile} from 'mattermost-redux/types/users';
import {Channel} from 'mattermost-redux/types/channels';

import {getUserDisplayName, getScreenStream, isDMChannel, hasExperimentalFlag} from 'src/utils';
import {UserState} from 'src/types/types';

import Avatar from '../avatar/avatar';

import CompassIcon from '../../components/icons/compassIcon';
import LeaveCallIcon from '../../components/icons/leave_call_icon';
import MutedIcon from '../../components/icons/muted_icon';
import UnmutedIcon from '../../components/icons/unmuted_icon';
import ScreenIcon from '../../components/icons/screen_icon';
import RaisedHandIcon from '../../components/icons/raised_hand';
import UnraisedHandIcon from '../../components/icons/unraised_hand';
import ParticipantsIcon from '../../components/icons/participants';

import './component.scss';

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
    hideExpandedView: () => void,
    showScreenSourceModal: () => void,
    screenSharingID: string,
    channel: Channel,
    connectedDMUser: UserProfile | undefined,
}

interface State {
    intervalID?: NodeJS.Timer,
    screenStream: MediaStream | null,
    showParticipantsList: boolean,
}

export default class ExpandedView extends React.PureComponent<Props, State> {
    private screenPlayer = React.createRef<HTMLVideoElement>()

    constructor(props: Props) {
        super(props);
        this.screenPlayer = React.createRef();
        this.state = {
            screenStream: null,
            showParticipantsList: false,
        };

        if (window.opener) {
            const callsClient = window.opener.callsClient;
            callsClient.on('close', () => window.close());
        }
    }

    getCallDuration = () => {
        const dur = moment.utc(moment().diff(moment(this.props.callStartAt)));
        if (dur.hours() === 0) {
            return dur.format('mm:ss');
        }
        return dur.format('HH:mm:ss');
    }

    onDisconnectClick = () => {
        this.props.hideExpandedView();
        const callsClient = window.opener ? window.opener.callsClient : window.callsClient;
        if (callsClient) {
            callsClient.disconnect();
            if (window.opener) {
                window.close();
            }
        }
    }

    onMuteToggle = () => {
        const callsClient = window.opener ? window.opener.callsClient : window.callsClient;
        if (callsClient.isMuted()) {
            callsClient.unmute();
        } else {
            callsClient.mute();
        }
    }

    onShareScreenToggle = async () => {
        const callsClient = window.opener ? window.opener.callsClient : window.callsClient;
        if (this.props.screenSharingID === this.props.currentUserID) {
            callsClient.unshareScreen();
            this.setState({
                screenStream: null,
            });
        } else if (!this.props.screenSharingID) {
            if (window.desktop && compareSemVer(window.desktop.version, '5.1.0') >= 0) {
                this.props.showScreenSourceModal();
            } else {
                const stream = await getScreenStream('', hasExperimentalFlag());
                if (window.opener && stream) {
                    window.screenSharingTrackId = stream.getVideoTracks()[0].id;
                }
                callsClient.setScreenStream(stream);
                this.setState({
                    screenStream: stream,
                });
            }
        }
    }

    onRaiseHandToggle = () => {
        const callsClient = window.opener ? window.opener.callsClient : window.callsClient;
        if (callsClient.isHandRaised) {
            callsClient.unraiseHand();
        } else {
            callsClient.raiseHand();
        }
    }

    onParticipantsListToggle = () => {
        this.setState({
            showParticipantsList: !this.state.showParticipantsList,
        });
    }

    public componentDidUpdate(prevProps: Props, prevState: State) {
        if (window.opener) {
            if (document.title.indexOf('Call') === -1 && this.props.channel) {
                if (isDMChannel(this.props.channel) && this.props.connectedDMUser) {
                    document.title = `Call - ${getUserDisplayName(this.props.connectedDMUser)}`;
                } else if (!isDMChannel(this.props.channel)) {
                    document.title = `Call - ${this.props.channel.display_name}`;
                }
            }
        }

        if (this.state.screenStream && this.screenPlayer.current && this.screenPlayer?.current.srcObject !== this.state.screenStream) {
            this.screenPlayer.current.srcObject = this.state.screenStream;
        }

        const callsClient = window.opener ? window.opener.callsClient : window.callsClient;
        if (!this.state.screenStream && callsClient?.getLocalScreenStream()) {
            // eslint-disable-next-line react/no-did-update-set-state
            this.setState({screenStream: callsClient.getLocalScreenStream()});
        }
    }

    public componentDidMount() {
        const callsClient = window.opener ? window.opener.callsClient : window.callsClient;
        callsClient.on('remoteScreenStream', (stream: MediaStream) => {
            this.setState({
                screenStream: stream,
            });
        });

        const screenStream = callsClient.getLocalScreenStream() || callsClient.getRemoteScreenStream();

        // This is needed to force a re-render to periodically update
        // the start time.
        const id = setInterval(() => this.forceUpdate(), 1000);
        // eslint-disable-next-line react/no-did-mount-set-state
        this.setState({
            intervalID: id,
            screenStream,
        });
    }

    public componentWillUnmount() {
        if (this.state.intervalID) {
            clearInterval(this.state.intervalID);
        }
    }

    renderScreenSharingPlayer = () => {
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

        const msg = isSharing ? 'You are sharing your screen' : `You are viewing ${getUserDisplayName(profile as UserProfile)}'s screen`;

        return (
            <div style={style.screenContainer as CSSProperties}>
                <video
                    id='screen-player'
                    ref={this.screenPlayer}
                    width='100%'
                    height='100%'
                    muted={true}
                    autoPlay={true}
                    controls={true}
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
                    {msg}
                </span>
            </div>
        );
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

    renderParticipantsRHSList = () => {
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
                    key={'participants_rhs_profile_' + idx}
                    style={{display: 'flex', alignItems: 'center', padding: '4px 8px'}}
                >
                    <Avatar
                        size={24}
                        fontSize={10}
                        border={false}
                        url={this.props.pictures[profile.id]}
                        style={{
                            boxShadow: isSpeaking ? '0px 0px 4px 4px rgba(61, 184, 135, 0.8)' : '',
                            marginRight: '8px',
                        }}
                    />
                    <span style={{fontWeight: 600, fontSize: '12px', margin: '8px 0'}}>
                        {getUserDisplayName(profile)}{profile.id === this.props.currentUserID && ' (you)'}
                    </span>

                    <div
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
                            fill={'rgba(210, 75, 78, 1)'}
                            style={{width: '14px', height: '14px'}}
                        />
                        }

                        <MuteIcon
                            fill={isMuted ? '#C4C4C4' : '#3DB887'}
                            style={{width: '14px', height: '14px'}}
                            stroke={isMuted ? '#C4C4C4' : ''}
                        />

                    </div>
                </li>
            );
        });
    }

    render() {
        if ((!this.props.show || !window.callsClient) && !window.opener) {
            return null;
        }

        const callsClient = window.opener ? window.opener.callsClient : window.callsClient;
        if (!callsClient) {
            return null;
        }

        const isMuted = callsClient.isMuted();
        const MuteIcon = isMuted ? MutedIcon : UnmutedIcon;
        const muteButtonText = isMuted ? 'Unmute' : 'Mute';

        const isHandRaised = callsClient.isHandRaised;
        const HandIcon = isHandRaised ? UnraisedHandIcon : RaisedHandIcon;
        const raiseHandText = isHandRaised ? 'Lower hand' : 'Raise hand';
        const participantsText = 'Show participants list';

        const sharingID = this.props.screenSharingID;
        const currentID = this.props.currentUserID;
        const isSharing = sharingID === currentID;

        return (
            <div
                id='calls-expanded-view'
                style={style.root as CSSProperties}
            >
                <div style={style.main as CSSProperties}>
                    <div style={{display: 'flex', alignItems: 'center', width: '100%'}}>
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
                                <CompassIcon icon='arrow-collapse'/>
                            </button>
                        }
                    </div>

                    { !this.props.screenSharingID &&
                    <ul
                        id='calls-expanded-view-participants-grid'
                        style={{
                            ...style.participants,
                            gridTemplateColumns: `repeat(${Math.min(this.props.profiles.length, 4)}, 1fr)`,
                        }}
                    >
                        { this.renderParticipants() }
                    </ul>
                    }
                    { this.props.screenSharingID && this.renderScreenSharingPlayer() }
                    <div
                        id='calls-expanded-view-controls'
                        style={style.controls}
                    >
                        <div style={style.leftControls}>
                            <OverlayTrigger
                                key='show_participants_list'
                                placement='top'
                                overlay={
                                    <Tooltip
                                        id='show-participants-list'
                                    >
                                        {this.state.showParticipantsList ? 'Hide participants list' : 'Show participants list'}
                                    </Tooltip>
                                }
                            >

                                <button
                                    className='button-center-controls'
                                    onClick={this.onParticipantsListToggle}
                                    style={{background: this.state.showParticipantsList ? 'rgba(28, 88, 217, 0.32)' : ''}}
                                >
                                    <ParticipantsIcon
                                        style={{width: '24px', height: '24px'}}
                                        fill={this.state.showParticipantsList ? 'rgb(28, 88, 217)' : 'white'}
                                    />
                                </button>
                            </OverlayTrigger>
                        </div>

                        <div style={style.centerControls}>

                            <div style={style.buttonContainer as CSSProperties}>
                                <button
                                    className='button-center-controls'
                                    onClick={this.onRaiseHandToggle}
                                    style={{background: isHandRaised ? 'rgba(255, 188, 66, 0.16)' : ''}}
                                >
                                    <HandIcon
                                        style={{width: '28px', height: '28px'}}
                                        fill={isHandRaised ? 'rgba(255, 188, 66, 1)' : 'white'}
                                    />

                                </button>
                                <span
                                    style={{fontSize: '14px', fontWeight: 600, marginTop: '12px'}}
                                >{raiseHandText}</span>
                            </div>

                            { (isSharing || !sharingID) &&
                            <div style={style.buttonContainer as CSSProperties}>
                                <button
                                    className='button-center-controls'
                                    onClick={this.onShareScreenToggle}
                                    style={{background: isSharing ? 'rgba(210, 75, 78, 0.12)' : ''}}
                                >
                                    <ScreenIcon
                                        style={{width: '28px', height: '28px'}}
                                        fill={isSharing ? 'rgba(210, 75, 78, 1)' : 'white'}
                                    />

                                </button>
                                <span
                                    style={{fontSize: '14px', fontWeight: 600, marginTop: '12px'}}
                                >{isSharing ? 'Stop presenting' : 'Start presenting'}</span>
                            </div>
                            }

                            <div
                                id='calls-popout-mute-button'
                                style={style.buttonContainer as CSSProperties}
                            >
                                <button
                                    className='button-center-controls'
                                    onClick={this.onMuteToggle}
                                    style={{background: isMuted ? '' : 'rgba(61, 184, 135, 0.16)'}}
                                >
                                    <MuteIcon
                                        style={{width: '28px', height: '28px'}}
                                        fill={isMuted ? 'white' : 'rgba(61, 184, 135, 1)'}
                                        stroke={isMuted ? 'rgba(210, 75, 78, 1)' : ''}
                                    />

                                </button>
                                <span
                                    style={{fontSize: '14px', fontWeight: 600, marginTop: '12px'}}
                                >{muteButtonText}</span>
                            </div>

                        </div>

                        <div style={{flex: '1', display: 'flex', justifyContent: 'flex-end', marginRight: '16px'}}>
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
                { this.state.showParticipantsList &&
                <ul style={style.rhs as CSSProperties}>
                    <span style={{position: 'sticky', top: '0', background: 'inherit', fontWeight: 600, padding: '8px'}}>{'Participants list'}</span>
                    { this.renderParticipantsRHSList() }
                </ul>
                }
            </div>
        );
    }
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
    closeViewButton: {
        fontSize: '24px',
        marginLeft: 'auto',
    },
    participants: {
        display: 'grid',
        overflow: 'auto',
        margin: 'auto',
        padding: '0',
    },
    controls: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '8px',
        width: '100%',
    },
    leftControls: {
        flex: '1',
        marginLeft: '16px',
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
        margin: '0 8px',
        width: '112px',
    },
    topLeftContainer: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '16px',
        marginRight: 'auto',
        padding: '4px',
    },
    screenContainer: {
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        margin: 'auto',
        maxWidth: 'calc(100% - 16px)',
        maxHeight: 'calc(100% - 200px)',
    },
    rhs: {
        display: 'flex',
        flexDirection: 'column',
        width: '300px',
        background: 'rgba(9, 10, 11, 1)',
        margin: 0,
        padding: 0,
        overflow: 'auto',
    },
};
