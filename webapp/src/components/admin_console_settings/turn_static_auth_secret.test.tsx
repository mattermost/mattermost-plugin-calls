// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {fireEvent, render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import {IntlProvider} from 'react-intl';
import {Provider} from 'react-redux';
import {mockStore} from 'src/testUtils';

import TURNStaticAuthSecret from './turn_static_auth_secret';

describe('TURNStaticAuthSecret', () => {
    const baseProps = {
        id: 'TURNStaticAuthSecret',
        label: 'TURN Static Auth Secret',
        helpText: null,
        value: 'secret123',
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
                    TURNStaticAuthSecret: 'secret123',
                },
                callsConfigEnvOverrides: {},
            },
            ...storeOverrides,
        });

        return render(
            <Provider store={store}>
                <IntlProvider locale='en'>
                    <TURNStaticAuthSecret
                        {...baseProps}
                        {...props}
                    />
                </IntlProvider>
            </Provider>,
        );
    };

    it('should render correctly with default value', () => {
        renderComponent();

        expect(screen.getByText('TURN Static Auth Secret')).toBeInTheDocument();
        expect(screen.getByText('(Optional) The secret key used to generate TURN short-lived authentication credentials.')).toBeInTheDocument();

        const input = screen.getByTestId('TURNStaticAuthSecretinput');
        expect(input).toHaveValue('secret123');
    });

    it('should call onChange when input value changes', async () => {
        const onChange = jest.fn();
        renderComponent({onChange});

        const input = screen.getByTestId('TURNStaticAuthSecretinput');
        await userEvent.clear(input);
        fireEvent.change(input, {target: {value: 'newsecret456'}});

        expect(onChange).toHaveBeenCalledWith('TURNStaticAuthSecret', 'newsecret456');
    });

    it('should be disabled when disabled prop is true', () => {
        renderComponent({disabled: true});

        const input = screen.getByTestId('TURNStaticAuthSecretinput');
        expect(input).toBeDisabled();
    });

    it('should show environment override warning when setting is overridden', () => {
        renderComponent({}, {
            'plugins-com.mattermost.calls': {
                callsConfig: {
                    TURNStaticAuthSecret: 'secret123',
                },
                callsConfigEnvOverrides: {
                    TURNStaticAuthSecret: 'secret123',
                },
            },
        });

        expect(screen.getByText('This setting has been set through an environment variable. It cannot be changed through the System Console.')).toBeInTheDocument();
        expect(screen.getByTestId('TURNStaticAuthSecretinput')).toBeDisabled();
    });
});
