// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {EventEmitter} from 'events';
import type CallClient from 'src/clients/call';
import {CALL_EVENT} from 'src/clients/call/constants';
import {CameraState, type CameraTrack, type DeviceStatus, type ScreenShareTrack, type ScreenSharingSession} from 'src/clients/call/types';
import type {MediaDevices} from 'src/types/types';

/**
 * A stand-in for CallClient in tests. Fire events with emit(). Methods are jest.fn, so tests
 * can stub or inspect them, and the set* helpers change state the way the client does and
 * emit the event that reports it.
 */
export class FakeCallClient extends EventEmitter {
    channelID = 'channel-id';
    canPlaybackAudio = true;
    currentAudioInputDevice: MediaDeviceInfo | null = null;
    currentAudioOutputDevice: MediaDeviceInfo | null = null;
    cameras = new Map<string, CameraTrack>();
    micStatus: DeviceStatus = 'ready';
    audioDevices: MediaDevices = {inputs: [], outputs: []};
    screenSharingSessionID: string | null = null;
    localScreenTrack: ScreenShareTrack | null = null;
    remoteScreenTrack: ScreenShareTrack | null = null;

    disconnect = jest.fn();
    mute = jest.fn();
    unmute = jest.fn();
    raiseHand = jest.fn();
    unraiseHand = jest.fn();
    startAudio = jest.fn(async () => undefined);
    sendDTMF = jest.fn(async (_digit: string) => undefined);
    enableCamera = jest.fn(async () => undefined);
    disableCamera = jest.fn(async () => undefined);
    setAudioInputDevice = jest.fn(async (_device: MediaDeviceInfo) => undefined);
    setAudioOutputDevice = jest.fn(async (_device: MediaDeviceInfo) => undefined);
    setVideoInputDevice = jest.fn(async (_device: MediaDeviceInfo) => undefined);
    canPublishCamera = jest.fn(() => true);
    getSessionID = jest.fn(() => 'session-id');
    getRemoteScreenTrack = jest.fn(() => this.remoteScreenTrack);
    getLocalScreenTrack = jest.fn(() => this.localScreenTrack);
    getCurrentScreenSharingSessionID = jest.fn(() => this.screenSharingSessionID);
    unshareScreen = jest.fn(async () => undefined);
    getMicStatus = jest.fn(() => this.micStatus);
    getAudioDevices = jest.fn(() => this.audioDevices);
    getCameraTrack = jest.fn((sessionID: string): CameraTrack => this.cameras.get(sessionID) ?? {state: CameraState.Off, track: null});

    setCamera(sessionID: string, camera: CameraTrack) {
        this.cameras.set(sessionID, camera);
        this.emit(CALL_EVENT.CAMERA_CHANGED, sessionID, `user-${sessionID}`, camera.state);
    }

    setMicStatus(status: DeviceStatus) {
        this.micStatus = status;
        this.emit(CALL_EVENT.MIC_STATUS_CHANGED, status);
    }

    setScreenShare(session: ScreenSharingSession | null) {
        this.screenSharingSessionID = session?.sessionID ?? null;
        this.localScreenTrack = session?.isLocal ? session.track : null;
        this.remoteScreenTrack = session && !session.isLocal ? session.track : null;
        this.emit(CALL_EVENT.SCREEN_SHARING_CHANGED, session);
    }

    setAudioDevices(devices: MediaDevices) {
        this.audioDevices = devices;
        this.emit(CALL_EVENT.DEVICE_CHANGE, devices);
    }

    asCallClient() {
        return this as unknown as CallClient;
    }
}

// Sets a new fake as window.callsClient, which getCallsClient() returns outside a popout.
export function installFakeCallClient(): FakeCallClient {
    const client = new FakeCallClient();
    window.callsClient = client.asCallClient();
    return client;
}
