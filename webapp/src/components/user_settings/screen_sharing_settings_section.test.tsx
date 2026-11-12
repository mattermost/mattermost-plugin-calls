// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import {IntlProvider} from 'react-intl';
import {STORAGE_CALLS_SHARE_AUDIO_WITH_SCREEN} from 'src/constants';

import ScreenSharingSettingsSection from './screen_sharing_settings_section';

describe('ScreenSharingSettingsSection', () => {
    const renderComponent = () => render(
        <IntlProvider locale='en'>
            <ScreenSharingSettingsSection/>
        </IntlProvider>,
    );

    afterEach(() => {
        window.localStorage.removeItem(STORAGE_CALLS_SHARE_AUDIO_WITH_SCREEN);
    });

    it('defaults to on when nothing is stored', async () => {
        renderComponent();
        await userEvent.click(screen.getByText('Edit'));

        expect(screen.getByText('Share sound with screen')).toBeInTheDocument();
        expect(screen.getByLabelText('On')).toBeChecked();
    });

    it('saves only on save and discards on cancel', async () => {
        renderComponent();
        await userEvent.click(screen.getByText('Edit'));

        await userEvent.click(screen.getByLabelText('Off'));
        await userEvent.click(screen.getByText('Cancel'));
        expect(window.localStorage.getItem(STORAGE_CALLS_SHARE_AUDIO_WITH_SCREEN)).toBeNull();

        await userEvent.click(screen.getByText('Edit'));
        await userEvent.click(screen.getByLabelText('Off'));
        await userEvent.click(screen.getByText('Save'));
        expect(window.localStorage.getItem(STORAGE_CALLS_SHARE_AUDIO_WITH_SCREEN)).toBe('off');
    });
});
