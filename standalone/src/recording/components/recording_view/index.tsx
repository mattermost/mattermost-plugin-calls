// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {GlobalState} from '@mattermost/types/store';
import {UserProfile} from '@mattermost/types/users';
import Avatar from 'plugin/components/avatar/avatar';
import CallParticipant from 'plugin/components/expanded_view/call_participant';
import {logErr} from 'plugin/log';
import {alphaSortSessions, getUserDisplayName, stateSortSessions, untranslatable} from 'plugin/utils';
import React, {useCallback, useEffect, useState} from 'react';
import {useIntl} from 'react-intl';
import {useSelector} from 'react-redux';
import ScreenIcon from 'src/components/icons/screen_icon';
import {ReactionStream} from 'src/components/reaction_stream/reaction_stream';
import Timestamp from 'src/components/timestamp';
import {callProfileImages} from 'src/recording/selectors';
import {
    hostIDForCurrentCall,
    profilesInCurrentCallMap,
    screenSharingSessionForCurrentCall,
    sessionsInCurrentCall,
} from 'src/selectors';

const MaxParticipantsPerRow = 10;

const RecordingView = () => {
    const {formatMessage} = useIntl();
    const [screenPlayerNode, setScreenPlayerNode] = useState<HTMLVideoElement | null>(null);
    const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
    const callsClient = window.callsClient;
    const screenSharingSession = useSelector(screenSharingSessionForCurrentCall);

    const profiles = useSelector(profilesInCurrentCallMap);
    const sessions = useSelector((state: GlobalState) => sessionsInCurrentCall(state)
        .sort(alphaSortSessions(profiles))
        .sort(stateSortSessions(screenSharingSession?.session_id || '', true)));
    const profileImages = useSelector((state: GlobalState) => callProfileImages(state, callsClient?.channelID || ''));

    const hostID = useSelector((state: GlobalState) => hostIDForCurrentCall(state));

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
        if (screenStream && screenPlayerNode && screenPlayerNode.srcObject !== screenStream) {
            screenPlayerNode.srcObject = screenStream;
        }
    }, [screenStream, screenPlayerNode]);

    const screenRefCb = useCallback((node) => {
        setScreenPlayerNode(node);
    }, []);

    if (!callsClient) {
        return null;
    }

    const renderScreenSharingPlayer = () => {
        let profile: UserProfile | null = null;
        for (let i = 0; i < sessions.length; i++) {
            if (sessions[i].session_id === screenSharingSession?.session_id) {
                profile = profiles[sessions[i].user_id];
                break;
            }
        }
        if (!profile) {
            return null;
        }

        const msg = `You're viewing ${getUserDisplayName(profile)}'s screen`;

        return (
            <div style={style.screenContainer}>
                <video
                    style={style.screenPlayer}
                    ref={screenRefCb}
                    id='screen-player'
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
    };

    const renderParticipants = () => {
        return sessions.map((session) => {
            const isMuted = !session.unmuted;
            const isSpeaking = Boolean(session.voice);
            const isHandRaised = Boolean(session.raised_hand > 0);

            const profile = profiles[session.user_id];
            if (!profile) {
                return null;
            }

            return (
                <CallParticipant
                    key={session.session_id}
                    name={getUserDisplayName(profile)}
                    pictureURL={profileImages[profile.id]}
                    isMuted={isMuted}
                    isSpeaking={isSpeaking}
                    isHandRaised={isHandRaised}
                    reaction={session?.reaction}
                    isHost={profile.id === hostID}
                    iAmHost={false}
                    isYou={false}
                    userID={session.user_id}
                    sessionID={session.session_id}
                    onRemove={() => null}
                />
            );
        });
    };

    const renderSpeaking = () => {
        let speakingProfile;
        for (let i = 0; i < sessions.length; i++) {
            const session = sessions[i];
            const profile = profiles[sessions[i].user_id];
            if (session?.voice && profile) {
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
                    url={profileImages[speakingProfile.id]}
                />
                <span style={{marginLeft: '8px'}}>{getUserDisplayName(speakingProfile)}</span>
                <span style={{fontWeight: 400}}>{untranslatable(' ')}{formatMessage({defaultMessage: 'is talking…'})}</span>
            </div>
        );
    };

    const hasScreenShare = Boolean(screenSharingSession);

    return (
        <div
            id='calls-recording-view'
            style={style.root}
        >
            {!hasScreenShare &&
                <div style={style.main}>
                    <ul
                        id='calls-recording-view-participants-grid'
                        style={{
                            ...style.participants,
                            gridTemplateColumns: `repeat(${Math.min(sessions.length, MaxParticipantsPerRow)}, 1fr)`,
                        }}
                    >
                        {renderParticipants()}
                    </ul>
                </div>
            }
            {hasScreenShare && renderScreenSharingPlayer()}

            <div
                style={style.footer}
            >
                <div><Timestamp/></div>
                <span style={{marginLeft: '4px'}}>
                    {untranslatable('• ')}{formatMessage({defaultMessage: '{count, plural, =1 {# participant} other {# participants}}'}, {count: sessions.length})}
                </span>
                {hasScreenShare && renderSpeaking()}
            </div>

            <div style={style.reactionsContainer}>
                <ReactionStream/>
            </div>
        </div>
    );
};

export default RecordingView;

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
        height: 'calc(100vh - 32px)',
    },
    screenPlayer: {
        width: '100%',
        minHeight: '100%',
    },
    reactionsContainer: {
        position: 'absolute',
        bottom: '48px',
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
} as Record<string, React.CSSProperties>;
