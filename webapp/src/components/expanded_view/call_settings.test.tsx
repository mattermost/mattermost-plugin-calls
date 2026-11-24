// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import {IntlProvider} from 'react-intl';
import {Provider} from 'react-redux';
import {FakeCallClient, installFakeCallClient} from 'src/test_utils/fake_call_client';
import {mockStore} from 'src/testUtils';

import {CallSettings, CallSettingsButton, RecordMenuItem} from './call_settings';

jest.mock('src/selectors', () => ({
    ...jest.requireActual('src/selectors'),
    areLiveCaptionsAvailableInCurrentCall: () => false,
}));

const makeDevice = (deviceId: string, label: string, kind: MediaDeviceKind) => ({deviceId, label, kind, groupId: ''}) as MediaDeviceInfo;

const builtInMic = makeDevice('mic-1', 'Built-in Mic', 'audioinput');
const usbMic = makeDevice('mic-2', 'USB Mic', 'audioinput');
const speaker = makeDevice('speaker-1', 'Speakers', 'audiooutput');
const headphones = makeDevice('speaker-2', 'Headphones', 'audiooutput');

describe('CallSettings device lists', () => {
    let client: FakeCallClient;

    beforeEach(() => {
        client = installFakeCallClient();
        client.currentAudioInputDevice = builtInMic;
        client.currentAudioOutputDevice = speaker;
        client.audioDevices = {inputs: [builtInMic, usbMic], outputs: [speaker]};
        window.WebappUtils = {} as typeof window.WebappUtils;
    });

    afterEach(() => {
        window.callsClient = undefined;
    });

    const renderSettings = () => render(
        <Provider store={mockStore()}>
            <IntlProvider locale='en'>
                <CallSettings
                    onLiveCaptionsToggle={jest.fn()}
                    showLiveCaptions={false}
                />
            </IntlProvider>
        </Provider>,
    );

    test('opens the mic list with the current mic ticked and focused', async () => {
        renderSettings();

        await userEvent.click(document.getElementById('calls-popout-audioinput-button')!);

        const menu = screen.getByRole('menu', {name: 'Microphone'});
        expect(menu).toHaveAttribute('id', 'calls-popout-audioinputs-menu');
        expect(screen.getByRole('menuitemradio', {name: builtInMic.label})).toHaveAttribute('aria-checked', 'true');
        expect(screen.getByRole('menuitemradio', {name: builtInMic.label})).toHaveFocus();
    });

    test('picking a mic switches to it, closes the list and returns focus', async () => {
        renderSettings();
        await userEvent.click(document.getElementById('calls-popout-audioinput-button')!);

        await userEvent.click(screen.getByRole('menuitemradio', {name: usbMic.label}));

        expect(client.setAudioInputDevice).toHaveBeenCalledWith(usbMic);
        expect(screen.queryByRole('menu', {name: 'Microphone'})).not.toBeInTheDocument();
        expect(document.getElementById('calls-popout-audioinput-button')).toHaveFocus();
    });

    test('arrow keys move through the speaker list', async () => {
        renderSettings();
        await userEvent.click(document.getElementById('calls-popout-audiooutput-button')!);

        expect(screen.getByRole('menu', {name: 'Audio output'})).toHaveAttribute('id', 'calls-popout-audiooutputs-menu');
        await userEvent.keyboard('{ArrowDown}');
        expect(screen.getByRole('menuitemradio', {name: speaker.label})).toHaveFocus();
    });

    test('picking a speaker switches to it and closes the list', async () => {
        client.audioDevices = {inputs: [builtInMic], outputs: [speaker, headphones]};
        renderSettings();
        await userEvent.click(document.getElementById('calls-popout-audiooutput-button')!);

        await userEvent.click(screen.getByRole('menuitemradio', {name: headphones.label}));

        expect(client.setAudioOutputDevice).toHaveBeenCalledWith(headphones);
        expect(screen.queryByRole('menu', {name: 'Audio output'})).not.toBeInTheDocument();
        expect(document.getElementById('calls-popout-audiooutput-button')).toHaveTextContent(headphones.label);
    });

    test('Tab closes the list without moving focus back to its button', async () => {
        renderSettings();
        await userEvent.click(document.getElementById('calls-popout-audioinput-button')!);

        await userEvent.keyboard('{Tab}');

        expect(screen.queryByRole('menu', {name: 'Microphone'})).not.toBeInTheDocument();
        expect(document.getElementById('calls-popout-audioinput-button')).not.toHaveFocus();
    });

    test('disables a device type whose devices have no labels yet', () => {
        client.currentAudioInputDevice = null;
        client.audioDevices = {inputs: [makeDevice('', '', 'audioinput')], outputs: [speaker]};
        renderSettings();

        const button = document.getElementById('calls-popout-audioinput-button')!;
        expect(button).toBeDisabled();
        expect(button).toHaveTextContent('Default');
        expect(document.getElementById('calls-popout-audiooutput-button')).toBeEnabled();
    });
});

describe('CallSettings record item', () => {
    beforeEach(() => {
        installFakeCallClient();
        window.WebappUtils = {} as typeof window.WebappUtils;
    });

    afterEach(() => {
        window.callsClient = undefined;
    });

    const makeRecordItem = (item: Partial<RecordMenuItem> = {}): RecordMenuItem => ({
        isRecording: false,
        disabled: false,
        onToggle: jest.fn(),
        ...item,
    });

    const wrap = (children: React.ReactNode) => (
        <Provider store={mockStore()}>
            <IntlProvider locale='en'>
                {children}
            </IntlProvider>
        </Provider>
    );

    const renderSettings = (recordItem?: RecordMenuItem) => render(wrap(
        <CallSettings
            onLiveCaptionsToggle={jest.fn()}
            showLiveCaptions={false}
            recordItem={recordItem}
        />,
    ));

    const recordButton = () => document.getElementById('calls-popout-record-button');

    test('has no record item unless one is passed', () => {
        renderSettings();

        expect(recordButton()).not.toBeInTheDocument();
    });

    test.each([
        [false, 'Record call'],
        [true, 'Stop recording'],
    ])('with isRecording %s, labels the item %s', (isRecording, label) => {
        renderSettings(makeRecordItem({isRecording}));

        expect(screen.getByRole('menuitem', {name: label})).toContainElement(recordButton());
        expect(recordButton()).toHaveTextContent(label);
    });

    test('calls onToggle when clicked', async () => {
        const item = makeRecordItem();
        renderSettings(item);

        await userEvent.click(recordButton()!);

        expect(item.onToggle).toHaveBeenCalledTimes(1);
    });

    test('is disabled while recording can\'t be toggled', async () => {
        const item = makeRecordItem({disabled: true});
        renderSettings(item);

        expect(recordButton()).toBeDisabled();
        await userEvent.click(recordButton()!);
        expect(item.onToggle).not.toHaveBeenCalled();
    });

    test('the More button closes its menu before toggling recording', async () => {
        const item = makeRecordItem();
        render(wrap(
            <CallSettingsButton
                onLiveCaptionsToggle={jest.fn()}
                showLiveCaptions={false}
                recordItem={item}
            />,
        ));

        await userEvent.click(document.getElementById('calls-popout-settings-button')!);
        expect(document.getElementById('calls-popout-settings-menu')).toBeInTheDocument();

        await userEvent.click(recordButton()!);

        expect(item.onToggle).toHaveBeenCalledTimes(1);
        expect(document.getElementById('calls-popout-settings-menu')).not.toBeInTheDocument();
    });
});
