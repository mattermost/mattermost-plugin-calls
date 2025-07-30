// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {fireEvent, render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import {IntlProvider} from 'react-intl';
import {Provider} from 'react-redux';
import {mockStore} from 'src/testUtils';

import ICEHostOverride from './ice_host_override';

describe('ICEHostOverride', () => {
    const baseProps = {
        id: 'ICEHostOverride',
        label: 'ICE Host Override',
        helpText: null,
        value: '192.168.1.1',
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
                    ICEHostOverride: '192.168.1.1',
                },
                callsConfigEnvOverrides: {},
                rtcdEnabled: false,
            },
            ...storeOverrides,
        });

        return render(
            <Provider store={store}>
                <IntlProvider locale='en'>
                    <ICEHostOverride
                        {...baseProps}
                        {...props}
                    />
                </IntlProvider>
            </Provider>,
        );
    };

    it('should render correctly with default value', () => {
        renderComponent();

        expect(screen.getByText('ICE Host Override')).toBeInTheDocument();
        expect(screen.getByText('(Optional) The IP address to be used as the host ICE candidate. If empty, it defaults to resolving via STUN.')).toBeInTheDocument();

        const input = screen.getByTestId('ICEHostOverrideinput');
        expect(input).toHaveValue('192.168.1.1');
    });

    it('should call onChange when input value changes', async () => {
        const onChange = jest.fn();
        renderComponent({onChange});

        const input = screen.getByTestId('ICEHostOverrideinput');
        await userEvent.clear(input);
        fireEvent.change(input, {target: {value: '10.0.0.1'}});

        expect(onChange).toHaveBeenCalledWith('ICEHostOverride', '10.0.0.1');
    });

    it('should be disabled when disabled prop is true', () => {
        renderComponent({disabled: true});

        const input = screen.getByTestId('ICEHostOverrideinput');
        expect(input).toBeDisabled();
    });

    it('should be disabled when RTCD is enabled', () => {
        renderComponent({}, {
            'plugins-com.mattermost.calls': {
                callsConfig: {
                    ICEHostOverride: '192.168.1.1',
                },
                callsConfigEnvOverrides: {},
                rtcdEnabled: true,
            },
        });

        const input = screen.getByTestId('ICEHostOverrideinput');
        expect(input).toBeDisabled();
        expect(screen.getByText('Not applicable when', {exact: false})).toBeInTheDocument();
    });

    it('should show environment override warning when setting is overridden', () => {
        renderComponent({}, {
            'plugins-com.mattermost.calls': {
                callsConfig: {
                    ICEHostOverride: '192.168.1.1',
                },
                callsConfigEnvOverrides: {
                    ICEHostOverride: '192.168.1.1',
                },
                rtcdEnabled: false,
            },
        });

        expect(screen.getByText('This setting has been set through an environment variable. It cannot be changed through the System Console.')).toBeInTheDocument();
        expect(screen.getByTestId('ICEHostOverrideinput')).toBeDisabled();
    });
});
