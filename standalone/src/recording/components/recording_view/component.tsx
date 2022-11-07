// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {CSSProperties} from 'react';
import {compareSemVer} from 'semver-parser';
import {OverlayTrigger, Tooltip} from 'react-bootstrap';

import {UserProfile} from '@mattermost/types/users';
import {Channel} from '@mattermost/types/channels';

import {logErr} from 'plugin/log';

import {
    getUserDisplayName,
    isDMChannel,
} from 'plugin/utils';

import {
    UserState,
} from 'plugin/types/types';

import Avatar from 'plugin/components/avatar/avatar';
import CallDuration from 'plugin/components/call_widget/call_duration';
import MutedIcon from 'plugin/components/icons/muted_icon';
import UnmutedIcon from 'plugin/components/icons/unmuted_icon';

interface Props {
    store: any,
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
}

interface State {
    screenStream: MediaStream | null,
}

export default class RecordingView extends React.PureComponent<Props, State> {
    private screenPlayer = React.createRef<HTMLVideoElement>()

    constructor(props: Props) {
        super(props);
        this.screenPlayer = React.createRef();
        this.state = {
            screenStream: null,
        };
    }

    getCallsClient = () => {
        return window.callsClient;
    }

    public componentDidMount() {
        const callsClient = this.getCallsClient();
        callsClient.on('remoteScreenStream', (stream: MediaStream) => {
            this.setState({
                screenStream: stream,
            });
        });
        callsClient.on('remoteVoiceStream', (stream: MediaStream) => {
            const voiceTrack = stream.getAudioTracks()[0];
            const audioEl = document.createElement('audio');
            audioEl.srcObject = stream;
            audioEl.controls = false;
            audioEl.autoplay = true;
            audioEl.style.display = 'none';
            audioEl.onerror = (err) => logErr(err);
            document.body.appendChild(audioEl);
            voiceTrack.onended = () => {
                audioEl.remove();
            };
        });

        const screenStream = callsClient.getRemoteScreenStream();
        // eslint-disable-next-line react/no-did-mount-set-state
        this.setState({
            screenStream,
        });
    }

    public componentDidUpdate(prevProps: Props, prevState: State) {
        if (this.state.screenStream && this.screenPlayer.current && this.screenPlayer?.current.srcObject !== this.state.screenStream) {
            this.screenPlayer.current.srcObject = this.state.screenStream;
        }
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

        const msg = `You are viewing ${getUserDisplayName(profile as UserProfile)}'s screen`;

        return (
            <div
                style={{
                    ...style.screenContainer,
                    maxHeight: 'calc(100% - 200px)',
                } as CSSProperties}
            >
                <video
                    id='screen-player'
                    ref={this.screenPlayer}
                    width='100%'
                    height='100%'
                    muted={true}
                    autoPlay={true}
                    onClick={(ev) => ev.preventDefault()}
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
                            borderGlow={isSpeaking}
                            url={this.props.pictures[profile.id]}
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
                        {getUserDisplayName(profile)}
                    </span>

                </li>
            );
        });
    }

    render() {
        const callsClient = this.getCallsClient();
        if (!callsClient) {
            return null;
        }

        const sharingID = this.props.screenSharingID;

        return (
            <div
                id='calls-recording-view'
                style={style.root as CSSProperties}
            >
                <div style={style.main as CSSProperties}>
                    <div style={{display: 'flex', alignItems: 'center', width: '100%'}}>
                        <div style={style.topLeftContainer as CSSProperties}>
                            <CallDuration
                                style={{margin: '4px'}}
                                startAt={this.props.callStartAt}
                            />
                            <span style={{margin: '4px'}}>{'•'}</span>
                            <span style={{margin: '4px'}}>{`${this.props.profiles.length} participants`}</span>

                        </div>
                    </div>

                    { !this.props.screenSharingID &&
                    <ul
                        id='calls-recording-view-participants-grid'
                        style={{
                            ...style.participants,
                            gridTemplateColumns: `repeat(${Math.min(this.props.profiles.length, 4)}, 1fr)`,
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

const style = {
    root: {
        position: 'absolute',
        display: 'flex',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        background: '#1E1E1E',
        color: 'white',
    },
    main: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        flex: '1',
    },
    participants: {
        display: 'grid',
        overflow: 'auto',
        margin: 'auto',
        padding: '0',
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
    },
};
