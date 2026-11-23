// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {act, renderHook, waitFor} from '@testing-library/react';
import CallClient from 'src/clients/call';
import {STORAGE_CALLS_DEFAULT_VIDEO_INPUT_KEY} from 'src/constants';
import {getCallsClient} from 'src/utils';

import {getSelectedVideoInputId, useVideoInputDevices} from './use_video_input_devices';

jest.mock('src/clients/call', () => ({
    __esModule: true,
    default: {getLocalVideoDevices: jest.fn()},
}));

jest.mock('src/utils', () => ({
    getCallsClient: jest.fn(),
}));

jest.mock('src/log', () => ({
    logErr: jest.fn(),
}));

const makeCamera = (deviceId: string, label: string) => ({deviceId, label, kind: 'videoinput', groupId: ''}) as MediaDeviceInfo;

const builtIn = makeCamera('cam-1', 'Built-in Camera');
const usb = makeCamera('cam-2', 'USB Camera');

describe('getSelectedVideoInputId', () => {
    test.each([
        ['the saved ID', {deviceId: 'cam-2', label: 'USB Camera'}, 'cam-2'],
        ['the saved label when the ID changed', {deviceId: 'old-id', label: 'USB Camera'}, 'cam-2'],
        ['the first camera when nothing matches', {deviceId: 'old-id', label: 'Gone'}, 'cam-1'],
        ['the first camera when nothing is saved', null, 'cam-1'],
    ])('picks %s', (_, stored, expected) => {
        expect(getSelectedVideoInputId([builtIn, usb], stored)).toBe(expected);
    });

    test('skips cameras without an ID', () => {
        expect(getSelectedVideoInputId([makeCamera('', ''), usb], null)).toBe('cam-2');
        expect(getSelectedVideoInputId([makeCamera('', '')], null)).toBeUndefined();
    });
});

describe('useVideoInputDevices', () => {
    const getLocalVideoDevices = CallClient.getLocalVideoDevices as jest.Mock;
    const setVideoInputDevice = jest.fn();
    let mediaDevices: EventTarget;

    beforeEach(() => {
        getLocalVideoDevices.mockResolvedValue([builtIn, usb]);
        setVideoInputDevice.mockImplementation(async (device: MediaDeviceInfo) => {
            window.localStorage.setItem(STORAGE_CALLS_DEFAULT_VIDEO_INPUT_KEY, JSON.stringify({deviceId: device.deviceId, label: device.label}));
        });
        (getCallsClient as jest.Mock).mockReturnValue({setVideoInputDevice});
        mediaDevices = new EventTarget();
        Object.defineProperty(navigator, 'mediaDevices', {value: mediaDevices, configurable: true});
    });

    afterEach(() => {
        window.localStorage.removeItem(STORAGE_CALLS_DEFAULT_VIDEO_INPUT_KEY);
        jest.clearAllMocks();
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

        expect(setVideoInputDevice).toHaveBeenCalledWith(usb);
        expect(result.current.selectedDeviceId).toBe('cam-2');
    });

    test('a failed switch keeps the previous selection', async () => {
        setVideoInputDevice.mockResolvedValue(undefined);
        const {result} = renderHook(() => useVideoInputDevices(false));
        await waitFor(() => expect(result.current.selectedDeviceId).toBe('cam-1'));

        await act(async () => {
            await result.current.selectDevice(usb);
        });

        expect(result.current.selectedDeviceId).toBe('cam-1');
    });
});
