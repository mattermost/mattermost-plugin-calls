// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {fireEvent, render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import {IntlProvider} from 'react-intl';
import {Provider} from 'react-redux';
import {mockStore} from 'src/testUtils';

import UDPServerAddress from './udp_server_address';

describe('UDPServerAddress', () => {
    const baseProps = {
        id: 'UDPServerAddress',
        label: 'RTC Server Address (UDP)',
        helpText: null,
        value: '0.0.0.0',
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
                    UDPServerAddress: '0.0.0.0',
                },
                callsConfigEnvOverrides: {},
                rtcdEnabled: false,
            },
            ...storeOverrides,
        });

        return render(
            <Provider store={store}>
                <IntlProvider locale='en'>
                    <UDPServerAddress
                        {...baseProps}
                        {...props}
                    />
                </IntlProvider>
            </Provider>,
        );
    };

    it('should render correctly with default value', () => {
        renderComponent();

        expect(screen.getByText('RTC Server Address (UDP)')).toBeInTheDocument();
        expect(screen.getByText('The local IP address used by the RTC server to listen on for UDP connections.')).toBeInTheDocument();

        const input = screen.getByTestId('UDPServerAddressinput');
        expect(input).toHaveValue('0.0.0.0');
    });

    it('should call onChange when input value changes', async () => {
        const onChange = jest.fn();
        renderComponent({onChange});

        const input = screen.getByTestId('UDPServerAddressinput');
        await userEvent.clear(input);
        fireEvent.change(input, {target: {value: '127.0.0.1'}});

        expect(onChange).toHaveBeenCalledWith('UDPServerAddress', '127.0.0.1');
    });

    it('should be disabled when disabled prop is true', () => {
        renderComponent({disabled: true});

        const input = screen.getByTestId('UDPServerAddressinput');
        expect(input).toBeDisabled();
    });

    it('should be disabled when RTCD is enabled', () => {
        renderComponent({}, {
            'plugins-com.mattermost.calls': {
                callsConfig: {
                    UDPServerAddress: '0.0.0.0',
                },
                callsConfigEnvOverrides: {},
                rtcdEnabled: true,
            },
        });

        const input = screen.getByTestId('UDPServerAddressinput');
        expect(input).toBeDisabled();
        expect(screen.getByText('Not applicable when', {exact: false})).toBeInTheDocument();
    });

    it('should show environment override warning when setting is overridden', () => {
        renderComponent({}, {
            'plugins-com.mattermost.calls': {
                callsConfig: {
                    UDPServerAddress: '0.0.0.0',
                },
                callsConfigEnvOverrides: {
                    UDPServerAddress: '0.0.0.0',
                },
                rtcdEnabled: false,
            },
        });

        expect(screen.getByText('This setting has been set through an environment variable. It cannot be changed through the System Console.')).toBeInTheDocument();
        expect(screen.getByTestId('UDPServerAddressinput')).toBeDisabled();
    });
});
