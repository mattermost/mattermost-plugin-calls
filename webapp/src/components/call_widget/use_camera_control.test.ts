// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {CameraError} from 'src/clients/call/types';

import {getCameraStatus} from './use_camera_control';

describe('getCameraStatus', () => {
    test.each([
        ['starting stays starting', true, CameraError.PermissionDenied, false, 0, 'denied', 'starting'],
        ['no error is ready', false, null, false, 1, null, 'ready'],
        ['a denied permission shows blocked before any click', false, null, false, 1, 'denied', 'blocked'],
        ['a denied permission does not override a camera that is on', false, null, true, 1, 'denied', 'ready'],
        ['a permission error is blocked while the permission is unknown', false, CameraError.PermissionDenied, false, 1, null, 'blocked'],
        ['a permission error stays blocked after a dismissed prompt', false, CameraError.PermissionDenied, false, 1, 'prompt', 'blocked'],
        ['a permission error clears once the permission is granted', false, CameraError.PermissionDenied, false, 1, 'granted', 'ready'],
        ['not found is missing with no camera', false, CameraError.NotFound, false, 0, null, 'missing'],
        ['not found clears once a camera is plugged in', false, CameraError.NotFound, false, 1, null, 'ready'],
        ['a camera in use is ready so a retry may work', false, CameraError.DeviceInUse, false, 1, null, 'ready'],
        ['a disconnected camera is ready', false, CameraError.Disconnected, false, 1, null, 'ready'],
        ['another error is ready', false, CameraError.Other, false, 1, null, 'ready'],
    ] as const)('%s', (_, starting, error, cameraOn, deviceCount, permission, expected) => {
        expect(getCameraStatus({starting, error, cameraOn, deviceCount, permission})).toBe(expected);
    });
});
