// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {CALL_EVENT} from 'src/clients/call/constants';
import {CameraState, type ScreenShareTrack} from 'src/clients/call/types';

import {FakeCallClient, installFakeCallClient} from './fake_call_client';

// ScreenShareTrack is LiveKit's VideoTrack, which cameras use too.
const videoTrack = {} as ScreenShareTrack;

describe('FakeCallClient', () => {
    let client: FakeCallClient;

    beforeEach(() => {
        client = new FakeCallClient();
    });

    test('reports the camera as off for a session it has not seen', () => {
        expect(client.getCameraTrack('session-1')).toEqual({state: CameraState.Off, track: null});
    });

    test('setCamera stores the camera and emits CAMERA_CHANGED', () => {
        const listener = jest.fn();
        client.on(CALL_EVENT.CAMERA_CHANGED, listener);
        const camera = {state: CameraState.Ready, track: videoTrack};

        client.setCamera('session-1', camera);

        expect(client.getCameraTrack('session-1')).toBe(camera);
        expect(listener).toHaveBeenCalledWith('session-1', 'user-session-1', CameraState.Ready);
    });

    test('starts with no screen share', () => {
        expect(client.getCurrentScreenSharingSessionID()).toBeNull();
        expect(client.getLocalScreenTrack()).toBeNull();
        expect(client.getRemoteScreenTrack()).toBeNull();
    });

    test.each([
        ['a local', true],
        ['a remote', false],
    ])('setScreenShare tracks %s share and emits SCREEN_SHARING_CHANGED', (_, isLocal) => {
        const listener = jest.fn();
        client.on(CALL_EVENT.SCREEN_SHARING_CHANGED, listener);
        const session = {sessionID: 'session-1', userID: 'user-1', isLocal, track: videoTrack};

        client.setScreenShare(session);

        expect(client.getCurrentScreenSharingSessionID()).toBe('session-1');
        expect(client.getLocalScreenTrack()).toBe(isLocal ? videoTrack : null);
        expect(client.getRemoteScreenTrack()).toBe(isLocal ? null : videoTrack);
        expect(listener).toHaveBeenCalledWith(session);
    });

    test('setScreenShare with null clears the share and emits SCREEN_SHARING_CHANGED', () => {
        client.setScreenShare({sessionID: 'session-1', userID: 'user-1', isLocal: true, track: videoTrack});
        const listener = jest.fn();
        client.on(CALL_EVENT.SCREEN_SHARING_CHANGED, listener);

        client.setScreenShare(null);

        expect(client.getCurrentScreenSharingSessionID()).toBeNull();
        expect(client.getLocalScreenTrack()).toBeNull();
        expect(client.getRemoteScreenTrack()).toBeNull();
        expect(listener).toHaveBeenCalledWith(null);
    });

    test('setAudioDevices stores the devices and emits DEVICE_CHANGE', () => {
        const listener = jest.fn();
        client.on(CALL_EVENT.DEVICE_CHANGE, listener);
        const devices = {inputs: [{deviceId: 'mic'} as MediaDeviceInfo], outputs: [{deviceId: 'speaker'} as MediaDeviceInfo]};

        expect(client.getAudioDevices()).toEqual({inputs: [], outputs: []});

        client.setAudioDevices(devices);

        expect(client.getAudioDevices()).toBe(devices);
        expect(listener).toHaveBeenCalledWith(devices);
    });

    test('installFakeCallClient sets a new fake as window.callsClient', () => {
        const installed = installFakeCallClient();

        expect(installed).not.toBe(client);
        expect(window.callsClient).toBe(installed);

        window.callsClient = undefined;
    });
});
