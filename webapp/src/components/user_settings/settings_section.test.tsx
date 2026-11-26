// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import {IntlProvider} from 'react-intl';

import {SettingsField, SettingsSectionCollapsed, SettingsSectionExpanded, useSettingsSection} from './settings_section';

function TestSection() {
    const {active, focusEdit, open, close} = useSettingsSection();

    if (!active) {
        return (
            <SettingsSectionCollapsed
                id='test'
                title='Section title'
                description='Section description.'
                focusEdit={focusEdit}
                onEdit={open}
            />
        );
    }

    return (
        <SettingsSectionExpanded
            id='test'
            title='Open title'
            onSave={close}
            onCancel={close}
        >
            <SettingsField
                label='Field label'
                labelId='fieldLabel'
                htmlFor='fieldInput'
            >
                <input id='fieldInput'/>
            </SettingsField>
        </SettingsSectionExpanded>
    );
}

describe('settings section', () => {
    const renderSection = () => render(
        <IntlProvider locale='en'>
            <TestSection/>
        </IntlProvider>,
    );

    test('lays out the collapsed row with the host classes, so Edit sits on the right', () => {
        renderSection();

        const header = screen.getByRole('heading', {name: 'Section title'}).parentElement;
        expect(header).toHaveClass('section-min__header');
        expect(header?.parentElement).toHaveClass('section-min');
        expect(screen.getByRole('button', {name: 'Section title Edit'})).toHaveClass('section-min__edit');
        expect(screen.getByText('Section description.')).toHaveClass('section-min__describe');
    });

    test('does not focus Edit on first render', () => {
        renderSection();

        expect(screen.getByRole('button', {name: 'Section title Edit'})).not.toHaveFocus();
    });

    test('opens from a click anywhere on the row', async () => {
        renderSection();

        await userEvent.click(screen.getByText('Section description.'));

        expect(screen.getByRole('heading', {name: 'Open title'})).toBeInTheDocument();
    });

    test('opens from the keyboard on Edit', async () => {
        renderSection();

        screen.getByRole('button', {name: 'Section title Edit'}).focus();
        await userEvent.keyboard('{Enter}');

        expect(screen.getByRole('heading', {name: 'Open title'})).toBeInTheDocument();
    });

    test.each(['Save', 'Cancel'])('returns focus to Edit after %s', async (action) => {
        renderSection();
        await userEvent.click(screen.getByRole('button', {name: 'Section title Edit'}));

        await userEvent.click(screen.getByRole('button', {name: action}));

        expect(screen.getByRole('button', {name: 'Section title Edit'})).toHaveFocus();
    });

    test('labels fields in the label column', async () => {
        renderSection();
        await userEvent.click(screen.getByRole('button', {name: 'Section title Edit'}));

        expect(screen.getByLabelText('Field label')).toHaveAttribute('id', 'fieldInput');
        expect(screen.getByText('Field label')).toHaveClass('CallsSettingsSection__label');
    });

    test.each([
        [false, ['col-sm-10', 'col-sm-offset-2']],
        [true, ['col-sm-12']],
    ])('uses the host content columns when isFullWidth=%s', (isFullWidth, classes) => {
        const {container} = render(
            <IntlProvider locale='en'>
                <SettingsSectionExpanded
                    id='test'
                    title='Open title'
                    isFullWidth={isFullWidth}
                    onSave={jest.fn()}
                    onCancel={jest.fn()}
                >
                    {null}
                </SettingsSectionExpanded>
            </IntlProvider>,
        );

        expect(container.querySelector('.sectionContent')).toHaveClass(...classes);
    });
});
