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
});
