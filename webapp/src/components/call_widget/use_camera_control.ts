// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {useEffect, useRef, useState} from 'react';
import {CALL_EVENT, CameraError, type DeviceStatus} from 'src/clients/call';
import {usePermissionState} from 'src/components/use_permission_state';
import {logDebug} from 'src/log';
import {getCallsClient} from 'src/utils';

import {useVideoInputDevices} from './use_video_input_devices';

type CameraStatusInput = {
    starting: boolean;
    error: CameraError | null;
    cameraOn: boolean;
    deviceCount: number;
    permission: PermissionState | null;
};

// The button only shows the errors it can explain; the rest have their banner, and a retry may work.
// The live device list and permission refine those: a plugged-in camera clears "missing", a granted
// permission clears "blocked", and a denied one shows "blocked" before anyone clicks.
const readyUnlessDenied = ({cameraOn, permission}: CameraStatusInput): DeviceStatus =>
    (!cameraOn && permission === 'denied' ? 'blocked' : 'ready');

const STATUS_FOR_ERROR: Record<CameraError, (input: CameraStatusInput) => DeviceStatus> = {
    [CameraError.PermissionDenied]: ({permission}) => (permission === 'granted' ? 'ready' : 'blocked'),
    [CameraError.NotFound]: ({deviceCount}) => (deviceCount > 0 ? 'ready' : 'missing'),
    [CameraError.DeviceInUse]: readyUnlessDenied,
    [CameraError.Disconnected]: readyUnlessDenied,
    [CameraError.Other]: readyUnlessDenied,
};

export function getCameraStatus(input: CameraStatusInput): DeviceStatus {
    if (input.starting) {
        return 'starting';
    }
    return input.error === null ? readyUnlessDenied(input) : STATUS_FOR_ERROR[input.error](input);
}

export function useCameraControl(cameraOn: boolean) {
    const {devices, selectedDeviceId, selectDevice} = useVideoInputDevices(cameraOn);
    const permission = usePermissionState('camera');
    const [starting, setStarting] = useState(false);
    const [error, setError] = useState<CameraError | null>(null);

    // Bumped on every turn-on so a slow earlier attempt can't end a newer one's starting state.
    const startIDRef = useRef(0);

    useEffect(() => {
        const client = getCallsClient();
        if (!client) {
            return undefined;
        }

        const onCameraError = (err: CameraError) => {
            setError(err);
            setStarting(false);
        };
        client.on(CALL_EVENT.CAMERA_ERROR, onCameraError);
        return () => {
            client.off(CALL_EVENT.CAMERA_ERROR, onCameraError);
        };
    }, []);

    useEffect(() => {
        if (cameraOn) {
            setError(null);
            setStarting(false);
        }
    }, [cameraOn]);

    const toggle = async () => {
        const client = getCallsClient();
        if (!client) {
            return;
        }

        if (cameraOn) {
            logDebug('useCameraControl: turning camera off');
            client.disableCamera();
            return;
        }

        if (starting) {
            return;
        }

        logDebug('useCameraControl: turning camera on');
        const startID = ++startIDRef.current;
        setStarting(true);
        setError(null);
        try {
            await client.enableCamera();
        } finally {
            // enableCamera also returns without turning the camera on, e.g. when no longer connected.
            if (startID === startIDRef.current) {
                setStarting(false);
            }
        }
    };

    return {
        status: getCameraStatus({starting, error, cameraOn, deviceCount: devices.length, permission}),
        toggle,
        devices,
        selectedDeviceId,
        selectDevice,
    };
}
