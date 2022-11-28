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
import MutedIcon from 'plugin/components/icons/muted_icon';
import UnmutedIcon from 'plugin/components/icons/unmuted_icon';
import ScreenIcon from 'plugin/components/icons/screen_icon';
import CallParticipant from 'plugin/components/expanded_view/call_participant';

import Timestamp from './timestamp';

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
    callHostID: string,
    screenSharingID: string,
    channel: Channel,
}

interface State {
    screenStream: MediaStream | null,
}

const MaxParticipantsPerRow = 10;

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
                style={style.screenContainer as CSSProperties}
            >
                <video
                    id='screen-player'
                    ref={this.screenPlayer}
                    width='100%'
                    height='100%'
                    muted={true}
                    autoPlay={true}
                    onClick={(ev) => ev.preventDefault()}
                    controls={false}
                />

                <div
                    style={{
                        position: 'absolute',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        bottom: '24px',
                        padding: '4px 6px',
                        borderRadius: '12px',
                        background: 'rgba(9, 10, 11, 0.72)',
                        color: '#DDDFE4',
                        fontSize: '10px',
                        lineHeight: '12px',
                    }}
                >
                    <ScreenIcon
                        style={{width: '12px', height: '12px', margin: '0 6px', fill: 'rgba(221, 223, 228, 0.72)'}}
                    />
                    <span>{msg}</span>
                </div>
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
                <CallParticipant
                    key={'participants_profile_' + idx}
                    name={getUserDisplayName(profile)}
                    pictureURL={this.props.pictures[profile.id]}
                    isMuted={isMuted}
                    isSpeaking={isSpeaking}
                    isHandRaised={isHandRaised}
                    reaction={status?.reaction}
                    isHost={profile.id === this.props.callHostID}
                />
            );
        });
    }

    renderSpeaking() {
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
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    marginLeft: 'auto',
                    whiteSpace: 'pre',
                }}
            >
                <Avatar
                    size={20}
                    fontSize={14}
                    border={false}
                    borderGlow={true}
                    url={this.props.pictures[speakingProfile.id]}
                />
                <span style={{marginLeft: '8px'}}>{getUserDisplayName(speakingProfile)}</span>
                <span style={{fontWeight: 400}}>{' is talking...'}</span>
            </div>
        );
    }

    render() {
        const callsClient = this.getCallsClient();
        if (!callsClient) {
            return null;
        }

        const hasScreenShare = Boolean(this.props.screenSharingID);

        return (
            <div
                id='calls-recording-view'
                style={style.root as CSSProperties}
            >
                <div style={style.main as CSSProperties}>
                    { !hasScreenShare &&
                    <ul
                        id='calls-recording-view-participants-grid'
                        style={{
                            ...style.participants,
                            gridTemplateColumns: `repeat(${Math.min(this.props.profiles.length, MaxParticipantsPerRow)}, 1fr)`,
                        }}
                    >
                        { this.renderParticipants() }
                    </ul>
                    }
                    { hasScreenShare && this.renderScreenSharingPlayer() }
                </div>

                <div
                    style={style.footer}
                >
                    <Timestamp/>
                    { hasScreenShare &&
                    <span style={{marginLeft: '4px'}}>{`• ${this.props.profiles.length} participants`}</span>
                    }
                    { hasScreenShare && this.renderSpeaking() }
                </div>
            </div>
        );
    }
}

const style = {
    root: {
        position: 'absolute',
        display: 'flex',
        flexDirection: 'column',
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
        maxHeight: 'calc(100% - 32px)',
    },
    participants: {
        display: 'grid',
        overflow: 'auto',
        margin: 'auto',
        padding: '0',
    },
    screenContainer: {
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        width: '100%',
        height: '100%',
    },
    footer: {
        display: 'flex',
        background: '#000000',
        alignItems: 'center',
        fontWeight: 600,
        lineHeight: '20px',
        fontSize: '14px',
        padding: '6px',
    },
};
