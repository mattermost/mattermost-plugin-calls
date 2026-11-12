// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {act, render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {Room} from 'livekit-client';
import React from 'react';
import {IntlProvider} from 'react-intl';
import {STORAGE_CALLS_DEFAULT_AUDIO_INPUT_KEY, STORAGE_CALLS_DEFAULT_AUDIO_OUTPUT_KEY} from 'src/constants';
import {logErr} from 'src/log';

import AudioDevicesSettingsSection from './audio_devices_settings_section';

jest.mock('livekit-client', () => ({
    Room: {getLocalDevices: jest.fn()},
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
    const getLocalDevices = Room.getLocalDevices as jest.Mock;
    let mediaDevices: EventTarget & {getUserMedia: jest.Mock; enumerateDevices: jest.Mock};

    const mockDevices = (devices: MediaDeviceInfo[]) => {
        getLocalDevices.mockImplementation(async (kind: MediaDeviceKind) => devices.filter((d) => d.kind === kind));
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
        expect(getLocalDevices).not.toHaveBeenCalled();
    });

    it('loads inputs, then outputs, through Room.getLocalDevices', async () => {
        let resolveInputs: (devices: MediaDeviceInfo[]) => void;
        getLocalDevices.mockImplementation((kind: MediaDeviceKind) => {
            if (kind === 'audioinput') {
                return new Promise((resolve) => {
                    resolveInputs = resolve;
                });
            }
            return Promise.resolve([speakers]);
        });
        renderComponent();
        await openSection();

        expect(getLocalDevices).toHaveBeenCalledTimes(1);
        expect(getLocalDevices).toHaveBeenCalledWith('audioinput');

        await act(async () => resolveInputs([mic]));

        expect(getLocalDevices).toHaveBeenCalledTimes(2);
        expect(getLocalDevices).toHaveBeenLastCalledWith('audiooutput');
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
        getLocalDevices.mockClear();
        await fireDeviceChange();

        expect(getLocalDevices).not.toHaveBeenCalled();
    });

    it.each(['NotAllowedError', 'NotFoundError'])('shows a message when devices cannot be loaded (%s)', async (errorName) => {
        const err = new DOMException('failed', errorName);
        getLocalDevices.mockRejectedValue(err);
        renderComponent();
        await openSection();

        expect(await screen.findByText(LOAD_ERROR_MESSAGE)).toBeInTheDocument();
        expect(logErr).toHaveBeenCalledWith('failed to get audio devices', err);
        expect(getLocalDevices).toHaveBeenCalledTimes(1);
        expect(screen.getByText('Save')).toBeInTheDocument();
    });

    it('empties the lists while loading fails and hides the message once devices load', async () => {
        mockDevices([mic, speakers]);
        renderComponent();
        await openSection();
        expect(await screen.findByText('Built-in Microphone')).toBeInTheDocument();

        getLocalDevices.mockRejectedValue(new DOMException('failed', 'NotFoundError'));
        await fireDeviceChange();
        expect(await screen.findByText(LOAD_ERROR_MESSAGE)).toBeInTheDocument();
        expect(screen.queryByText('Built-in Microphone')).not.toBeInTheDocument();
        expect(screen.queryByText('Built-in Speakers')).not.toBeInTheDocument();

        mockDevices([mic, speakers]);
        await fireDeviceChange();
        expect(await screen.findByText('Built-in Microphone')).toBeInTheDocument();
        expect(screen.queryByText(LOAD_ERROR_MESSAGE)).not.toBeInTheDocument();
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
