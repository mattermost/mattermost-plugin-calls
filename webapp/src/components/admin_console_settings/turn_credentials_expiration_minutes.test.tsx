// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {fireEvent, render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import {IntlProvider} from 'react-intl';
import {Provider} from 'react-redux';
import {mockStore} from 'src/testUtils';

import TURNCredentialsExpirationMinutes from './turn_credentials_expiration_minutes';

describe('TURNCredentialsExpirationMinutes', () => {
    const baseProps = {
        id: 'TURNCredentialsExpirationMinutes',
        label: 'TURN Credentials Expiration (minutes)',
        helpText: null,
        value: '60',
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

    const renderComponent = (props = {}, storeOverrides = {}) => {
        const store = mockStore({
            'plugins-com.mattermost.calls': {
                callsConfig: {
                    TURNCredentialsExpirationMinutes: 60,
                },
                callsConfigEnvOverrides: {},
            },
            ...storeOverrides,
        });

        return render(
            <Provider store={store}>
                <IntlProvider locale='en'>
                    <TURNCredentialsExpirationMinutes
                        {...baseProps}
                        {...props}
                    />
                </IntlProvider>
            </Provider>,
        );
    };

    it('should render correctly with default value', () => {
        renderComponent();

        expect(screen.getByText('TURN Credentials Expiration (minutes)')).toBeInTheDocument();
        expect(screen.getByText('(Optional) The number of minutes that the generated TURN credentials will be valid for.')).toBeInTheDocument();

        const input = screen.getByTestId('TURNCredentialsExpirationMinutesnumber');
        expect(input).toHaveValue(60);
    });

    it('should call onChange when input value changes', async () => {
        const onChange = jest.fn();
        renderComponent({onChange});

        const input = screen.getByTestId('TURNCredentialsExpirationMinutesnumber');
        await userEvent.clear(input);
        fireEvent.change(input, {target: {value: '120'}});

        expect(onChange).toHaveBeenCalledWith('TURNCredentialsExpirationMinutes', 120);
    });

    it('should be disabled when disabled prop is true', () => {
        renderComponent({disabled: true});

        const input = screen.getByTestId('TURNCredentialsExpirationMinutesnumber');
        expect(input).toBeDisabled();
    });

    it('should show environment override warning when setting is overridden', () => {
        renderComponent({}, {
            'plugins-com.mattermost.calls': {
                callsConfig: {
                    TURNCredentialsExpirationMinutes: 60,
                },
                callsConfigEnvOverrides: {
                    TURNCredentialsExpirationMinutes: '60',
                },
            },
        });

        expect(screen.getByText('This setting has been set through an environment variable. It cannot be changed through the System Console.')).toBeInTheDocument();
        expect(screen.getByTestId('TURNCredentialsExpirationMinutesnumber')).toBeDisabled();
    });

    it('should handle null value', () => {
        renderComponent({value: null});

        const input = screen.getByTestId('TURNCredentialsExpirationMinutesnumber');
        expect(input).toHaveValue(null);
    });
});
