// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {act, fireEvent, render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {createLocalVideoTrack, MediaDeviceFailure, TrackEvent} from 'livekit-client';
import React from 'react';
import {IntlProvider} from 'react-intl';
import {Provider} from 'react-redux';
import ReactSelect from 'react-select';
import CallClient from 'src/clients/call';
import {CAMERA_CAPTURE_DEFAULTS} from 'src/clients/call/constants';
import {CameraState} from 'src/clients/call/types';
import {STORAGE_CALLS_DEFAULT_VIDEO_INPUT_KEY, STORAGE_CALLS_MIRROR_VIDEO} from 'src/constants';
import {logErr, logWarn} from 'src/log';
import {type FakeCallClient, installFakeCallClient} from 'src/test_utils/fake_call_client';
import {mockStore} from 'src/testUtils';

import VideoDevicesSettingsSection from './video_devices_settings_section';

jest.mock('livekit-client', () => ({
    ...jest.requireActual('livekit-client'),
    createLocalVideoTrack: jest.fn(),
}));

jest.mock('src/clients/call', () => ({
    __esModule: true,
    default: {getLocalVideoDevices: jest.fn()},
    CALL_EVENT: jest.requireActual('src/clients/call/constants').CALL_EVENT,
    CameraError: jest.requireActual('src/clients/call/types').CameraError,
    CameraState: jest.requireActual('src/clients/call/types').CameraState,
    toCameraError: jest.requireActual('src/clients/call/call_client').toCameraError,
}));

jest.mock('src/log', () => ({
    logErr: jest.fn(),
    logWarn: jest.fn(),
}));

// Wraps the real select so tests can send changes the UI can't produce.
jest.mock('react-select', () => {
    const actual = jest.requireActual('react-select');
    const {createElement} = jest.requireActual('react');
    return {
        ...actual,
        __esModule: true,
        default: jest.fn((props) => createElement(actual.default, props)),
    };
});

const MESSAGES_ID = 'videoInputMessages';
const LOAD_ERROR_MESSAGE = 'Unable to load video devices. Make sure a camera is connected and that Mattermost is allowed to use it.';
const MIRRORED_CLASS = 'VideoDevicesSettings__video--mirrored';
const DESCRIPTION = 'Set up video devices to be used for Mattermost calls.';
const SESSION_ID = 'session-id';

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
        window.callsClient = undefined;
        jest.clearAllMocks();
    });

    test('does not load devices while collapsed', () => {
        renderComponent();

        expect(screen.getByRole('heading', {name: 'Video devices'})).toBeInTheDocument();
        expect(screen.getByText(DESCRIPTION)).toBeInTheDocument();
        expect(getLocalVideoDevices).not.toHaveBeenCalled();
    });

    test('names Edit after the section and keeps it on the right of the title', () => {
        renderComponent();

        const edit = screen.getByRole('button', {name: 'Video devices Edit'});
        expect(edit.parentElement).toHaveClass('section-min__header');
    });

    test.each(['Save', 'Cancel'])('returns focus to Edit after %s', async (action) => {
        renderComponent();
        await openSection();
        await screen.findByText('Built-in Camera');

        await userEvent.click(screen.getByText(action));

        expect(screen.getByRole('button', {name: 'Video devices Edit'})).toHaveFocus();
    });

    test('lays out Camera input, Preview and Options in the label column', async () => {
        renderComponent();
        await openSection();
        await screen.findByText('Built-in Camera');

        for (const label of ['Camera input', 'Preview', 'Options']) {
            expect(screen.getByText(label)).toHaveClass('CallsSettingsSection__label');
        }
        expect(screen.getByLabelText('Camera input')).toHaveAttribute('id', 'videoInputSelect');
        expect(screen.getByRole('group', {name: 'Camera preview'})).toHaveClass('VideoDevicesSettings__preview');
        expect(screen.getByRole('group', {name: 'Options'})).toContainElement(screen.getByRole('checkbox', {name: 'Mirror my video'}));
    });

    test('mirrors by default and explains, once and under the checkbox, that it is saved on this device', async () => {
        renderComponent();
        await openSection();
        await screen.findByText('Built-in Camera');

        const note = 'Only you see it mirrored. Saved on this device only.';
        const mirror = screen.getByRole('checkbox', {name: 'Mirror my video'});
        expect(mirror).toBeChecked();
        expect(mirror).toHaveAccessibleDescription(note);
        expect(screen.getByText(note)).toHaveClass('help-text', 'VideoDevicesSettings__mirrorNote');
        expect(screen.getAllByText(/Saved on this device only/)).toHaveLength(1);
        expect(document.getElementById('videoInputSelect')).not.toHaveAttribute('aria-describedby', expect.stringContaining('videoInputHelp'));
    });

    test('shows the section description only while collapsed', async () => {
        renderComponent();
        expect(screen.getByText(DESCRIPTION)).toBeInTheDocument();

        await openSection();
        await screen.findByText('Built-in Camera');

        expect(screen.queryByText(DESCRIPTION)).not.toBeInTheDocument();
    });

    test('picking a camera while the preview is off does not start it', async () => {
        renderComponent();
        await openSection();
        await screen.findByText('Built-in Camera');

        await userEvent.click(screen.getByLabelText('Camera input'));
        await userEvent.click(screen.getByText('USB Camera'));

        expect(createTrack).not.toHaveBeenCalled();
        expect(getVideo()).toBeNull();
        expect(screen.getByRole('button', {name: 'Turn on camera'})).toBeInTheDocument();
    });

    test('mirroring changes the preview before Save', async () => {
        window.localStorage.setItem(STORAGE_CALLS_MIRROR_VIDEO, 'off');
        renderComponent();
        await openSection();
        await screen.findByText('Built-in Camera');
        await turnOnCamera();

        await userEvent.click(screen.getByLabelText('Mirror my video'));

        expect(getVideo()).toHaveClass(MIRRORED_CLASS);
        expect(window.localStorage.getItem(STORAGE_CALLS_MIRROR_VIDEO)).toBe('off');
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

    test('ignores an empty camera selection', async () => {
        renderComponent();
        await openSection();
        await screen.findByText('Built-in Camera');
        const track = await turnOnCamera();

        const {onChange} = (ReactSelect as unknown as jest.Mock).mock.lastCall[0];
        await act(() => onChange(null));

        expect(screen.getByText('Built-in Camera')).toBeInTheDocument();
        expect(track.restartTrack).not.toHaveBeenCalled();
        expect(track.stop).not.toHaveBeenCalled();
        expect(screen.getByRole('button', {name: 'Turn off camera'})).toBeInTheDocument();
    });

    test('keeps the camera on when frames resume after switching cameras', async () => {
        renderComponent();
        await openSection();
        await screen.findByText('Built-in Camera');
        await turnOnCamera();
        await userEvent.click(screen.getByLabelText('Camera input'));
        await userEvent.click(screen.getByText('USB Camera'));

        fireEvent.playing(getVideo());

        expect(screen.getByRole('button', {name: 'Turn off camera'})).toBeInTheDocument();
        expect(getVideo()).not.toHaveClass('VideoDevicesSettings__video--hidden');
        expect(screen.queryByAltText('alice profile image')).not.toBeInTheDocument();
        expect(getLiveRegion()).toHaveTextContent('Camera on');
    });

    test('saves the selected camera and the default mirror setting', async () => {
        renderComponent();
        await openSection();
        await screen.findByText('Built-in Camera');

        await userEvent.click(screen.getByLabelText('Camera input'));
        await userEvent.click(screen.getByText('USB Camera'));
        await userEvent.click(screen.getByText('Save'));

        expect(JSON.parse(window.localStorage.getItem(STORAGE_CALLS_DEFAULT_VIDEO_INPUT_KEY) ?? '')).toEqual({deviceId: 'cam-2', label: 'USB Camera'});
        expect(window.localStorage.getItem(STORAGE_CALLS_MIRROR_VIDEO)).toBe('on');
        expect(screen.getByText('Edit')).toBeInTheDocument();
    });

    test.each([
        ['off when it is unchecked', null, 'off'],
        ['on when it is checked again', 'off', 'on'],
    ])('saves mirror %s', async (_, stored, saved) => {
        if (stored) {
            window.localStorage.setItem(STORAGE_CALLS_MIRROR_VIDEO, stored);
        }
        renderComponent();
        await openSection();
        await screen.findByText('Built-in Camera');

        await userEvent.click(screen.getByLabelText('Mirror my video'));
        await userEvent.click(screen.getByText('Save'));

        expect(window.localStorage.getItem(STORAGE_CALLS_MIRROR_VIDEO)).toBe(saved);
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
        await userEvent.click(screen.getByLabelText('Mirror my video'));

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

    test('the preview follows the Mirror my video checkbox', async () => {
        renderComponent();
        await openSection();
        await screen.findByText('Built-in Camera');
        await turnOnCamera();
        expect(getVideo()).toHaveClass(MIRRORED_CLASS);

        await userEvent.click(screen.getByLabelText('Mirror my video'));
        expect(getVideo()).not.toHaveClass(MIRRORED_CLASS);

        await userEvent.click(screen.getByLabelText('Mirror my video'));
        expect(getVideo()).toHaveClass(MIRRORED_CLASS);
    });

    test.each([
        ['nothing is saved', null, true],
        ['mirroring was saved', 'on', true],
        ['mirroring was turned off', 'off', false],
    ])('starts mirrored=%s when %s', async (_, stored, mirrored) => {
        if (stored) {
            window.localStorage.setItem(STORAGE_CALLS_MIRROR_VIDEO, stored);
        }
        renderComponent();
        await openSection();
        await screen.findByText('Built-in Camera');

        await turnOnCamera();

        expect(getVideo()?.classList.contains(MIRRORED_CLASS)).toBe(mirrored);
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

        test('shows the generic message for a failure type newer than this client', async () => {
            const getFailure = jest.spyOn(MediaDeviceFailure, 'getFailure').mockReturnValue('FutureFailure' as MediaDeviceFailure);
            createTrack.mockRejectedValueOnce(new DOMException('failed', 'FutureError'));
            renderComponent();
            await openSection();
            await screen.findByText('Built-in Camera');

            await userEvent.click(screen.getByRole('button', {name: 'Turn on camera'}));

            expect(await screen.findByText('Couldn\'t start your camera. Try again.')).toBeInTheDocument();
            expectLinkedMessage('Couldn\'t start your camera. Try again.');
            expect(screen.queryByText('FutureFailure')).not.toBeInTheDocument();
            expect(logWarn).toHaveBeenCalledWith('CallClient: unknown media device failure', 'FutureFailure');
            getFailure.mockRestore();
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

    describe('in a call', () => {
        let client: FakeCallClient;

        const setCallCamera = (track: FakeTrack | null) => {
            act(() => client.setCamera(SESSION_ID, track ? {state: CameraState.Ready, track: track as never} : {state: CameraState.Off, track: null}));
        };

        // Shows the call's track, which the section must never capture again or stop.
        const turnOnCallPreview = async (callTrack: FakeTrack) => {
            await userEvent.click(screen.getByRole('button', {name: 'Turn on camera'}));
            expect(callTrack.attach).toHaveBeenCalledWith(getVideo());
            fireEvent.playing(getVideo());
            await screen.findByRole('button', {name: 'Turn off camera'});
        };

        const waitForAttach = (track: FakeTrack) => waitFor(() => expect(track.attach).toHaveBeenCalled());

        beforeEach(() => {
            client = installFakeCallClient();
        });

        test('does not start the preview until Turn on camera, even with the call camera on', async () => {
            const callTrack = makeTrack('cam-1');
            client.cameras.set(SESSION_ID, {state: CameraState.Ready, track: callTrack as never});
            renderComponent();
            await openSection();
            await screen.findByText('Built-in Camera');

            expect(getVideo()).toBeNull();
            expect(callTrack.attach).not.toHaveBeenCalled();
            expect(screen.getByRole('button', {name: 'Turn on camera'})).toBeInTheDocument();
        });

        test('preselects the camera the call is using', async () => {
            client.cameras.set(SESSION_ID, {state: CameraState.Ready, track: makeTrack('cam-2') as never});
            renderComponent();
            await openSection();

            expect(await screen.findByText('USB Camera')).toBeInTheDocument();
        });

        test.each(['Save', 'Cancel', 'Turn off camera'])('reuses the call camera instead of capturing it again, and leaves it running after %s', async (action) => {
            const callTrack = makeTrack('cam-1');
            client.cameras.set(SESSION_ID, {state: CameraState.Ready, track: callTrack as never});
            renderComponent();
            await openSection();
            await screen.findByText('Built-in Camera');

            await turnOnCallPreview(callTrack);
            await userEvent.click(screen.getByText(action));

            expect(createTrack).not.toHaveBeenCalled();
            expect(callTrack.stop).not.toHaveBeenCalled();
            expect(client.setVideoInputDevice).not.toHaveBeenCalled();
        });

        test('leaves the call camera running when the section unmounts', async () => {
            const callTrack = makeTrack('cam-1');
            client.cameras.set(SESSION_ID, {state: CameraState.Ready, track: callTrack as never});
            const {unmount} = renderComponent();
            await openSection();
            await screen.findByText('Built-in Camera');
            await turnOnCallPreview(callTrack);

            unmount();

            expect(callTrack.stop).not.toHaveBeenCalled();
        });

        test('previews another camera with its own capture, then hands it to the call on Save', async () => {
            const callTrack = makeTrack('cam-1');
            client.cameras.set(SESSION_ID, {state: CameraState.Ready, track: callTrack as never});
            renderComponent();
            await openSection();
            await screen.findByText('Built-in Camera');
            await turnOnCallPreview(callTrack);

            const ownTrack = makeTrack('cam-2');
            createTrack.mockResolvedValueOnce(ownTrack);
            await userEvent.click(screen.getByLabelText('Camera input'));
            await userEvent.click(screen.getByText('USB Camera'));

            expect(createTrack).toHaveBeenCalledWith(expectedCapture('cam-2'));
            expect(ownTrack.attach).toHaveBeenCalledWith(getVideo());

            await userEvent.click(screen.getByText('Save'));

            expect(client.setVideoInputDevice).toHaveBeenCalledWith(usb);
            expect(ownTrack.stop.mock.invocationCallOrder[0]).toBeLessThan(client.setVideoInputDevice.mock.invocationCallOrder[0]);
            expect(callTrack.stop).not.toHaveBeenCalled();
            expect(ownTrack.restartTrack).not.toHaveBeenCalled();
        });

        test('Cancel after previewing another camera leaves the call camera where it was', async () => {
            const callTrack = makeTrack('cam-1');
            client.cameras.set(SESSION_ID, {state: CameraState.Ready, track: callTrack as never});
            renderComponent();
            await openSection();
            await screen.findByText('Built-in Camera');
            await turnOnCallPreview(callTrack);
            const ownTrack = makeTrack('cam-2');
            createTrack.mockResolvedValueOnce(ownTrack);
            await userEvent.click(screen.getByLabelText('Camera input'));
            await userEvent.click(screen.getByText('USB Camera'));

            await userEvent.click(screen.getByText('Cancel'));

            expect(ownTrack.stop).toHaveBeenCalledTimes(1);
            expect(client.setVideoInputDevice).not.toHaveBeenCalled();
            expect(window.localStorage.getItem(STORAGE_CALLS_DEFAULT_VIDEO_INPUT_KEY)).toBeNull();
        });

        test('going back to the call camera releases the other capture', async () => {
            const callTrack = makeTrack('cam-1');
            client.cameras.set(SESSION_ID, {state: CameraState.Ready, track: callTrack as never});
            renderComponent();
            await openSection();
            await screen.findByText('Built-in Camera');
            await turnOnCallPreview(callTrack);
            const ownTrack = makeTrack('cam-2');
            createTrack.mockResolvedValueOnce(ownTrack);
            await userEvent.click(screen.getByLabelText('Camera input'));
            await userEvent.click(screen.getByText('USB Camera'));
            await waitForAttach(ownTrack);

            await userEvent.click(screen.getByLabelText('Camera input'));
            await userEvent.click(screen.getAllByText('Built-in Camera').at(-1) as HTMLElement);

            expect(ownTrack.stop).toHaveBeenCalledTimes(1);
            expect(callTrack.attach).toHaveBeenCalledTimes(2);
            expect(createTrack).toHaveBeenCalledTimes(1);
        });

        test('switches to the call track when the call camera turns on during the preview', async () => {
            renderComponent();
            await openSection();
            await screen.findByText('Built-in Camera');
            const ownTrack = await turnOnCamera(makeTrack('cam-1'));

            const callTrack = makeTrack('cam-1');
            setCallCamera(callTrack);

            expect(ownTrack.stop).toHaveBeenCalledTimes(1);
            expect(callTrack.attach).toHaveBeenCalledWith(getVideo());
            expect(screen.getByRole('button', {name: 'Turn off camera'})).toBeInTheDocument();

            await userEvent.click(screen.getByText('Cancel'));
            expect(callTrack.stop).not.toHaveBeenCalled();
        });

        test('stops the preview and announces it when the call camera turns off', async () => {
            const callTrack = makeTrack('cam-1');
            client.cameras.set(SESSION_ID, {state: CameraState.Ready, track: callTrack as never});
            renderComponent();
            await openSection();
            await screen.findByText('Built-in Camera');
            await turnOnCallPreview(callTrack);

            setCallCamera(null);

            expect(getVideo()).toBeNull();
            expect(screen.getByRole('button', {name: 'Turn on camera'})).toBeInTheDocument();
            expect(getLiveRegion()).toHaveTextContent('Camera off');
            expect(createTrack).not.toHaveBeenCalled();
            expect(callTrack.stop).not.toHaveBeenCalled();
        });

        test('with the call camera off, uses its own capture and saves without moving the call camera', async () => {
            renderComponent();
            await openSection();
            await screen.findByText('Built-in Camera');
            const ownTrack = await turnOnCamera(makeTrack('cam-1'));
            await userEvent.click(screen.getByLabelText('Camera input'));
            await userEvent.click(screen.getByText('USB Camera'));

            await userEvent.click(screen.getByText('Save'));

            expect(ownTrack.restartTrack).toHaveBeenCalledWith(expectedCapture('cam-2'));
            expect(ownTrack.stop).toHaveBeenCalledTimes(1);
            expect(client.setVideoInputDevice).not.toHaveBeenCalled();
            expect(JSON.parse(window.localStorage.getItem(STORAGE_CALLS_DEFAULT_VIDEO_INPUT_KEY) ?? '')).toEqual({deviceId: 'cam-2', label: 'USB Camera'});
        });
    });
});
