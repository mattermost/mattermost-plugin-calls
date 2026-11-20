// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import {IntlProvider} from 'react-intl';
import {Provider} from 'react-redux';
import {mockStore} from 'src/testUtils';

import EnableDMVideo from './enable_dm_video';

const LABEL = 'Enable video calls in direct messages';
const HELP_TEXT = 'When set to true, participants in direct messages can turn on their camera during a call.';
const OVERRIDE_TEXT = 'This setting has been set through an environment variable. It cannot be changed through the System Console.';

describe('EnableDMVideo', () => {
    const baseProps = {
        id: 'EnableDMVideo',
        label: LABEL,
        helpText: null,
        value: 'false',
        disabled: false,
        setByEnv: false,
        onChange: jest.fn(),
        saveAction: jest.fn(),
        registerSaveAction: jest.fn(),
        unRegisterSaveAction: jest.fn(),
        setSaveNeeded: jest.fn(),
        config: {},
        license: {},
        cancelSubmit: () => {},
        showConfirm: false,
    };

    const renderComponent = (props = {}, pluginState = {}) => {
        const store = mockStore({
            'plugins-com.mattermost.calls': {
                callsConfig: {
                    EnableDMVideo: false,
                },
                callsConfigEnvOverrides: {},
                ...pluginState,
            },
        });

        return render(
            <Provider store={store}>
                <IntlProvider locale='en'>
                    <EnableDMVideo
                        {...baseProps}
                        {...props}
                    />
                </IntlProvider>
            </Provider>,
        );
    };

    test('renders the label, options and help text', () => {
        renderComponent();

        expect(screen.getByText(LABEL)).toBeInTheDocument();
        expect(screen.getByText('True')).toBeInTheDocument();
        expect(screen.getByText('False')).toBeInTheDocument();
        expect(screen.getByText(HELP_TEXT)).toBeInTheDocument();
    });

    test.each([
        ['undefined', undefined], // eslint-disable-line no-undefined
        ['string false', 'false'],
        ['boolean false', false],
    ])('is off when the value is %s', (_, value) => {
        renderComponent({value});

        expect(screen.getByTestId('EnableDMVideotrue')).not.toBeChecked();
        expect(screen.getByTestId('EnableDMVideofalse')).toBeChecked();
    });

    test.each([
        ['string true', 'true'],
        ['boolean true', true],
    ])('is on when the value is %s', (_, value) => {
        renderComponent({value});

        expect(screen.getByTestId('EnableDMVideotrue')).toBeChecked();
        expect(screen.getByTestId('EnableDMVideofalse')).not.toBeChecked();
    });

    test('calls onChange with a boolean', async () => {
        const onChange = jest.fn();
        renderComponent({onChange});

        await userEvent.click(screen.getByTestId('EnableDMVideotrue'));
        expect(onChange).toHaveBeenCalledWith('EnableDMVideo', true);
    });

    test('is disabled when the disabled prop is set', () => {
        renderComponent({disabled: true});

        expect(screen.getByTestId('EnableDMVideotrue')).toBeDisabled();
        expect(screen.getByTestId('EnableDMVideofalse')).toBeDisabled();
    });

    test('uses the config value and locks the setting when set by an environment variable', () => {
        renderComponent({value: 'false'}, {
            callsConfig: {EnableDMVideo: true},
            callsConfigEnvOverrides: {EnableDMVideo: 'true'},
        });

        expect(screen.getByTestId('EnableDMVideotrue')).toBeChecked();
        expect(screen.getByTestId('EnableDMVideotrue')).toBeDisabled();
        expect(screen.getByTestId('EnableDMVideofalse')).toBeDisabled();
        expect(screen.getByText(OVERRIDE_TEXT)).toBeInTheDocument();
        expect(screen.getByRole('radiogroup')).toHaveAccessibleDescription(`${HELP_TEXT} ${OVERRIDE_TEXT}`);
    });

    test('labels the radio group and ties the help text to it', () => {
        renderComponent();

        const group = screen.getByRole('radiogroup', {name: LABEL});
        expect(group).toHaveAccessibleDescription(HELP_TEXT);
        expect(screen.getByRole('radio', {name: 'True'})).toBe(screen.getByTestId('EnableDMVideotrue'));
        expect(screen.getByRole('radio', {name: 'False'})).toBe(screen.getByTestId('EnableDMVideofalse'));
    });

    test('does not show a licence notice', () => {
        renderComponent();

        expect(screen.queryByText(/enterprise|upgrade|licen[cs]e/i)).not.toBeInTheDocument();
    });
});
