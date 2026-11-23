// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';

import DeviceControl from './device_control';
import {useVideoInputDevices} from './use_video_input_devices';

type Props = {
    cameraOn: boolean;
    onToggle: () => void;
    disabled?: boolean;
    menuOpen: boolean;
    onMenuOpenChange: (open: boolean) => void;
    menuRef?: (el: HTMLUListElement | null) => void;
};

export default function CameraControl({cameraOn, onToggle, disabled, menuOpen, onMenuOpenChange, menuRef}: Props) {
    const {devices, selectedDeviceId, selectDevice} = useVideoInputDevices(cameraOn);

    return (
        <DeviceControl
            id='calls-widget-camera'
            kind='videoinput'
            active={cameraOn}
            onToggle={onToggle}
            devices={devices}
            selectedDeviceId={selectedDeviceId}
            onSelectDevice={selectDevice}
            disabled={disabled}
            menuOpen={menuOpen}
            onMenuOpenChange={onMenuOpenChange}
            menuRef={menuRef}
        />
    );
}
