// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {useEffect, useState} from 'react';
import {CALL_EVENT, CameraState, type CameraTrack} from 'src/clients/call';
import {getCallsClient} from 'src/utils';

const CAMERA_OFF: CameraTrack = {state: CameraState.Off, track: null};

const readCameraTrack = (sessionID: string): CameraTrack => getCallsClient()?.getCameraTrack(sessionID) ?? CAMERA_OFF;

const keepIfSame = (next: CameraTrack) => (prev: CameraTrack) =>
    (prev.state === next.state && prev.track === next.track ? prev : next);

/** Follows one session's camera from the call client. Redux only knows whether a camera is on,
 * not when its track goes from loading to ready, so this listens to CAMERA_CHANGED directly and
 * ignores other sessions' events.
 */
export function useCameraTrack(sessionID: string): CameraTrack {
    const [cameraTrack, setCameraTrack] = useState<CameraTrack>(() => readCameraTrack(sessionID));

    useEffect(() => {
        // Covers a new sessionID and any change between the first render and subscribing.
        setCameraTrack(keepIfSame(readCameraTrack(sessionID)));

        const client = getCallsClient();
        if (!client) {
            return undefined;
        }

        const onCameraChanged = (changedSessionID: string) => {
            if (changedSessionID === sessionID) {
                setCameraTrack(keepIfSame(client.getCameraTrack(sessionID)));
            }
        };
        client.on(CALL_EVENT.CAMERA_CHANGED, onCameraChanged);
        return () => {
            client.off(CALL_EVENT.CAMERA_CHANGED, onCameraChanged);
        };
    }, [sessionID]);

    return cameraTrack;
}
