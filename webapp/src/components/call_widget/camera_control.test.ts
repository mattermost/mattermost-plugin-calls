// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {getCameraStatus} from './camera_control';

describe('getCameraStatus', () => {
    test.each([
        ['starting stays starting', 'starting', false, 0, 'denied', 'starting'],
        ['ready stays ready', 'ready', false, 1, null, 'ready'],
        ['a denied permission shows blocked before any click', 'ready', false, 1, 'denied', 'blocked'],
        ['a denied permission does not override a camera that is on', 'ready', true, 1, 'denied', 'ready'],
        ['blocked stays blocked while the permission is unknown', 'blocked', false, 1, null, 'blocked'],
        ['blocked stays blocked after a dismissed prompt', 'blocked', false, 1, 'prompt', 'blocked'],
        ['blocked clears once the permission is granted', 'blocked', false, 1, 'granted', 'ready'],
        ['missing stays missing with no camera', 'missing', false, 0, null, 'missing'],
        ['missing clears once a camera is plugged in', 'missing', false, 1, null, 'ready'],
    ] as const)('%s', (_, status, cameraOn, deviceCount, permission, expected) => {
        expect(getCameraStatus(status, cameraOn, deviceCount, permission)).toBe(expected);
    });
});
