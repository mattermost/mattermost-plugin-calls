// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {act, fireEvent, render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {createLocalVideoTrack, TrackEvent} from 'livekit-client';
import React from 'react';
import {IntlProvider} from 'react-intl';
import {Provider} from 'react-redux';
import CallClient from 'src/clients/call';
import {CAMERA_CAPTURE_DEFAULTS} from 'src/clients/call/constants';
import {STORAGE_CALLS_DEFAULT_VIDEO_INPUT_KEY, STORAGE_CALLS_MIRROR_VIDEO} from 'src/constants';
import {logErr} from 'src/log';
import {mockStore} from 'src/testUtils';

import VideoDevicesSettingsSection from './video_devices_settings_section';

jest.mock('livekit-client', () => ({
    ...jest.requireActual('livekit-client'),
    createLocalVideoTrack: jest.fn(),
}));

jest.mock('src/clients/call', () => ({
    __esModule: true,
    default: {getLocalVideoDevices: jest.fn()},
    CameraError: jest.requireActual('src/clients/call/types').CameraError,
}));

jest.mock('src/log', () => ({
    logErr: jest.fn(),
}));

const MESSAGES_ID = 'videoInputMessages';
const LOAD_ERROR_MESSAGE = 'Unable to load video devices. Make sure a camera is connected and that Mattermost is allowed to use it.';
const MIRRORED_CLASS = 'VideoDevicesSettings__video--mirrored';

const makeCamera = (deviceId: string, label: string) => ({deviceId, label, kind: 'videoinput', groupId: ''}) as MediaDeviceInfo;

const builtIn = makeCamera('cam-1', 'Built-in Camera');
const usb = makeCamera('cam-2', 'USB Camera');

type FakeTrack = ReturnType<typeof makeTrack>;
type TrackEventHandler = () => void;

function makeTrack(deviceId = 'cam-1') {
    const handlers = new Map<string, TrackEventHandler>();
    return {
        mediaStreamTrack: {getSettings: () => ({deviceId})},
        attach: jest.fn(),
        detach: jest.fn(),
        stop: jest.fn(),
        restartTrack: jest.fn().mockResolvedValue(undefined),
        on: jest.fn((event: string, handler: TrackEventHandler) => {
            handlers.set(event, handler);
        }),
        fire: (event: string) => handlers.get(event)?.(),
    };
}

const expectedCapture = (deviceId: string) => ({...CAMERA_CAPTURE_DEFAULTS, deviceId: {exact: deviceId}});

describe('VideoDevicesSettingsSection', () => {
    const getLocalVideoDevices = CallClient.getLocalVideoDevices as jest.Mock;
    const createTrack = createLocalVideoTrack as jest.Mock;
    let mediaDevices: EventTarget & {getUserMedia: jest.Mock; enumerateDevices: jest.Mock};

    const store = mockStore({
        entities: {
            users: {
                currentUserId: 'user-1',
                profiles: {'user-1': {id: 'user-1', username: 'alice', last_picture_update: 0}},
            },
        },
    });

    const renderComponent = () => render(
        <Provider store={store}>
            <IntlProvider locale='en'>
                <VideoDevicesSettingsSection/>
            </IntlProvider>
        </Provider>,
    );

    const openSection = async () => {
        await userEvent.click(screen.getByText('Edit'));
        await screen.findByText('Camera input');
    };

    const getVideo = () => document.querySelector('video') as HTMLVideoElement;

    // react-select renders its own polite live region, so match ours by class.
    const getLiveRegion = () => {
        const region = document.querySelector('.VideoDevicesSettings__liveRegion');
        expect(region).toHaveAttribute('aria-live', 'polite');
        return region;
    };

    // Starts the preview and waits for frames, so the section reports the camera as on.
    const turnOnCamera = async (track: FakeTrack = makeTrack()) => {
        createTrack.mockResolvedValueOnce(track);
        await userEvent.click(screen.getByRole('button', {name: 'Turn on camera'}));
        fireEvent.playing(getVideo());
        await screen.findByRole('button', {name: 'Turn off camera'});
        return track;
    };

    beforeEach(() => {
        getLocalVideoDevices.mockResolvedValue([builtIn, usb]);
        mediaDevices = Object.assign(new EventTarget(), {
            getUserMedia: jest.fn(),
            enumerateDevices: jest.fn(),
        });
        Object.defineProperty(navigator, 'mediaDevices', {
            value: mediaDevices,
            configurable: true,
        });
    });

    afterEach(() => {
        window.localStorage.removeItem(STORAGE_CALLS_DEFAULT_VIDEO_INPUT_KEY);
        window.localStorage.removeItem(STORAGE_CALLS_MIRROR_VIDEO);
        jest.clearAllMocks();
    });

    test('does not load devices while collapsed', () => {
        renderComponent();

        expect(screen.getByText('Video devices')).toBeInTheDocument();
        expect(getLocalVideoDevices).not.toHaveBeenCalled();
    });

    test('lists cameras without asking for camera access before the click', async () => {
        renderComponent();
        await openSection();

        expect(await screen.findByText('Built-in Camera')).toBeInTheDocument();
        expect(getLocalVideoDevices).toHaveBeenCalledWith();
        expect(createTrack).not.toHaveBeenCalled();
        expect(mediaDevices.getUserMedia).not.toHaveBeenCalled();
        expect(getVideo()).toBeNull();
        expect(screen.getByAltText('alice profile image')).toBeInTheDocument();
    });

    test('names cameras by number while the browser hides their labels', async () => {
        getLocalVideoDevices.mockResolvedValue([makeCamera('', ''), makeCamera('', '')]);
        renderComponent();
        await openSection();

        expect(await screen.findByText('Camera 1')).toBeInTheDocument();
    });

    test('preselects the saved camera', async () => {
        window.localStorage.setItem(STORAGE_CALLS_DEFAULT_VIDEO_INPUT_KEY, JSON.stringify({deviceId: usb.deviceId, label: usb.label}));
        renderComponent();
        await openSection();

        expect(await screen.findByText('USB Camera')).toBeInTheDocument();
        expect(screen.queryByText('Built-in Camera')).not.toBeInTheDocument();
    });

    test('preselects the saved camera by label when its deviceId changed', async () => {
        window.localStorage.setItem(STORAGE_CALLS_DEFAULT_VIDEO_INPUT_KEY, JSON.stringify({deviceId: 'old-id', label: usb.label}));
        renderComponent();
        await openSection();

        expect(await screen.findByText('USB Camera')).toBeInTheDocument();
    });

    test.each([
        ['is not valid JSON', '{not json'],
        ['is gone and has no label', JSON.stringify({deviceId: 'gone'})],
    ])('preselects the first camera when the saved camera %s', async (_, stored) => {
        window.localStorage.setItem(STORAGE_CALLS_DEFAULT_VIDEO_INPUT_KEY, stored);
        renderComponent();
        await openSection();

        expect(await screen.findByText('Built-in Camera')).toBeInTheDocument();
        expect(screen.queryByText('USB Camera')).not.toBeInTheDocument();
    });

    test('shows "Starting camera…" until frames arrive, then announces the camera is on', async () => {
        let resolveTrack: (track: FakeTrack) => void = () => {};
        createTrack.mockImplementationOnce(() => new Promise((resolve) => {
            resolveTrack = resolve;
        }));
        renderComponent();
        await openSection();
        await screen.findByText('Built-in Camera');

        await userEvent.click(screen.getByRole('button', {name: 'Turn on camera'}));

        expect(createTrack).toHaveBeenCalledWith(expectedCapture('cam-1'));
        expect(screen.getByText('Starting camera…')).toBeInTheDocument();
        expect(screen.getByAltText('alice profile image')).toBeInTheDocument();

        const track = makeTrack();
        await act(async () => resolveTrack(track));
        expect(track.attach).toHaveBeenCalledWith(getVideo());
        expect(screen.getByText('Starting camera…')).toBeInTheDocument();
        expect(getLiveRegion()).toHaveTextContent('');

        fireEvent.playing(getVideo());

        expect(await screen.findByRole('button', {name: 'Turn off camera'})).toBeInTheDocument();
        expect(screen.queryByText('Starting camera…')).not.toBeInTheDocument();
        expect(screen.queryByAltText('alice profile image')).not.toBeInTheDocument();
        expect(getLiveRegion()).toHaveTextContent('Camera on');
    });

    test('captures the saved camera', async () => {
        window.localStorage.setItem(STORAGE_CALLS_DEFAULT_VIDEO_INPUT_KEY, JSON.stringify({deviceId: usb.deviceId, label: usb.label}));
        renderComponent();
        await openSection();
        await screen.findByText('USB Camera');

        await turnOnCamera(makeTrack('cam-2'));

        expect(createTrack).toHaveBeenCalledWith(expectedCapture('cam-2'));
    });

    test('captures without a deviceId while the browser hides device IDs', async () => {
        getLocalVideoDevices.mockResolvedValue([makeCamera('', '')]);
        renderComponent();
        await openSection();
        await screen.findByText('Camera 1');

        await turnOnCamera();

        expect(createTrack).toHaveBeenCalledWith({...CAMERA_CAPTURE_DEFAULTS, deviceId: undefined});
    });

    test('captures without a deviceId when no camera is listed', async () => {
        getLocalVideoDevices.mockResolvedValue([]);
        renderComponent();
        await openSection();

        await turnOnCamera();

        expect(createTrack).toHaveBeenCalledWith({...CAMERA_CAPTURE_DEFAULTS, deviceId: undefined});
    });

    test('reloads the camera list once access is granted', async () => {
        getLocalVideoDevices.mockResolvedValueOnce([makeCamera('', '')]);
        renderComponent();
        await openSection();
        await screen.findByText('Camera 1');

        await turnOnCamera();

        expect(getLocalVideoDevices).toHaveBeenCalledTimes(2);
        expect(await screen.findByText('Built-in Camera')).toBeInTheDocument();
    });

    test('turning the camera off stops the track and announces it', async () => {
        renderComponent();
        await openSection();
        await screen.findByText('Built-in Camera');
        const track = await turnOnCamera();

        await userEvent.click(screen.getByRole('button', {name: 'Turn off camera'}));

        expect(track.stop).toHaveBeenCalledTimes(1);
        expect(getVideo()).toBeNull();
        expect(screen.getByAltText('alice profile image')).toBeInTheDocument();
        expect(getLiveRegion()).toHaveTextContent('Camera off');
    });

    test('picking another camera restarts the preview on it', async () => {
        renderComponent();
        await openSection();
        await screen.findByText('Built-in Camera');
        const track = await turnOnCamera();

        await userEvent.click(screen.getByLabelText('Camera input'));
        await userEvent.click(screen.getByText('USB Camera'));

        expect(track.restartTrack).toHaveBeenCalledWith(expectedCapture('cam-2'));
        expect(createTrack).toHaveBeenCalledTimes(1);
    });

    test('saves the selected camera and the mirror setting', async () => {
        renderComponent();
        await openSection();
        await screen.findByText('Built-in Camera');

        await userEvent.click(screen.getByLabelText('Camera input'));
        await userEvent.click(screen.getByText('USB Camera'));
        await userEvent.click(screen.getByLabelText('Mirror video'));
        await userEvent.click(screen.getByText('Save'));

        expect(JSON.parse(window.localStorage.getItem(STORAGE_CALLS_DEFAULT_VIDEO_INPUT_KEY) ?? '')).toEqual({deviceId: 'cam-2', label: 'USB Camera'});
        expect(window.localStorage.getItem(STORAGE_CALLS_MIRROR_VIDEO)).toBe('on');
        expect(screen.getByText('Edit')).toBeInTheDocument();
    });

    test('saves mirror off when it is unchecked', async () => {
        window.localStorage.setItem(STORAGE_CALLS_MIRROR_VIDEO, 'on');
        renderComponent();
        await openSection();
        await screen.findByText('Built-in Camera');
        expect(screen.getByLabelText('Mirror video')).toBeChecked();

        await userEvent.click(screen.getByLabelText('Mirror video'));
        await userEvent.click(screen.getByText('Save'));

        expect(window.localStorage.getItem(STORAGE_CALLS_MIRROR_VIDEO)).toBe('off');
    });

    test('keeps the saved camera when saving with no camera to pick', async () => {
        const saved = JSON.stringify({deviceId: usb.deviceId, label: usb.label});
        window.localStorage.setItem(STORAGE_CALLS_DEFAULT_VIDEO_INPUT_KEY, saved);
        getLocalVideoDevices.mockResolvedValue([]);
        renderComponent();
        await openSection();

        await userEvent.click(screen.getByText('Save'));

        expect(window.localStorage.getItem(STORAGE_CALLS_DEFAULT_VIDEO_INPUT_KEY)).toBe(saved);
    });

    test('Cancel stops the preview and saves nothing', async () => {
        renderComponent();
        await openSection();
        await screen.findByText('Built-in Camera');
        const track = await turnOnCamera();
        await userEvent.click(screen.getByLabelText('Mirror video'));

        await userEvent.click(screen.getByText('Cancel'));

        expect(track.stop).toHaveBeenCalledTimes(1);
        expect(window.localStorage.getItem(STORAGE_CALLS_DEFAULT_VIDEO_INPUT_KEY)).toBeNull();
        expect(window.localStorage.getItem(STORAGE_CALLS_MIRROR_VIDEO)).toBeNull();
    });

    test('Save stops the preview', async () => {
        renderComponent();
        await openSection();
        await screen.findByText('Built-in Camera');
        const track = await turnOnCamera();

        await userEvent.click(screen.getByText('Save'));

        expect(track.stop).toHaveBeenCalledTimes(1);
    });

    test('unmounting stops the preview', async () => {
        const {unmount} = renderComponent();
        await openSection();
        await screen.findByText('Built-in Camera');
        const track = await turnOnCamera();

        unmount();

        expect(track.stop).toHaveBeenCalledTimes(1);
    });

    test('stops a capture that finishes after Cancel', async () => {
        let resolveTrack: (track: FakeTrack) => void = () => {};
        createTrack.mockImplementationOnce(() => new Promise((resolve) => {
            resolveTrack = resolve;
        }));
        renderComponent();
        await openSection();
        await screen.findByText('Built-in Camera');
        await userEvent.click(screen.getByRole('button', {name: 'Turn on camera'}));

        await userEvent.click(screen.getByText('Cancel'));
        const track = makeTrack();
        await act(async () => resolveTrack(track));

        expect(track.stop).toHaveBeenCalledTimes(1);
    });

    test('ignores a capture that fails after Cancel', async () => {
        let rejectTrack: (err: unknown) => void = () => {};
        createTrack.mockImplementationOnce(() => new Promise((_, reject) => {
            rejectTrack = reject;
        }));
        renderComponent();
        await openSection();
        await screen.findByText('Built-in Camera');
        await userEvent.click(screen.getByRole('button', {name: 'Turn on camera'}));

        await userEvent.click(screen.getByText('Cancel'));
        await act(async () => rejectTrack(new DOMException('failed', 'NotReadableError')));

        expect(logErr).not.toHaveBeenCalled();
        await openSection();
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    test('ignores the end of a preview that was already turned off', async () => {
        renderComponent();
        await openSection();
        await screen.findByText('Built-in Camera');
        const track = await turnOnCamera();
        await userEvent.click(screen.getByRole('button', {name: 'Turn off camera'}));

        act(() => track.fire(TrackEvent.Ended));

        expect(screen.queryByText('Camera disconnected.')).not.toBeInTheDocument();
        expect(track.stop).toHaveBeenCalledTimes(1);
    });

    test('mirrors only the preview when Mirror video is checked', async () => {
        renderComponent();
        await openSection();
        await screen.findByText('Built-in Camera');
        await turnOnCamera();
        expect(getVideo()).not.toHaveClass(MIRRORED_CLASS);

        await userEvent.click(screen.getByLabelText('Mirror video'));
        expect(getVideo()).toHaveClass(MIRRORED_CLASS);

        await userEvent.click(screen.getByLabelText('Mirror video'));
        expect(getVideo()).not.toHaveClass(MIRRORED_CLASS);
    });

    test('starts mirrored when mirroring was saved', async () => {
        window.localStorage.setItem(STORAGE_CALLS_MIRROR_VIDEO, 'on');
        renderComponent();
        await openSection();
        await screen.findByText('Built-in Camera');

        await turnOnCamera();

        expect(getVideo()).toHaveClass(MIRRORED_CLASS);
    });

    describe('errors', () => {
        const expectLinkedMessage = (message: string) => {
            const messages = document.getElementById(MESSAGES_ID);
            expect(messages).toHaveAttribute('role', 'alert');
            expect(messages).toHaveTextContent(message);
            const select = screen.getByLabelText('Camera input');
            expect(select).toHaveAttribute('aria-invalid', 'true');
            expect(select).toHaveAttribute('aria-errormessage', MESSAGES_ID);
        };

        test.each([
            ['NotAllowedError', 'Camera access was blocked. Allow it in your browser settings.'],
            ['NotFoundError', 'No camera found.'],
            ['NotReadableError', 'Your camera is being used by another app. Close that app and try again.'],
            ['OverconstrainedError', 'Couldn\'t start your camera. Try again.'],
        ])('shows a linked message when the camera fails to start with %s', async (errorName, message) => {
            createTrack.mockRejectedValueOnce(new DOMException('failed', errorName));
            renderComponent();
            await openSection();
            await screen.findByText('Built-in Camera');

            await userEvent.click(screen.getByRole('button', {name: 'Turn on camera'}));

            expect(await screen.findByText(message)).toBeInTheDocument();
            expectLinkedMessage(message);
            expect(screen.getByRole('button', {name: 'Turn on camera'})).toBeInTheDocument();
            expect(logErr).toHaveBeenCalledWith('failed to start camera preview', expect.any(DOMException));
        });

        test('shows the generic message for a failure LiveKit cannot classify', async () => {
            createTrack.mockRejectedValueOnce({});
            renderComponent();
            await openSection();
            await screen.findByText('Built-in Camera');

            await userEvent.click(screen.getByRole('button', {name: 'Turn on camera'}));

            expect(await screen.findByText('Couldn\'t start your camera. Try again.')).toBeInTheDocument();
        });

        test('shows a linked message and announces off when the camera is unplugged', async () => {
            renderComponent();
            await openSection();
            await screen.findByText('Built-in Camera');
            const track = await turnOnCamera();

            act(() => track.fire(TrackEvent.Ended));

            expect(await screen.findByText('Camera disconnected.')).toBeInTheDocument();
            expectLinkedMessage('Camera disconnected.');
            expect(track.stop).toHaveBeenCalledTimes(1);
            expect(getLiveRegion()).toHaveTextContent('Camera off');
        });

        test('shows a linked message and stops the preview when switching cameras fails', async () => {
            renderComponent();
            await openSection();
            await screen.findByText('Built-in Camera');
            const track = await turnOnCamera();
            track.restartTrack.mockRejectedValueOnce(new DOMException('busy', 'NotReadableError'));

            await userEvent.click(screen.getByLabelText('Camera input'));
            await userEvent.click(screen.getByText('USB Camera'));

            const message = 'Your camera is being used by another app. Close that app and try again.';
            expect(await screen.findByText(message)).toBeInTheDocument();
            expectLinkedMessage(message);
            expect(track.stop).toHaveBeenCalledTimes(1);
            expect(getLiveRegion()).toHaveTextContent('Camera off');
        });

        test('ignores a camera switch that fails after the preview was turned off', async () => {
            renderComponent();
            await openSection();
            await screen.findByText('Built-in Camera');
            const track = await turnOnCamera();
            let rejectRestart: (err: unknown) => void = () => {};
            track.restartTrack.mockImplementationOnce(() => new Promise((_, reject) => {
                rejectRestart = reject;
            }));
            await userEvent.click(screen.getByLabelText('Camera input'));
            await userEvent.click(screen.getByText('USB Camera'));

            await userEvent.click(screen.getByRole('button', {name: 'Turn off camera'}));
            await act(async () => rejectRestart(new DOMException('busy', 'NotReadableError')));

            expect(screen.queryByRole('alert')).not.toBeInTheDocument();
            expect(logErr).not.toHaveBeenCalled();
            expect(track.stop).toHaveBeenCalledTimes(1);
        });

        test('shows a linked message when cameras cannot be listed', async () => {
            const err = new DOMException('failed', 'NotAllowedError');
            getLocalVideoDevices.mockRejectedValue(err);
            renderComponent();
            await openSection();

            expect(await screen.findByText(LOAD_ERROR_MESSAGE)).toBeInTheDocument();
            expectLinkedMessage(LOAD_ERROR_MESSAGE);
            expect(logErr).toHaveBeenCalledWith('failed to get video devices', err);
        });

        test('clears the message when the camera starts on retry', async () => {
            createTrack.mockRejectedValueOnce(new DOMException('failed', 'NotReadableError'));
            renderComponent();
            await openSection();
            await screen.findByText('Built-in Camera');
            await userEvent.click(screen.getByRole('button', {name: 'Turn on camera'}));
            await screen.findByRole('alert');

            await turnOnCamera();

            expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        });
    });

    test('updates the list when a camera is plugged in', async () => {
        getLocalVideoDevices.mockResolvedValue([builtIn]);
        renderComponent();
        await openSection();
        await screen.findByText('Built-in Camera');

        getLocalVideoDevices.mockResolvedValue([builtIn, usb]);
        await act(async () => {
            mediaDevices.dispatchEvent(new Event('devicechange'));
        });
        await userEvent.click(screen.getByLabelText('Camera input'));

        expect(screen.getByText('USB Camera')).toBeInTheDocument();
    });

    test('keeps the newest list when an older device load finishes last', async () => {
        renderComponent();
        await openSection();
        await screen.findByText('Built-in Camera');

        let resolveOlder: (devices: MediaDeviceInfo[]) => void = () => {};
        getLocalVideoDevices.mockImplementationOnce(() => new Promise((resolve) => {
            resolveOlder = resolve;
        }));
        getLocalVideoDevices.mockResolvedValueOnce([builtIn]);
        await act(async () => {
            mediaDevices.dispatchEvent(new Event('devicechange'));
            mediaDevices.dispatchEvent(new Event('devicechange'));
        });
        await act(async () => resolveOlder([builtIn, usb]));
        await userEvent.click(screen.getByLabelText('Camera input'));

        expect(screen.queryByText('USB Camera')).not.toBeInTheDocument();
    });
});
