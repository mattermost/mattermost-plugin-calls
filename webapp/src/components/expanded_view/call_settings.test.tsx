// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import {IntlProvider} from 'react-intl';
import {Provider} from 'react-redux';
import {FakeCallClient, installFakeCallClient} from 'src/test_utils/fake_call_client';
import {mockStore} from 'src/testUtils';

import {CallSettings} from './call_settings';

jest.mock('src/selectors', () => ({
    ...jest.requireActual('src/selectors'),
    areLiveCaptionsAvailableInCurrentCall: () => false,
}));

const makeDevice = (deviceId: string, label: string, kind: MediaDeviceKind) => ({deviceId, label, kind, groupId: ''}) as MediaDeviceInfo;

const builtInMic = makeDevice('mic-1', 'Built-in Mic', 'audioinput');
const usbMic = makeDevice('mic-2', 'USB Mic', 'audioinput');
const speaker = makeDevice('speaker-1', 'Speakers', 'audiooutput');

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
});
