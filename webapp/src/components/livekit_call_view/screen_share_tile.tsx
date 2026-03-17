// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useEffect, useRef} from 'react';
import {Participant, Track} from 'livekit-client';

interface Props {
    participant: Participant;
    isLocal?: boolean;
}

const ScreenShareTile: React.FC<Props> = ({participant, isLocal}) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const audioRef = useRef<HTMLAudioElement>(null);

    useEffect(() => {
        const pub = participant.getTrackPublication(Track.Source.ScreenShare);
        const track = pub?.track;
        if (track && videoRef.current) {
            track.attach(videoRef.current);
        }
        return () => {
            if (track && videoRef.current) {
                track.detach(videoRef.current);
            }
        };
    }, [participant, participant.getTrackPublication(Track.Source.ScreenShare)?.track]);

    useEffect(() => {
        if (isLocal) {
            return;
        }
        const pub = participant.getTrackPublication(Track.Source.ScreenShareAudio);
        const track = pub?.track;
        if (track && audioRef.current) {
            track.attach(audioRef.current);
        }
        return () => {
            if (track && audioRef.current) {
                track.detach(audioRef.current);
            }
        };
    }, [participant, isLocal, participant.getTrackPublication(Track.Source.ScreenShareAudio)?.track]);

    const identity = participant.identity;

    return (
        <div style={styles.container}>
            <video
                ref={videoRef}
                style={styles.video}
                autoPlay={true}
                muted={true}
                playsInline={true}
            />
            {!isLocal && <audio ref={audioRef} autoPlay={true}/>}
            <div style={styles.label}>
                <span style={styles.labelText}>
                    {identity}{isLocal ? ' (You)' : ''}{' - Screen'}
                </span>
            </div>
        </div>
    );
};

const styles: Record<string, React.CSSProperties> = {
    container: {
        position: 'relative',
        backgroundColor: '#000',
        borderRadius: '8px',
        overflow: 'hidden',
        width: '100%',
        maxHeight: '70vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
    },
    video: {
        width: '100%',
        height: '100%',
        objectFit: 'contain',
    },
    label: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        padding: '4px 8px',
        background: 'linear-gradient(transparent, rgba(0,0,0,0.7))',
    },
    labelText: {
        color: 'white',
        fontSize: '12px',
        fontWeight: 500,
    },
};

export default ScreenShareTile;
