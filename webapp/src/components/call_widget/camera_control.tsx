// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import {useIntl} from 'react-intl';
import {usePermissionState} from 'src/components/use_permission_state';
import {CallAlertConfigs} from 'src/constants';

import DeviceControl, {DeviceStatus} from './device_control';
import {useVideoInputDevices} from './use_video_input_devices';

type Props = {
    cameraOn: boolean;
    status: DeviceStatus;
    onToggle: () => void;
    disabled?: boolean;
    menuOpen: boolean;
    onMenuOpenChange: (open: boolean) => void;
    menuRef?: (el: HTMLUListElement | null) => void;
};

// The widget only learns about camera problems when turning it on fails, so the live device
// list and the browser permission refine that: a plugged-in camera clears "missing", a granted
// permission clears "blocked", and a denied one shows "blocked" before anyone clicks.
export function getCameraStatus(status: DeviceStatus, cameraOn: boolean, deviceCount: number, permission: PermissionState | null): DeviceStatus {
    switch (status) {
    case 'starting':
        return status;
    case 'missing':
        return deviceCount > 0 ? 'ready' : status;
    case 'blocked':
        return permission === 'granted' ? 'ready' : status;
    case 'ready':
        return !cameraOn && permission === 'denied' ? 'blocked' : status;
    default: {
        const unhandled: never = status;
        return unhandled;
    }
    }
}

export default function CameraControl({cameraOn, status, onToggle, disabled, menuOpen, onMenuOpenChange, menuRef}: Props) {
    const {formatMessage} = useIntl();
    const {devices, selectedDeviceId, selectDevice} = useVideoInputDevices(cameraOn);
    const permission = usePermissionState('camera');
    const cameraStatus = getCameraStatus(status, cameraOn, devices.length, permission);

    let toggleLabel: string | undefined;
    let tooltipSubtext: string | undefined;
    if (cameraStatus === 'blocked') {
        toggleLabel = formatMessage(CallAlertConfigs.cameraPermissionDenied.tooltipText!);
        tooltipSubtext = formatMessage(CallAlertConfigs.cameraPermissionDenied.tooltipSubtext!);
    } else if (cameraStatus === 'missing') {
        toggleLabel = formatMessage(CallAlertConfigs.cameraNotFound.tooltipText!);
        tooltipSubtext = formatMessage(CallAlertConfigs.cameraNotFound.tooltipSubtext!);
    }

    return (
        <DeviceControl
            id='calls-widget-camera'
            kind='videoinput'
            active={cameraOn}
            status={cameraStatus}
            onToggle={onToggle}
            devices={devices}
            selectedDeviceId={selectedDeviceId}
            onSelectDevice={selectDevice}
            disabled={disabled}
            toggleLabel={toggleLabel}
            tooltipSubtext={tooltipSubtext}
            menuOpen={menuOpen}
            onMenuOpenChange={onMenuOpenChange}
            menuRef={menuRef}
        />
    );
}
