// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {GlobalState} from '@mattermost/types/store';
import {getUser} from 'mattermost-redux/selectors/entities/users';
import React, {useState} from 'react';
import {useSelector} from 'react-redux';
import {useCameraTrack} from 'src/components/use_camera_track';
import {STORAGE_CALLS_MIRROR_VIDEO} from 'src/constants';
import {connectionStateForSession} from 'src/state/connection_quality/selectors';
import {sessionsInCurrentCallMap} from 'src/state/session/selectors';

import VideoTile, {type VideoTileSize} from './video_tile';

type Props = {
    sessionID: string;
    size: VideoTileSize;
    isSelf?: boolean;
    hideMuteState?: boolean;
    className?: string;
};

const readMirrorPreference = () => window.localStorage.getItem(STORAGE_CALLS_MIRROR_VIDEO) === 'on';

export default function ConnectedVideoTile({sessionID, size, isSelf = false, hideMuteState = false, className}: Props) {
    const session = useSelector((state: GlobalState) => sessionsInCurrentCallMap(state)?.[sessionID]);
    const profile = useSelector((state: GlobalState) => (session ? getUser(state, session.user_id) : undefined));
    const connectionState = useSelector((state: GlobalState) => connectionStateForSession(state, sessionID));
    const {state: cameraState, track} = useCameraTrack(sessionID);
    const [mirrorPreference] = useState(readMirrorPreference);

    if (!session) {
        return null;
    }

    return (
        <VideoTile
            session={session}
            profile={profile}
            track={track}
            cameraState={cameraState}
            connectionState={connectionState}
            size={size}
            isSelf={isSelf}
            isMirrored={isSelf && mirrorPreference}
            hideMuteState={hideMuteState}
            className={className}
        />
    );
}
