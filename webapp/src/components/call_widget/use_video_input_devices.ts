// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {useEffect, useRef, useState} from 'react';
import CallClient from 'src/clients/call';
import {logErr} from 'src/log';
import {getCallsClient} from 'src/utils';

// Labels and IDs stay hidden until camera access is granted, so the list reloads when the camera turns on.
export function useVideoInputDevices(cameraOn: boolean) {
    const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
    const [selectedDeviceId, setSelectedDeviceId] = useState<string>();
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
        setSelectedDeviceId(CallClient.getSelectedVideoInputDeviceId(loaded));
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
        setSelectedDeviceId(CallClient.getSelectedVideoInputDeviceId(devices));
    };

    return {devices, selectedDeviceId, selectDevice};
}
