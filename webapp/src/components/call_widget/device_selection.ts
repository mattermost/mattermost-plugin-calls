// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {IntlShape} from 'react-intl';

// Devices without an ID can't be selected exactly.
export function getSelectableDevices(devices: MediaDeviceInfo[]): MediaDeviceInfo[] {
    return devices.filter((device) => device.deviceId);
}

// Matches by ID, then by label, since the browser can change device IDs between sessions.
export function findDevice(devices: MediaDeviceInfo[], current?: MediaDeviceInfo | null): MediaDeviceInfo | undefined {
    const byId = current && devices.find((device) => device.deviceId === current.deviceId);
    const byLabel = current?.label ? devices.find((device) => device.label === current.label) : undefined;
    return byId || byLabel;
}

// Without a chosen device the browser captures from its system default: the "default"
// entry where it lists one (Chrome), otherwise the first device.
export function getSelectedAudioInputId(devices: MediaDeviceInfo[], current?: MediaDeviceInfo | null): string | undefined {
    const systemDefault = devices.find((device) => device.deviceId === 'default');
    return (findDevice(devices, current) || systemDefault || devices[0])?.deviceId;
}

// Marks the system default device, not the default the client saves in local storage.
export function getDeviceLabel(device: MediaDeviceInfo, formatMessage: IntlShape['formatMessage']): string {
    if (device.deviceId.startsWith('default') && !device.label.startsWith('Default')) {
        return formatMessage({defaultMessage: 'Default - {deviceLabel}'}, {deviceLabel: device.label});
    }
    return device.label;
}
