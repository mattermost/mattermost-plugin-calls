// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {act, render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import {IntlProvider} from 'react-intl';
import CallClient from 'src/clients/call';
import {STORAGE_CALLS_DEFAULT_AUDIO_INPUT_KEY, STORAGE_CALLS_DEFAULT_AUDIO_OUTPUT_KEY} from 'src/constants';
import {logErr} from 'src/log';

import AudioDevicesSettingsSection from './audio_devices_settings_section';

jest.mock('src/clients/call', () => ({
    __esModule: true,
    default: {getLocalAudioDevices: jest.fn()},
}));

jest.mock('src/log', () => ({
    logErr: jest.fn(),
}));

const LOAD_ERROR_MESSAGE = 'Unable to load audio devices. Make sure a microphone is connected and that Mattermost is allowed to use it.';

const makeDevice = (kind: MediaDeviceKind, deviceId: string, label: string) => ({deviceId, label, kind, groupId: ''}) as MediaDeviceInfo;

const mic = makeDevice('audioinput', 'mic-id', 'Built-in Microphone');
const headsetMic = makeDevice('audioinput', 'headset-mic-id', 'Headset Microphone');
const speakers = makeDevice('audiooutput', 'speakers-id', 'Built-in Speakers');
const headphones = makeDevice('audiooutput', 'headphones-id', 'Headphones');

describe('AudioDevicesSettingsSection', () => {
    const getLocalAudioDevices = CallClient.getLocalAudioDevices as jest.Mock;
    let mediaDevices: EventTarget & {getUserMedia: jest.Mock; enumerateDevices: jest.Mock};

    const mockDevices = (devices: MediaDeviceInfo[]) => {
        getLocalAudioDevices.mockImplementation(async () => ({
            inputs: devices.filter((d) => d.kind === 'audioinput'),
            outputs: devices.filter((d) => d.kind === 'audiooutput'),
        }));
    };

    const renderComponent = () => render(
        <IntlProvider locale='en'>
            <AudioDevicesSettingsSection/>
        </IntlProvider>,
    );

    const openSection = async () => {
        await userEvent.click(screen.getByText('Edit'));
    };

    const fireDeviceChange = async () => {
        await act(async () => {
            mediaDevices.dispatchEvent(new Event('devicechange'));
        });
    };

    beforeEach(() => {
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
        window.localStorage.removeItem(STORAGE_CALLS_DEFAULT_AUDIO_INPUT_KEY);
        window.localStorage.removeItem(STORAGE_CALLS_DEFAULT_AUDIO_OUTPUT_KEY);
    });

    it('does not load devices while collapsed', () => {
        mockDevices([mic, speakers]);
        renderComponent();

        expect(screen.getByText('Audio devices')).toBeInTheDocument();
        expect(getLocalAudioDevices).not.toHaveBeenCalled();
    });

    it('loads devices through the call client instead of the browser API', async () => {
        mockDevices([mic, speakers]);
        renderComponent();
        await openSection();

        expect(await screen.findByText('Built-in Microphone')).toBeInTheDocument();
        expect(getLocalAudioDevices).toHaveBeenCalledTimes(1);
        expect(mediaDevices.getUserMedia).not.toHaveBeenCalled();
        expect(mediaDevices.enumerateDevices).not.toHaveBeenCalled();
    });

    it('shows device names and preselects the saved devices', async () => {
        window.localStorage.setItem(STORAGE_CALLS_DEFAULT_AUDIO_OUTPUT_KEY, JSON.stringify({
            deviceId: headphones.deviceId,
            label: headphones.label,
        }));
        mockDevices([mic, headsetMic, speakers, headphones]);
        renderComponent();
        await openSection();

        expect(await screen.findByText('Built-in Microphone')).toBeInTheDocument();
        expect(screen.getByText('Headphones')).toBeInTheDocument();
        expect(screen.queryByText('Built-in Speakers')).not.toBeInTheDocument();
        expect(screen.queryByText(LOAD_ERROR_MESSAGE)).not.toBeInTheDocument();

        await userEvent.click(screen.getByLabelText('Microphone input'));
        expect(screen.getByText('Headset Microphone')).toBeInTheDocument();
    });

    it('updates the lists when a device is plugged in or unplugged', async () => {
        window.localStorage.setItem(STORAGE_CALLS_DEFAULT_AUDIO_INPUT_KEY, JSON.stringify({
            deviceId: headsetMic.deviceId,
            label: headsetMic.label,
        }));
        mockDevices([mic, speakers]);
        renderComponent();
        await openSection();
        expect(await screen.findByText('Built-in Microphone')).toBeInTheDocument();

        mockDevices([mic, headsetMic, speakers]);
        await fireDeviceChange();
        expect(await screen.findByText('Headset Microphone')).toBeInTheDocument();
        expect(screen.queryByText('Built-in Microphone')).not.toBeInTheDocument();

        mockDevices([mic, speakers]);
        await fireDeviceChange();
        expect(await screen.findByText('Built-in Microphone')).toBeInTheDocument();
        expect(screen.queryByText('Headset Microphone')).not.toBeInTheDocument();
    });

    it('stops listening for device changes on cancel', async () => {
        mockDevices([mic, speakers]);
        renderComponent();
        await openSection();
        await screen.findByText('Built-in Microphone');

        await userEvent.click(screen.getByText('Cancel'));
        getLocalAudioDevices.mockClear();
        await fireDeviceChange();

        expect(getLocalAudioDevices).not.toHaveBeenCalled();
    });

    it.each(['NotAllowedError', 'NotFoundError'])('shows a message when devices cannot be loaded (%s)', async (errorName) => {
        const err = new DOMException('failed', errorName);
        getLocalAudioDevices.mockRejectedValue(err);
        renderComponent();
        await openSection();

        expect(await screen.findByText(LOAD_ERROR_MESSAGE)).toBeInTheDocument();
        expect(logErr).toHaveBeenCalledWith('failed to get audio devices', err);
        expect(getLocalAudioDevices).toHaveBeenCalledTimes(1);
        expect(screen.getByText('Save')).toBeInTheDocument();
    });

    it('empties the lists while loading fails and hides the message once devices load', async () => {
        mockDevices([mic, speakers]);
        renderComponent();
        await openSection();
        expect(await screen.findByText('Built-in Microphone')).toBeInTheDocument();

        getLocalAudioDevices.mockRejectedValue(new DOMException('failed', 'NotFoundError'));
        await fireDeviceChange();
        expect(await screen.findByText(LOAD_ERROR_MESSAGE)).toBeInTheDocument();
        expect(screen.queryByText('Built-in Microphone')).not.toBeInTheDocument();
        expect(screen.queryByText('Built-in Speakers')).not.toBeInTheDocument();

        mockDevices([mic, speakers]);
        await fireDeviceChange();
        expect(await screen.findByText('Built-in Microphone')).toBeInTheDocument();
        expect(screen.queryByText(LOAD_ERROR_MESSAGE)).not.toBeInTheDocument();
    });

    it('ignores an older load that fails after a newer one succeeds', async () => {
        let rejectFirstLoad: (err: Error) => void = () => {};
        getLocalAudioDevices.mockImplementationOnce(() => new Promise((_, reject) => {
            rejectFirstLoad = reject;
        }));
        mockDevices([mic, speakers]);
        renderComponent();
        await openSection();

        await fireDeviceChange();
        expect(await screen.findByText('Built-in Microphone')).toBeInTheDocument();

        await act(async () => rejectFirstLoad(new DOMException('failed', 'NotAllowedError')));

        expect(screen.getByText('Built-in Microphone')).toBeInTheDocument();
        expect(screen.queryByText(LOAD_ERROR_MESSAGE)).not.toBeInTheDocument();
    });

    it('keeps the saved devices when saving after a failed load', async () => {
        const savedInput = JSON.stringify({deviceId: headsetMic.deviceId, label: headsetMic.label});
        const savedOutput = JSON.stringify({deviceId: headphones.deviceId, label: headphones.label});
        window.localStorage.setItem(STORAGE_CALLS_DEFAULT_AUDIO_INPUT_KEY, savedInput);
        window.localStorage.setItem(STORAGE_CALLS_DEFAULT_AUDIO_OUTPUT_KEY, savedOutput);
        getLocalAudioDevices.mockRejectedValue(new DOMException('failed', 'NotAllowedError'));
        renderComponent();
        await openSection();
        expect(await screen.findByText(LOAD_ERROR_MESSAGE)).toBeInTheDocument();

        await userEvent.click(screen.getByText('Save'));

        expect(window.localStorage.getItem(STORAGE_CALLS_DEFAULT_AUDIO_INPUT_KEY)).toBe(savedInput);
        expect(window.localStorage.getItem(STORAGE_CALLS_DEFAULT_AUDIO_OUTPUT_KEY)).toBe(savedOutput);
    });

    it('saves the selected devices on save', async () => {
        mockDevices([mic, headsetMic, speakers, headphones]);
        renderComponent();
        await openSection();
        await screen.findByText('Built-in Microphone');

        await userEvent.click(screen.getByLabelText('Microphone input'));
        await userEvent.click(screen.getByText('Headset Microphone'));
        await userEvent.click(screen.getByText('Save'));

        expect(JSON.parse(window.localStorage.getItem(STORAGE_CALLS_DEFAULT_AUDIO_INPUT_KEY) ?? '')).toEqual({
            deviceId: headsetMic.deviceId,
            label: headsetMic.label,
        });
        expect(JSON.parse(window.localStorage.getItem(STORAGE_CALLS_DEFAULT_AUDIO_OUTPUT_KEY) ?? '')).toEqual({
            deviceId: speakers.deviceId,
            label: speakers.label,
        });
    });
});
