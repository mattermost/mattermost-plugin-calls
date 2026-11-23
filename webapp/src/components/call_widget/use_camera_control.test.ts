// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {act, renderHook, waitFor} from '@testing-library/react';
import CallClient from 'src/clients/call';
import {CALL_EVENT} from 'src/clients/call/constants';
import {CameraError} from 'src/clients/call/types';
import {FakeCallClient, installFakeCallClient} from 'src/test_utils/fake_call_client';

import {getCameraStatus, useCameraControl} from './use_camera_control';

jest.mock('src/log', () => ({
    logDebug: jest.fn(),
    logErr: jest.fn(),
    logWarn: jest.fn(),
}));

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

describe('useCameraControl', () => {
    const getLocalVideoDevices = jest.spyOn(CallClient, 'getLocalVideoDevices');
    let client: FakeCallClient;

    beforeEach(() => {
        getLocalVideoDevices.mockResolvedValue([]);
        client = installFakeCallClient();
    });

    afterEach(() => {
        window.callsClient = undefined;
    });

    afterAll(() => {
        getLocalVideoDevices.mockRestore();
    });

    const renderControl = async (cameraOn = false) => {
        const hook = renderHook(() => useCameraControl(cameraOn));
        await waitFor(() => expect(getLocalVideoDevices).toHaveBeenCalled());
        return hook;
    };

    test('turns the camera off through the client when it is on', async () => {
        const {result} = await renderControl(true);

        await act(() => result.current.toggle());

        expect(client.disableCamera).toHaveBeenCalled();
        expect(client.enableCamera).not.toHaveBeenCalled();
    });

    test('ignores another turn-on while the camera is starting', async () => {
        let finishStarting: () => void = () => {};
        client.enableCamera.mockReturnValue(new Promise<undefined>((resolve) => {
            finishStarting = () => resolve(undefined);
        }));
        const {result} = await renderControl();

        let firstToggle: Promise<void> = Promise.resolve();
        act(() => {
            firstToggle = result.current.toggle();
        });
        expect(result.current.status).toBe('starting');

        await act(() => result.current.toggle());
        expect(client.enableCamera).toHaveBeenCalledTimes(1);

        await act(async () => {
            finishStarting();
            await firstToggle;
        });
        expect(result.current.status).toBe('ready');
    });

    test('shows the error the camera reports', async () => {
        const {result} = await renderControl();

        act(() => {
            client.emit(CALL_EVENT.CAMERA_ERROR, CameraError.NotFound);
        });

        expect(result.current.status).toBe('missing');
    });

    test('does nothing without a call client', async () => {
        window.callsClient = undefined;
        const {result} = await renderControl();

        await act(() => result.current.toggle());

        expect(client.enableCamera).not.toHaveBeenCalled();
        expect(client.listenerCount(CALL_EVENT.CAMERA_ERROR)).toBe(0);
        expect(result.current.status).toBe('ready');
    });
});
