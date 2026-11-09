// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import {IntlProvider} from 'react-intl';

import OnOffSettingsSection from './on_off_settings_section';

describe('OnOffSettingsSection', () => {
    const storageKey = 'test_on_off_setting';

    const renderComponent = (defaultValue: 'on' | 'off' = 'off') => render(
        <IntlProvider locale='en'>
            <OnOffSettingsSection
                title='Section title'
                description='Section description'
                settingTitle='Setting title'
                helpText='Help text'
                storageKey={storageKey}
                defaultValue={defaultValue}
                inputName='testSetting'
            />
        </IntlProvider>,
    );

    const openSection = async () => {
        await userEvent.click(screen.getByText('Edit'));
    };

    afterEach(() => {
        window.localStorage.removeItem(storageKey);
    });

    it('renders collapsed with title and description', () => {
        renderComponent();

        expect(screen.getByText('Section title')).toBeInTheDocument();
        expect(screen.getByText('Section description')).toBeInTheDocument();
        expect(screen.queryByLabelText('On')).not.toBeInTheDocument();
    });

    it('uses the default value when nothing is stored', async () => {
        renderComponent('on');
        await openSection();

        expect(screen.getByText('Setting title')).toBeInTheDocument();
        expect(screen.getByText('Help text')).toBeInTheDocument();
        expect(screen.getByLabelText('On')).toBeChecked();
    });

    it('writes to storage only on save', async () => {
        renderComponent();
        await openSection();

        await userEvent.click(screen.getByLabelText('On'));
        expect(window.localStorage.getItem(storageKey)).toBeNull();

        await userEvent.click(screen.getByText('Save'));
        expect(window.localStorage.getItem(storageKey)).toBe('on');
        expect(screen.queryByLabelText('On')).not.toBeInTheDocument();
    });

    it('discards the selection on cancel', async () => {
        window.localStorage.setItem(storageKey, 'off');
        renderComponent();
        await openSection();

        await userEvent.click(screen.getByLabelText('On'));
        await userEvent.click(screen.getByText('Cancel'));
        expect(window.localStorage.getItem(storageKey)).toBe('off');
        expect(screen.queryByLabelText('On')).not.toBeInTheDocument();

        await openSection();
        expect(screen.getByLabelText('Off')).toBeChecked();
    });

    it('re-reads storage when opened, picking up changes made elsewhere', async () => {
        window.localStorage.setItem(storageKey, 'off');
        renderComponent();

        window.localStorage.setItem(storageKey, 'on');
        await openSection();
        expect(screen.getByLabelText('On')).toBeChecked();

        await userEvent.click(screen.getByText('Save'));
        expect(window.localStorage.getItem(storageKey)).toBe('on');
    });
});
