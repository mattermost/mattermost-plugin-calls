// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {act, renderHook, waitFor} from '@testing-library/react';
import CallClient from 'src/clients/call';
import {STORAGE_CALLS_DEFAULT_VIDEO_INPUT_KEY} from 'src/constants';
import {logErr} from 'src/log';
import {FakeCallClient, installFakeCallClient} from 'src/test_utils/fake_call_client';

import {useVideoInputDevices} from './use_video_input_devices';

jest.mock('src/log', () => ({
    logDebug: jest.fn(),
    logErr: jest.fn(),
    logWarn: jest.fn(),
}));

const makeCamera = (deviceId: string, label: string) => ({deviceId, label, kind: 'videoinput', groupId: ''}) as MediaDeviceInfo;

const builtIn = makeCamera('cam-1', 'Built-in Camera');
const usb = makeCamera('cam-2', 'USB Camera');

describe('useVideoInputDevices', () => {
    const getLocalVideoDevices = jest.spyOn(CallClient, 'getLocalVideoDevices');
    let client: FakeCallClient;
    let mediaDevices: EventTarget;

    beforeEach(() => {
        getLocalVideoDevices.mockResolvedValue([builtIn, usb]);
        client = installFakeCallClient();
        client.setVideoInputDevice.mockImplementation(async (device: MediaDeviceInfo) => {
            window.localStorage.setItem(STORAGE_CALLS_DEFAULT_VIDEO_INPUT_KEY, JSON.stringify({deviceId: device.deviceId, label: device.label}));
            return undefined;
        });
        mediaDevices = new EventTarget();
        Object.defineProperty(navigator, 'mediaDevices', {value: mediaDevices, configurable: true});
    });

    afterEach(() => {
        window.localStorage.removeItem(STORAGE_CALLS_DEFAULT_VIDEO_INPUT_KEY);
        window.callsClient = undefined;
        jest.clearAllMocks();
    });

    afterAll(() => {
        getLocalVideoDevices.mockRestore();
    });

    test('loads cameras and selects the saved one', async () => {
        window.localStorage.setItem(STORAGE_CALLS_DEFAULT_VIDEO_INPUT_KEY, JSON.stringify({deviceId: 'cam-2', label: 'USB Camera'}));

        const {result} = renderHook(() => useVideoInputDevices(false));

        await waitFor(() => expect(result.current.devices).toEqual([builtIn, usb]));
        expect(result.current.selectedDeviceId).toBe('cam-2');
    });

    test('reloads on devicechange and stops listening on unmount', async () => {
        const {result, unmount} = renderHook(() => useVideoInputDevices(false));
        await waitFor(() => expect(result.current.devices).toHaveLength(2));

        const external = makeCamera('cam-3', 'External Camera');
        getLocalVideoDevices.mockResolvedValue([builtIn, usb, external]);
        act(() => {
            mediaDevices.dispatchEvent(new Event('devicechange'));
        });
        await waitFor(() => expect(result.current.devices).toHaveLength(3));

        unmount();
        mediaDevices.dispatchEvent(new Event('devicechange'));
        expect(getLocalVideoDevices).toHaveBeenCalledTimes(2);
    });

    test('reloads when the camera turns on', async () => {
        getLocalVideoDevices.mockResolvedValueOnce([makeCamera('', '')]);
        const {result, rerender} = renderHook(({cameraOn}) => useVideoInputDevices(cameraOn), {initialProps: {cameraOn: false}});
        await waitFor(() => expect(result.current.devices).toHaveLength(1));
        expect(result.current.selectedDeviceId).toBeUndefined();

        rerender({cameraOn: true});

        await waitFor(() => expect(result.current.devices).toEqual([builtIn, usb]));
        expect(result.current.selectedDeviceId).toBe('cam-1');
    });

    test('logs a failed load and keeps the previous list', async () => {
        const {result} = renderHook(() => useVideoInputDevices(false));
        await waitFor(() => expect(result.current.devices).toEqual([builtIn, usb]));

        const err = new Error('enumerate failed');
        getLocalVideoDevices.mockRejectedValueOnce(err);
        await act(async () => {
            mediaDevices.dispatchEvent(new Event('devicechange'));
        });

        expect(logErr).toHaveBeenCalledWith('failed to get video devices', err);
        expect(result.current.devices).toEqual([builtIn, usb]);
        expect(result.current.selectedDeviceId).toBe('cam-1');
    });

    test('keeps the newest list when loads finish out of order', async () => {
        let resolveFirst: (devices: MediaDeviceInfo[]) => void = () => {};
        getLocalVideoDevices.mockReturnValueOnce(new Promise((resolve) => {
            resolveFirst = resolve;
        }));
        const {result} = renderHook(() => useVideoInputDevices(false));

        act(() => {
            mediaDevices.dispatchEvent(new Event('devicechange'));
        });
        await waitFor(() => expect(result.current.devices).toEqual([builtIn, usb]));

        await act(async () => {
            resolveFirst([builtIn]);
        });
        expect(result.current.devices).toEqual([builtIn, usb]);
    });

    test('selectDevice switches the camera through the client', async () => {
        const {result} = renderHook(() => useVideoInputDevices(false));
        await waitFor(() => expect(result.current.selectedDeviceId).toBe('cam-1'));

        await act(async () => {
            await result.current.selectDevice(usb);
        });

        expect(client.setVideoInputDevice).toHaveBeenCalledWith(usb);
        expect(result.current.selectedDeviceId).toBe('cam-2');
    });

    test('a failed switch keeps the previous selection', async () => {
        client.setVideoInputDevice.mockResolvedValue(undefined);
        const {result} = renderHook(() => useVideoInputDevices(false));
        await waitFor(() => expect(result.current.selectedDeviceId).toBe('cam-1'));

        await act(async () => {
            await result.current.selectDevice(usb);
        });

        expect(result.current.selectedDeviceId).toBe('cam-1');
    });
});
