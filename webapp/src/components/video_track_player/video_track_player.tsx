// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {VideoTrack} from 'livekit-client';
import React, {useEffect, useRef, VideoHTMLAttributes} from 'react';

type Props = {
    track: VideoTrack | null;
    onPlaying?: () => void;
} & VideoHTMLAttributes<HTMLVideoElement>;

// Plays a LiveKit video track through attach(). onPlaying fires once frames
// are actually showing, which can be well after the track exists.
export default function VideoTrackPlayer({track, onPlaying, ...attrs}: Props) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const onPlayingRef = useRef(onPlaying);
    onPlayingRef.current = onPlaying;

    useEffect(() => {
        const video = videoRef.current;
        if (!track || !video) {
            return;
        }

        const handlePlaying = () => onPlayingRef.current?.();
        video.addEventListener('playing', handlePlaying);
        video.addEventListener('loadeddata', handlePlaying);
        track.attach(video);

        return () => {
            video.removeEventListener('playing', handlePlaying);
            video.removeEventListener('loadeddata', handlePlaying);
            track.detach(video);
        };
    }, [track]);

    return (
        <video
            {...attrs}
            ref={videoRef}
        />
    );
}
