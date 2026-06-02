// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import CallsClient from './client';

describe('CallsClient', () => {
    let client: CallsClient;
    let originalLocalStorage: Storage;

    beforeEach(() => {
        // Mock localStorage
        originalLocalStorage = window.localStorage;
        const localStorageMock = {
            getItem: jest.fn(),
            setItem: jest.fn(),
            clear: jest.fn(),
            removeItem: jest.fn(),
            key: jest.fn(),
            length: 0,
        };
        Object.defineProperty(window, 'localStorage', {
            value: localStorageMock,
            writable: true,
        });

        // Create a new client instance for each test
        client = new CallsClient({
            wsURL: 'wss://test.com',
            authToken: 'test-token',
            iceServers: [],
            enableAV1: false,
            enableVideo: false,
            dcSignaling: false,
            dcLocking: false,
        });

        // Mock the emit method to prevent errors
        client.emit = jest.fn();
    });

    afterEach(() => {
        // Restore original localStorage
        Object.defineProperty(window, 'localStorage', {
            value: originalLocalStorage,
            writable: true,
        });
    });

    describe('getSelectedAudioDevice', () => {
        it('should return null when no device is selected', () => {
            // Mock localStorage.getItem to return null
            jest.spyOn(window.localStorage, 'getItem').mockReturnValue(null);

            // @ts-ignore - accessing private method for testing
            const result = client.getSelectedAudioDevice('input');
            expect(result).toBeNull();
        });

        it('should return null when selected device is not found', () => {
            // Mock localStorage.getItem to return a device ID
            jest.spyOn(window.localStorage, 'getItem').mockReturnValue(JSON.stringify({
                deviceId: 'non-existent-device',
                label: 'Non-existent Device',
            }));

            // Mock the audioDevices property
            // @ts-ignore - accessing private property for testing
            client.audioDevices = {
                inputs: [
                    {
                        deviceId: 'device1',
                        label: 'Device 1',
                        kind: 'audioinput',
                        groupId: '',
                        toJSON: jest.fn(),
                    } as MediaDeviceInfo,
                ],
                outputs: [],
            };

            // @ts-ignore - accessing private method for testing
            const result = client.getSelectedAudioDevice('input');
            expect(result).toBeNull();
        });

        it('should return the device when found by deviceId', () => {
            const expectedDevice = {
                deviceId: 'device1',
                label: 'Device 1',
                kind: 'audioinput',
                groupId: '',
                toJSON: jest.fn(),
            } as MediaDeviceInfo;

            // Mock localStorage.getItem to return a device ID
            jest.spyOn(window.localStorage, 'getItem').mockReturnValue(JSON.stringify({
                deviceId: 'device1',
                label: 'Device 1',
            }));

            // Mock the audioDevices property
            // @ts-ignore - accessing private property for testing
            client.audioDevices = {
                inputs: [expectedDevice],
                outputs: [],
            };

            // @ts-ignore - accessing private method for testing
            const result = client.getSelectedAudioDevice('input');
            expect(result).toEqual(expectedDevice);
        });

        it('should return the device when found by label', () => {
            const expectedDevice = {deviceId: 'device1', label: 'Device 1', kind: 'audioinput' as MediaDeviceKind, groupId: '', toJSON: jest.fn()};

            // Mock localStorage.getItem to return a device with matching label but different ID
            jest.spyOn(window.localStorage, 'getItem').mockReturnValue(JSON.stringify({
                deviceId: 'old-device-id',
                label: 'Device 1',
            }));

            // Mock the audioDevices property
            // @ts-ignore - accessing private property for testing
            client.audioDevices = {
                inputs: [expectedDevice],
                outputs: [],
            };

            // @ts-ignore - accessing private method for testing
            const result = client.getSelectedAudioDevice('input');
            expect(result).toEqual(expectedDevice);
        });

        it('should handle multiple devices with the same label', () => {
            const expectedDevice = {
                deviceId: 'device1',
                label: 'Same Label',
                kind: 'audioinput',
                groupId: '',
                toJSON: jest.fn(),
            } as MediaDeviceInfo;

            // Mock localStorage.getItem to return a device ID
            jest.spyOn(window.localStorage, 'getItem').mockReturnValue(JSON.stringify({
                deviceId: 'device1',
                label: 'Same Label',
            }));

            // Mock the audioDevices property with multiple devices having the same label
            // @ts-ignore - accessing private property for testing
            client.audioDevices = {
                inputs: [
                    expectedDevice,
                    {
                        deviceId: 'device2',
                        label: 'Same Label',
                        kind: 'audioinput',
                        groupId: '',
                        toJSON: jest.fn(),
                    } as MediaDeviceInfo,
                ],
                outputs: [],
            };

            // @ts-ignore - accessing private method for testing
            const result = client.getSelectedAudioDevice('input');
            expect(result).toEqual(expectedDevice);
        });

        it('should handle backward compatibility with string device IDs', () => {
            const expectedDevice = {deviceId: 'device1', label: 'Device 1', kind: 'audioinput' as MediaDeviceKind, groupId: '', toJSON: jest.fn()};

            // Mock localStorage.getItem to return just a string (old format)
            jest.spyOn(window.localStorage, 'getItem').mockReturnValue('device1');

            // Mock the audioDevices property
            // @ts-ignore - accessing private property for testing
            client.audioDevices = {
                inputs: [expectedDevice],
                outputs: [],
            };

            // @ts-ignore - accessing private method for testing
            const result = client.getSelectedAudioDevice('input');
            expect(result).toEqual(expectedDevice);
        });
    });

    describe('handleAudioDeviceFallback', () => {
        it('should fall back to system default when current input device is missing', async () => {
            // Setup current device that's no longer available
            // @ts-ignore - accessing private property for testing
            client.currentAudioInputDevice = {deviceId: 'missing-device', label: 'Missing Device'};

            const defaultDevice = {
                deviceId: 'default-device',
                label: 'Default Device',
                kind: 'audioinput',
                groupId: '',
                toJSON: jest.fn(),
            } as MediaDeviceInfo;

            // Mock the audioDevices property
            // @ts-ignore - accessing private property for testing
            client.audioDevices = {
                inputs: [defaultDevice],
                outputs: [],
            };

            // Mock setAudioInputDevice
            // @ts-ignore - accessing private method for testing
            client.setAudioInputDevice = jest.fn();

            // @ts-ignore - accessing private method for testing
            await client.handleAudioDeviceFallback('input');

            // @ts-ignore - accessing private method for testing
            expect(client.setAudioInputDevice).toHaveBeenCalledWith(defaultDevice, false);
        });

        it('should fall back to system default when current output device is missing', async () => {
            // Setup current device that's no longer available
            // @ts-ignore - accessing private property for testing
            client.currentAudioOutputDevice = {deviceId: 'missing-device', label: 'Missing Device'};

            const defaultDevice = {
                deviceId: 'default-device',
                label: 'Default Device',
                kind: 'audiooutput',
                groupId: '',
                toJSON: jest.fn(),
            } as MediaDeviceInfo;

            // Mock the audioDevices property
            // @ts-ignore - accessing private property for testing
            client.audioDevices = {
                inputs: [],
                outputs: [defaultDevice],
            };

            // Mock setAudioOutputDevice
            // @ts-ignore - accessing private method for testing
            client.setAudioOutputDevice = jest.fn();

            // @ts-ignore - accessing private method for testing
            await client.handleAudioDeviceFallback('output');

            // @ts-ignore - accessing private method for testing
            expect(client.setAudioOutputDevice).toHaveBeenCalledWith(defaultDevice, false);
        });

        it('should switch to selected input device when it becomes available', async () => {
            // Setup current device
            // @ts-ignore - accessing private property for testing
            client.currentAudioInputDevice = {deviceId: 'current-device', label: 'Current Device'};

            const selectedDevice = {
                deviceId: 'selected-device',
                label: 'Selected Device',
                kind: 'audioinput',
                groupId: '',
                toJSON: jest.fn(),
            } as MediaDeviceInfo;

            // Mock the audioDevices property
            // @ts-ignore - accessing private property for testing
            client.audioDevices = {
                inputs: [
                    {
                        deviceId: 'current-device',
                        label: 'Current Device',
                        kind: 'audioinput',
                        groupId: '',
                        toJSON: jest.fn(),
                    } as MediaDeviceInfo,
                    selectedDevice,
                ],
                outputs: [],
            };

            // Mock getSelectedAudioDevice to return the selected device
            // @ts-ignore - accessing private method for testing
            client.getSelectedAudioDevice = jest.fn().mockReturnValue(selectedDevice);

            // Mock setAudioInputDevice
            // @ts-ignore - accessing private method for testing
            client.setAudioInputDevice = jest.fn();

            // @ts-ignore - accessing private method for testing
            await client.handleAudioDeviceFallback('input');

            // @ts-ignore - accessing private method for testing
            expect(client.setAudioInputDevice).toHaveBeenCalledWith(selectedDevice, false);
        });

        it('should switch to selected output device when it becomes available', async () => {
            // Setup current device
            // @ts-ignore - accessing private property for testing
            client.currentAudioOutputDevice = {deviceId: 'current-device', label: 'Current Device'};

            const selectedDevice = {
                deviceId: 'selected-device',
                label: 'Selected Device',
                kind: 'audiooutput',
                groupId: '',
                toJSON: jest.fn(),
            } as MediaDeviceInfo;

            // Mock the audioDevices property
            // @ts-ignore - accessing private property for testing
            client.audioDevices = {
                inputs: [],
                outputs: [
                    {
                        deviceId: 'current-device',
                        label: 'Current Device',
                        kind: 'audiooutput',
                        groupId: '',
                        toJSON: jest.fn(),
                    } as MediaDeviceInfo,
                    selectedDevice,
                ],
            };

            // Mock getSelectedAudioDevice to return the selected device
            // @ts-ignore - accessing private method for testing
            client.getSelectedAudioDevice = jest.fn().mockReturnValue(selectedDevice);

            // Mock setAudioOutputDevice
            // @ts-ignore - accessing private method for testing
            client.setAudioOutputDevice = jest.fn();

            // @ts-ignore - accessing private method for testing
            await client.handleAudioDeviceFallback('output');

            // @ts-ignore - accessing private method for testing
            expect(client.setAudioOutputDevice).toHaveBeenCalledWith(selectedDevice, false);
        });

        it('should do nothing when current device is available and matches selected device', async () => {
            // Setup current device
            const currentDevice = {deviceId: 'current-device', label: 'Current Device'};

            // @ts-ignore - accessing private property for testing
            client.currentAudioInputDevice = currentDevice;

            // Mock the audioDevices property
            // @ts-ignore - accessing private property for testing
            client.audioDevices = {
                inputs: [
                    {
                        deviceId: 'current-device',
                        label: 'Current Device',
                        kind: 'audioinput',
                        groupId: '',
                        toJSON: jest.fn(),
                    } as MediaDeviceInfo,
                ],
                outputs: [],
            };

            // Mock getSelectedAudioDevice to return the current device
            // @ts-ignore - accessing private method for testing
            client.getSelectedAudioDevice = jest.fn().mockReturnValue(currentDevice);

            // Mock setAudioInputDevice
            // @ts-ignore - accessing private method for testing
            client.setAudioInputDevice = jest.fn();

            // @ts-ignore - accessing private method for testing
            await client.handleAudioDeviceFallback('input');

            // @ts-ignore - accessing private method for testing
            expect(client.setAudioInputDevice).not.toHaveBeenCalled();
        });
    });

    describe('video track management', () => {
        const originalMediaDevices = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');

        afterEach(() => {
            // Restore navigator.mediaDevices in case a test replaced it, to avoid polluting other tests.
            if (originalMediaDevices) {
                Object.defineProperty(navigator, 'mediaDevices', originalMediaDevices);
            } else {
                // @ts-ignore - cleaning up a mock added by a test
                delete navigator.mediaDevices;
            }
        });

        const makeVideoTrack = (id: string) => ({
            id,
            kind: 'video',
            enabled: false,
            stop: jest.fn(),
            dispatchEvent: jest.fn(),
        });

        const makeStream = (id: string, tracks: Array<ReturnType<typeof makeVideoTrack>>) => ({
            id,
            getVideoTracks: () => tracks,
            getTracks: () => tracks,
            removeTrack: jest.fn(),
            addTrack: jest.fn(),
        });

        const setupPeer = () => {
            const peer = {addTrack: jest.fn(), replaceTrack: jest.fn()};
            const ws = {send: jest.fn()};

            // @ts-ignore - accessing private property for testing
            client.config.enableVideo = true;

            // @ts-ignore - accessing private property for testing
            client.peer = peer;

            // @ts-ignore - accessing private property for testing
            client.ws = ws;
            return {peer, ws};
        };

        it('startVideo adds the track and records the sender track ID', async () => {
            const {peer} = setupPeer();
            const track = makeVideoTrack('cam-1');
            const stream = makeStream('stream-1', [track]);

            // @ts-ignore - accessing private property for testing
            client.localVideoStream = stream;

            await client.startVideo();

            expect(peer.addTrack).toHaveBeenCalledTimes(1);
            expect(track.enabled).toBe(true);

            // @ts-ignore - accessing private property for testing
            expect(client.videoTrackAdded).toBe(true);

            // @ts-ignore - accessing private property for testing
            expect(client.videoSenderTrackID).toBe('cam-1');
        });

        it('stopVideo stops the camera track and releases the stream so the device LED turns off', () => {
            const {peer, ws} = setupPeer();
            const track = makeVideoTrack('cam-1');
            track.enabled = true;
            const stream = makeStream('stream-1', [track]);

            // @ts-ignore - accessing private property for testing
            client.localVideoStream = stream;

            // @ts-ignore - accessing private property for testing
            client.videoSenderTrackID = 'cam-1';

            client.stopVideo();

            // Detaches the track from the sender (which is kept alive) before stopping it.
            expect(peer.replaceTrack).toHaveBeenCalledWith('cam-1', null);

            // Crucially, the device is fully stopped (not just disabled) so the LED turns off,
            // and an 'ended' event is dispatched so listeners can react.
            expect(track.stop).toHaveBeenCalledTimes(1);
            expect(track.dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({type: 'ended'}));

            // The stream is released so the next startVideo re-initializes it.
            // @ts-ignore - accessing private property for testing
            expect(client.localVideoStream).toBeNull();
            expect(ws.send).toHaveBeenCalledWith('video_off');
        });

        it('stopVideo stops and clears the background-blur segmenter when active', () => {
            setupPeer();
            const track = makeVideoTrack('cam-1');
            track.enabled = true;
            const stream = makeStream('stream-1', [track]);
            const segmenter = {stop: jest.fn()};

            // @ts-ignore - accessing private property for testing
            client.localVideoStream = stream;

            // @ts-ignore - accessing private property for testing
            client.videoSenderTrackID = 'cam-1';

            // @ts-ignore - accessing private property for testing
            client.segmenter = segmenter;

            client.stopVideo();

            expect(segmenter.stop).toHaveBeenCalledTimes(1);

            // @ts-ignore - accessing private property for testing
            expect(client.segmenter).toBeNull();
        });

        it('re-enables video after a stop by replacing the sender track with a freshly acquired one', async () => {
            const {peer} = setupPeer();

            const track1 = makeVideoTrack('cam-1');
            const stream1 = makeStream('stream-1', [track1]);

            // @ts-ignore - accessing private property for testing
            client.localVideoStream = stream1;

            await client.startVideo();
            client.stopVideo();

            // initVideo acquires a brand new stream/track on re-enable.
            const track2 = makeVideoTrack('cam-2');
            const stream2 = makeStream('stream-2', [track2]);

            // @ts-ignore - accessing private method for testing
            client.initVideo = jest.fn().mockImplementation(async () => {
                // @ts-ignore - accessing private property for testing
                client.localVideoStream = stream2;
            });

            await client.startVideo();

            // The sender is reused (no second addTrack) and the new track replaces the
            // previously held one, keyed by the tracked ID.
            expect(peer.addTrack).toHaveBeenCalledTimes(1);
            expect(peer.replaceTrack).toHaveBeenLastCalledWith('cam-1', track2);

            // @ts-ignore - accessing private property for testing
            expect(client.videoSenderTrackID).toBe('cam-2');
        });

        it('keeps the sender track ID in sync after a device switch so a later stopVideo targets the right sender (MM-68796 regression)', async () => {
            const {peer} = setupPeer();

            const oldTrack = makeVideoTrack('cam-1');
            const oldStream = makeStream('stream-1', [oldTrack]);

            // @ts-ignore - accessing private property for testing
            client.localVideoStream = oldStream;

            await client.startVideo();

            // @ts-ignore - accessing private property for testing
            expect(client.videoSenderTrackID).toBe('cam-1');

            // Switching the camera replaces the sender track, which re-keys the peer's
            // senders map. Before the fix, videoSenderTrackID kept pointing at the old ID,
            // and the subsequent stopVideo threw "senders for track not found".
            const newTrack = makeVideoTrack('cam-2');
            const newStream = makeStream('stream-2', [newTrack]);
            Object.defineProperty(navigator, 'mediaDevices', {
                value: {getUserMedia: jest.fn().mockResolvedValue(newStream)},
                writable: true,
                configurable: true,
            });

            await client.setVideoInputDevice({deviceId: 'cam-2-device', label: 'Camera 2'} as MediaDeviceInfo);

            expect(oldTrack.stop).toHaveBeenCalledTimes(1);
            expect(peer.replaceTrack).toHaveBeenLastCalledWith('cam-1', newTrack);

            // @ts-ignore - accessing private property for testing
            expect(client.videoSenderTrackID).toBe('cam-2');

            client.stopVideo();

            // The detach now targets the current sender track, not the stale one.
            expect(peer.replaceTrack).toHaveBeenLastCalledWith('cam-2', null);
            expect(newTrack.stop).toHaveBeenCalledTimes(1);
        });
    });
});
