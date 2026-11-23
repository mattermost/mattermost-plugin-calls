// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {useEffect, useRef, useState} from 'react';
import CallClient from 'src/clients/call';
import {STORAGE_CALLS_DEFAULT_VIDEO_INPUT_KEY} from 'src/constants';
import {logErr} from 'src/log';
import {getCallsClient} from 'src/utils';

type StoredVideoInput = {
    deviceId: string;
    label?: string;
};

const readStoredVideoInput = (): StoredVideoInput | null => {
    const data = window.localStorage.getItem(STORAGE_CALLS_DEFAULT_VIDEO_INPUT_KEY);
    if (!data) {
        return null;
    }
    try {
        return JSON.parse(data);
    } catch {
        return null;
    }
};

// Same order the client uses when it turns the camera on: saved ID, then saved label, then the first camera.
export function getSelectedVideoInputId(devices: MediaDeviceInfo[], stored: StoredVideoInput | null): string | undefined {
    const selectable = devices.filter((device) => device.deviceId);
    const byId = stored && selectable.find((device) => device.deviceId === stored.deviceId);
    const byLabel = stored?.label ? selectable.find((device) => device.label === stored.label) : undefined;
    return (byId || byLabel || selectable[0])?.deviceId;
}

// Labels and IDs stay hidden until camera access is granted, so the list reloads when the camera turns on.
export function useVideoInputDevices(cameraOn: boolean) {
    const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
    const [stored, setStored] = useState(readStoredVideoInput);
    const latestLoadRef = useRef(0);

    const loadDevices = async () => {
        const loadID = ++latestLoadRef.current;
        let loaded: MediaDeviceInfo[];
        try {
            loaded = await CallClient.getLocalVideoDevices();
        } catch (err) {
            logErr('failed to get video devices', err);
            return;
        }

        if (loadID !== latestLoadRef.current) {
            return;
        }
        setDevices(loaded);
        setStored(readStoredVideoInput());
    };

    useEffect(() => {
        loadDevices();
    }, [cameraOn]);

    useEffect(() => {
        navigator.mediaDevices?.addEventListener('devicechange', loadDevices);
        return () => {
            navigator.mediaDevices?.removeEventListener('devicechange', loadDevices);
        };
    }, []);

    const selectDevice = async (device: MediaDeviceInfo) => {
        await getCallsClient()?.setVideoInputDevice(device);
        setStored(readStoredVideoInput());
    };

    return {
        devices,
        selectedDeviceId: getSelectedVideoInputId(devices, stored),
        selectDevice,
    };
}
