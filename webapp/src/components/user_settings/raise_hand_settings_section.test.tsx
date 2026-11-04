// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import {IntlProvider} from 'react-intl';
import {STORAGE_CALLS_LOWER_HAND_ON_UNMUTE} from 'src/constants';

import RaiseHandSettingsSection from './raise_hand_settings_section';

describe('RaiseHandSettingsSection', () => {
    const renderComponent = () => render(
        <IntlProvider locale='en'>
            <RaiseHandSettingsSection/>
        </IntlProvider>,
    );

    const openSection = async () => {
        await userEvent.click(screen.getByText('Edit'));
    };

    afterEach(() => {
        window.localStorage.removeItem(STORAGE_CALLS_LOWER_HAND_ON_UNMUTE);
    });

    it('renders collapsed by default', () => {
        renderComponent();

        expect(screen.getByText('Raise hand settings')).toBeInTheDocument();
        expect(screen.getByText('Configure your raise hand settings.')).toBeInTheDocument();
        expect(screen.queryByLabelText('On')).not.toBeInTheDocument();
    });

    it('defaults to off when nothing is stored', async () => {
        renderComponent();
        await openSection();

        expect(screen.getByText('Lower hand when I unmute for more than 3 seconds')).toBeInTheDocument();
        expect(screen.getByLabelText('On')).not.toBeChecked();
        expect(screen.getByLabelText('Off')).toBeChecked();
    });

    it('shows the stored value as selected', async () => {
        window.localStorage.setItem(STORAGE_CALLS_LOWER_HAND_ON_UNMUTE, 'on');
        renderComponent();
        await openSection();

        expect(screen.getByLabelText('On')).toBeChecked();
        expect(screen.getByLabelText('Off')).not.toBeChecked();
    });

    it('persists the selection to localStorage', async () => {
        renderComponent();
        await openSection();

        await userEvent.click(screen.getByLabelText('On'));
        expect(window.localStorage.getItem(STORAGE_CALLS_LOWER_HAND_ON_UNMUTE)).toBe('on');
        expect(screen.getByLabelText('On')).toBeChecked();

        await userEvent.click(screen.getByLabelText('Off'));
        expect(window.localStorage.getItem(STORAGE_CALLS_LOWER_HAND_ON_UNMUTE)).toBe('off');
        expect(screen.getByLabelText('Off')).toBeChecked();
    });

    it('collapses on save and on cancel', async () => {
        renderComponent();

        await openSection();
        await userEvent.click(screen.getByText('Save'));
        expect(screen.queryByLabelText('On')).not.toBeInTheDocument();

        await openSection();
        await userEvent.click(screen.getByText('Cancel'));
        expect(screen.queryByLabelText('On')).not.toBeInTheDocument();
    });
});
