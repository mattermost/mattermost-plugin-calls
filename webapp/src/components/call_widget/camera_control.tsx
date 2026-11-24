// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';

import DeviceControl from './device_control';
import {useCameraControl} from './use_camera_control';

type Props = {
    id?: string;
    cameraOn: boolean;
    disabled?: boolean;
    menuOpen: boolean;
    onMenuOpenChange: (open: boolean) => void;
    menuRef?: (el: HTMLUListElement | null) => void;
    className?: string;
};

export default function CameraControl({id = 'calls-widget-camera', cameraOn, disabled, menuOpen, onMenuOpenChange, menuRef, className}: Props) {
    const {status, toggle, devices, selectedDeviceId, selectDevice} = useCameraControl(cameraOn);

    return (
        <DeviceControl
            id={id}
            kind='videoinput'
            active={cameraOn}
            status={status}
            onToggle={toggle}
            devices={devices}
            selectedDeviceId={selectedDeviceId}
            onSelectDevice={selectDevice}
            disabled={disabled}
            menuOpen={menuOpen}
            onMenuOpenChange={onMenuOpenChange}
            menuRef={menuRef}
            className={className}
        />
    );
}
