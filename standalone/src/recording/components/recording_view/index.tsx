// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {CSSProperties, useEffect, useRef, useState} from 'react';
import {useSelector} from 'react-redux';

import {GlobalState} from '@mattermost/types/lib/store';
import {UserProfile} from '@mattermost/types/users';

import {logErr} from 'plugin/log';
import {alphaSortProfiles, getUserDisplayName, stateSortProfiles} from 'plugin/utils';
import {UserState} from 'plugin/types/types';
import Avatar from 'plugin/components/avatar/avatar';
import CallParticipant from 'plugin/components/expanded_view/call_participant';
import {voiceChannelCallHostID, voiceChannelScreenSharingID, voiceConnectedProfiles, voiceUsersStatuses} from 'src/selectors';
import ScreenIcon from 'src/components/icons/screen_icon';

import {ReactionStream} from 'plugin/components/reaction_stream/reaction_stream';

import {callProfileImages} from 'src/recording/selectors';

import Timestamp from './timestamp';

const MaxParticipantsPerRow = 10;

const RecordingView = () => {
    const screenPlayerRef = useRef<HTMLVideoElement>(null);
    const [screenStream, setScreenStream] = useState<MediaStream|null>(null);
    const callsClient = window.callsClient;
    const channelID = callsClient?.channelID || '';
    const screenSharingID = useSelector((state: GlobalState) => voiceChannelScreenSharingID(state, channelID)) || '';
    const statuses = useSelector(voiceUsersStatuses);
    const profiles = sortedProfiles(useSelector(voiceConnectedProfiles), statuses, screenSharingID);
    const profileImages = useSelector((state: GlobalState) => callProfileImages(state, channelID));
    const pictures: {[key: string]: string} = {};
    if (profileImages) {
        for (let i = 0; i < profiles.length; i++) {
            pictures[String(profiles[i].id)] = profileImages[profiles[i].id];
        }
    }
    const callHostID = useSelector((state: GlobalState) => voiceChannelCallHostID(state, channelID)) || '';

    const attachVoiceTracks = (tracks: MediaStreamTrack[]) => {
        for (const track of tracks) {
            const audioEl = document.createElement('audio');
            audioEl.srcObject = new MediaStream([track]);
            audioEl.controls = false;
            audioEl.autoplay = true;
            audioEl.style.display = 'none';
            audioEl.onerror = (err) => logErr(err);
            document.body.appendChild(audioEl);
            track.onended = () => {
                audioEl.remove();
            };
        }
    };

    useEffect(() => {
        if (!callsClient) {
            logErr('callsClient should be defined');
            return;
        }

        setScreenStream(callsClient.getRemoteScreenStream());
        callsClient.on('remoteScreenStream', (stream: MediaStream) => {
            setScreenStream(stream);
        });

        attachVoiceTracks(callsClient.getRemoteVoiceTracks());
        callsClient.on('remoteVoiceStream', (stream: MediaStream) => {
            attachVoiceTracks(stream.getAudioTracks());
        });
    }, [callsClient]);

    useEffect(() => {
        if (screenStream && screenPlayerRef.current && screenPlayerRef.current?.srcObject !== screenStream) {
            screenPlayerRef.current.srcObject = screenStream;
        }
    }, [screenStream]);

    if (!callsClient) {
        return null;
    }

    const renderScreenSharingPlayer = () => {
        let profile: UserProfile | null = null;
        for (let i = 0; i < profiles.length; i++) {
            if (profiles[i].id === screenSharingID) {
                profile = profiles[i];
                break;
            }
        }
        if (!profile) {
            return null;
        }

        const msg = `You are viewing ${getUserDisplayName(profile)}'s screen`;

        return (
            <div style={style.screenContainer as CSSProperties}>
                <video
                    ref={screenPlayerRef}
                    id='screen-player'
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
                <ReactionStream forceLeft={true}/>
            </div>
        );
    };

    const renderParticipants = () => {
        return profiles.map((profile) => {
            const status = statuses[profile.id];
            let isMuted = true;
            let isSpeaking = false;
            let isHandRaised = false;
            if (status) {
                isMuted = !status.unmuted;
                isSpeaking = Boolean(status.voice);
                isHandRaised = Boolean(status.raised_hand > 0);
            }

            return (
                <CallParticipant
                    key={profile.id}
                    name={getUserDisplayName(profile)}
                    pictureURL={pictures[profile.id]}
                    isMuted={isMuted}
                    isSpeaking={isSpeaking}
                    isHandRaised={isHandRaised}
                    reaction={status?.reaction}
                    isHost={profile.id === callHostID}
                />
            );
        });
    };

    const renderSpeaking = () => {
        let speakingProfile;
        for (let i = 0; i < profiles.length; i++) {
            const profile = profiles[i];
            const status = statuses[profile.id];
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
                    borderGlowWidth={3}
                    url={pictures[speakingProfile.id]}
                />
                <span style={{marginLeft: '8px'}}>{getUserDisplayName(speakingProfile)}</span>
                <span style={{fontWeight: 400}}>{' is talking...'}</span>
            </div>
        );
    };

    const hasScreenShare = Boolean(screenSharingID);

    return (
        <div
            id='calls-recording-view'
            style={style.root as CSSProperties}
        >
            { !hasScreenShare &&
                <div style={style.main as CSSProperties}>
                    <ReactionStream/>
                    <ul
                        id='calls-recording-view-participants-grid'
                        style={{
                            ...style.participants,
                            gridTemplateColumns: `repeat(${Math.min(profiles.length, MaxParticipantsPerRow)}, 1fr)`,
                        }}
                    >
                        { renderParticipants() }
                    </ul>
                </div>
            }
            { hasScreenShare && renderScreenSharingPlayer() }

            <div
                style={style.footer}
            >
                <Timestamp/>
                <span style={{marginLeft: '4px'}}>{`• ${profiles.length} participants`}</span>
                { hasScreenShare && renderSpeaking() }
            </div>
        </div>
    );
};

export default RecordingView;

const sortedProfiles = (profiles: UserProfile[], statuses: {[key: string]: UserState}, screenSharingID: string) => {
    return [...profiles].sort(alphaSortProfiles).sort(stateSortProfiles(profiles, statuses, screenSharingID));
};

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
        flex: '1',
        overflow: 'auto',
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
