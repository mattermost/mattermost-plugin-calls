// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useEffect, useRef} from 'react';
import {Participant, Track, TrackPublication} from 'livekit-client';

interface Props {
    participant: Participant;
    isLocal?: boolean;
}

const ParticipantTile: React.FC<Props> = ({participant, isLocal}) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const audioRef = useRef<HTMLAudioElement>(null);

    useEffect(() => {
        const videoPublication = participant.getTrackPublication(Track.Source.Camera);
        const videoTrack = videoPublication?.track;
        if (videoTrack && videoRef.current) {
            videoTrack.attach(videoRef.current);
        }

        return () => {
            if (videoTrack && videoRef.current) {
                videoTrack.detach(videoRef.current);
            }
        };
    }, [participant, participant.getTrackPublication(Track.Source.Camera)?.track]);

    useEffect(() => {
        // Only attach remote audio (local audio would cause echo)
        if (isLocal) {
            return;
        }
        const audioPublication = participant.getTrackPublication(Track.Source.Microphone);
        const audioTrack = audioPublication?.track;
        if (audioTrack && audioRef.current) {
            audioTrack.attach(audioRef.current);
        }

        return () => {
            if (audioTrack && audioRef.current) {
                audioTrack.detach(audioRef.current);
            }
        };
    }, [participant, isLocal, participant.getTrackPublication(Track.Source.Microphone)?.track]);

    const hasVideo = participant.isCameraEnabled;
    const isMuted = !participant.isMicrophoneEnabled;
    const identity = participant.identity;

    return (
        <div style={styles.tile}>
            {hasVideo ? (
                <video
                    ref={videoRef}
                    style={styles.video}
                    autoPlay={true}
                    muted={isLocal}
                    playsInline={true}
                />
            ) : (
                <div style={styles.avatar}>
                    <div style={styles.avatarCircle}>
                        {identity.substring(0, 2).toUpperCase()}
                    </div>
                </div>
            )}
            {!isLocal && <audio ref={audioRef} autoPlay={true}/>}
            <div style={styles.nameBar}>
                <span style={styles.name}>
                    {identity}{isLocal ? ' (You)' : ''}
                </span>
                {isMuted && <span style={styles.mutedIcon}>{'🔇'}</span>}
            </div>
        </div>
    );
};

const styles: Record<string, React.CSSProperties> = {
    tile: {
        position: 'relative',
        backgroundColor: '#1e1e1e',
        borderRadius: '8px',
        overflow: 'hidden',
        minWidth: '200px',
        minHeight: '150px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        aspectRatio: '16/9',
    },
    video: {
        width: '100%',
        height: '100%',
        objectFit: 'cover',
    },
    avatar: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        height: '100%',
    },
    avatarCircle: {
        width: '64px',
        height: '64px',
        borderRadius: '50%',
        backgroundColor: '#4A90D9',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'white',
        fontSize: '24px',
        fontWeight: 600,
    },
    nameBar: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        padding: '4px 8px',
        background: 'linear-gradient(transparent, rgba(0,0,0,0.7))',
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
    },
    name: {
        color: 'white',
        fontSize: '12px',
        fontWeight: 500,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
    },
    mutedIcon: {
        fontSize: '12px',
    },
};

export default ParticipantTile;
