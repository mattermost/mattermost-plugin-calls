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
                description='Section description.'
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

    test('renders collapsed with title and description', () => {
        renderComponent();

        expect(screen.getByText('Section title')).toBeInTheDocument();
        expect(screen.getByText('Section description.')).toBeInTheDocument();
        expect(screen.queryByLabelText('On')).not.toBeInTheDocument();
    });

    test('labels the edit button with the section title', () => {
        renderComponent();

        expect(screen.getByRole('button', {name: 'Section title Edit'})).toBeInTheDocument();
    });

    test('uses the default value when nothing is stored', async () => {
        renderComponent('on');
        await openSection();

        expect(screen.getByRole('heading', {name: 'Setting title'})).toBeInTheDocument();
        expect(screen.getByText('Help text')).toBeInTheDocument();
        expect(screen.getByLabelText('On')).toBeChecked();
    });

    test('writes to storage only on save', async () => {
        renderComponent();
        await openSection();

        await userEvent.click(screen.getByLabelText('On'));
        expect(window.localStorage.getItem(storageKey)).toBeNull();

        await userEvent.click(screen.getByText('Save'));
        expect(window.localStorage.getItem(storageKey)).toBe('on');
        expect(screen.queryByLabelText('On')).not.toBeInTheDocument();
    });

    test('discards the selection on cancel', async () => {
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

    test.each(['Save', 'Cancel'])('returns focus to Edit after %s', async (action) => {
        renderComponent();
        await openSection();

        await userEvent.click(screen.getByText(action));

        expect(screen.getByRole('button', {name: 'Section title Edit'})).toHaveFocus();
    });

    test('re-reads storage when opened, picking up changes made elsewhere', async () => {
        window.localStorage.setItem(storageKey, 'off');
        renderComponent();

        window.localStorage.setItem(storageKey, 'on');
        await openSection();
        expect(screen.getByLabelText('On')).toBeChecked();

        await userEvent.click(screen.getByText('Save'));
        expect(window.localStorage.getItem(storageKey)).toBe('on');
    });
});
