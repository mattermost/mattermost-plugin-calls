// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useEffect, useRef, VideoHTMLAttributes} from 'react';
import type {ScreenShareTrack} from 'src/clients/call/types';

type Props = {
    track: ScreenShareTrack | null;
} & VideoHTMLAttributes<HTMLVideoElement>;

// Plays a screen share through LiveKit's attach(), which only touches the
// element's srcObject when the track really changes.
export default function ScreenSharePlayer({track, ...attrs}: Props) {
    const videoRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        const video = videoRef.current;
        if (!track || !video) {
            return;
        }

        track.attach(video);
        return () => {
            track.detach(video);
        };
    }, [track]);

    return (
        <video
            {...attrs}
            id='screen-player'
            ref={videoRef}
        />
    );
}
